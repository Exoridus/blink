/** The parts of an effect that can fail without the effect's other parts having to fail with them. */
export type FaultSource = 'script' | 'ssfScript' | 'render' | 'audioOutput';

export type FaultKind =
    /** The guarded work threw. */
    | 'error'
    /** The guarded work finished, but over the time limit, repeatedly. */
    | 'stall'
    /** The work never settled. */
    | 'hang';

export interface FaultPolicy {
    /** Consecutive failures that switch the source off. */
    readonly maxConsecutiveFailures: number;
    /** A single run longer than this is a stall; null for a source that is not timed. */
    readonly stallMs: number | null;
    /** Consecutive stalls that switch the source off. */
    readonly maxConsecutiveStalls: number;
}

export interface FaultRecord {
    readonly source: FaultSource;
    readonly kind: FaultKind;
    /** The most recent message. */
    readonly message: string;
    /** Failures and stalls since the last reset, consecutive or not. */
    readonly occurrences: number;
    /** Whether the source has been switched off. A disabled source stays off until `reset()`. */
    readonly disabled: boolean;
}

export const DEFAULT_FAULT_POLICIES: Readonly<Record<FaultSource, FaultPolicy>> = {
    script: { maxConsecutiveFailures: 3, stallMs: 50, maxConsecutiveStalls: 3 },
    ssfScript: { maxConsecutiveFailures: 3, stallMs: 50, maxConsecutiveStalls: 3 },
    render: { maxConsecutiveFailures: 3, stallMs: null, maxConsecutiveStalls: 1 },
    audioOutput: { maxConsecutiveFailures: 3, stallMs: null, maxConsecutiveStalls: 1 },
};

export interface FaultGuardOptions {
    readonly now?: () => number;
    readonly policies?: Readonly<Record<FaultSource, FaultPolicy>>;
    /** Called when a source first faults, when it is switched off and when the guard is reset. */
    readonly onChange?: () => void;
}

interface SourceState {
    kind: FaultKind;
    message: string;
    occurrences: number;
    consecutiveFailures: number;
    consecutiveStalls: number;
    disabled: boolean;
}

const describeError = (error: unknown): string =>
    error instanceof Error && error.message.length > 0 ? error.message : String(error);

/**
 * Keeps a failing part of an effect from taking the frame loop down with it.
 *
 * A source that fails once is retried, because one bad frame is usually a bad input; a source
 * that fails or stalls several frames in a row is switched off and stays off, and the rest of the
 * effect keeps running. The loop cannot be interrupted while a synchronous call is running, so a
 * runaway call is only noticed after it returns: the guard bounds how often it can recur, not how
 * long one occurrence takes.
 */
export class FaultGuard {
    private readonly now: () => number;
    private readonly policies: Readonly<Record<FaultSource, FaultPolicy>>;
    private readonly onChange: (() => void) | undefined;
    private readonly states = new Map<FaultSource, SourceState>();

    public constructor(options: FaultGuardOptions = {}) {
        this.now = options.now ?? ((): number => performance.now());
        this.policies = options.policies ?? DEFAULT_FAULT_POLICIES;
        this.onChange = options.onChange;
    }

    public isDisabled(source: FaultSource): boolean {
        return this.states.get(source)?.disabled === true;
    }

    /** Runs `work` unless the source is switched off. Returns whether it ran and finished without a fault. */
    public run(source: FaultSource, work: () => void): boolean {
        if (this.isDisabled(source)) {
            return false;
        }
        const policy = this.policies[source];
        const started = this.now();
        try {
            work();
        } catch (error) {
            this.fail(source, describeError(error));
            return false;
        }
        const elapsed = this.now() - started;
        if (policy.stallMs !== null && elapsed > policy.stallMs) {
            this.stall(source, `took ${elapsed.toFixed(0)} ms, over the ${policy.stallMs} ms limit`);
            return false;
        }
        this.succeed(source);
        return true;
    }

    /** Records a failure the guard did not observe itself, such as a rejected async step. */
    public report(source: FaultSource, kind: FaultKind, message: string): void {
        if (this.isDisabled(source)) {
            return;
        }
        if (kind === 'hang') {
            // Nothing is going to settle, so waiting for a second occurrence would never end.
            this.record(source, 'hang', message);
            this.disable(source);
        } else if (kind === 'stall') {
            this.stall(source, message);
        } else {
            this.fail(source, message);
        }
    }

    /** Ends a run of consecutive failures; the record of what happened stays. */
    public succeed(source: FaultSource): void {
        const state = this.states.get(source);
        if (state !== undefined) {
            state.consecutiveFailures = 0;
            state.consecutiveStalls = 0;
        }
    }

    /** Every source that has faulted since the last reset, in the order they first did. */
    public faults(): readonly FaultRecord[] {
        return [...this.states].map(([source, state]) => ({
            source,
            kind: state.kind,
            message: state.message,
            occurrences: state.occurrences,
            disabled: state.disabled,
        }));
    }

    public reset(): void {
        const hadFaults = this.states.size > 0;
        this.states.clear();
        if (hadFaults) {
            this.onChange?.();
        }
    }

    private fail(source: FaultSource, message: string): void {
        const state = this.record(source, 'error', message);
        state.consecutiveFailures++;
        state.consecutiveStalls = 0;
        if (state.consecutiveFailures >= this.policies[source].maxConsecutiveFailures) {
            this.disable(source);
        }
    }

    private stall(source: FaultSource, message: string): void {
        const state = this.record(source, 'stall', message);
        state.consecutiveStalls++;
        state.consecutiveFailures = 0;
        if (state.consecutiveStalls >= this.policies[source].maxConsecutiveStalls) {
            this.disable(source);
        }
    }

    private record(source: FaultSource, kind: FaultKind, message: string): SourceState {
        let state = this.states.get(source);
        const first = state === undefined;
        if (state === undefined) {
            state = { kind, message, occurrences: 0, consecutiveFailures: 0, consecutiveStalls: 0, disabled: false };
            this.states.set(source, state);
        }
        state.kind = kind;
        state.message = message;
        state.occurrences++;
        if (first) {
            this.onChange?.();
        }
        return state;
    }

    private disable(source: FaultSource): void {
        const state = this.states.get(source);
        if (state !== undefined) {
            state.disabled = true;
            this.onChange?.();
        }
    }
}
