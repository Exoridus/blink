import type { BlinkAudioFrame } from '../audio/BlinkAudioFrame';
import type { BlinkScriptEventBinding } from '../ir/types';
import { matchesEventTransition } from './eventTransitions';
import type {
    BlinkScriptContext,
    BlinkScriptControlValue,
    BlinkScriptEventHandler,
    BlinkScriptModule,
    BlinkScriptModuleFactory,
    ScriptControlSurface,
    ScriptFrameInput,
    ScriptFrameResult,
    ScriptInitContext,
    ScriptRuntime,
    ScriptTimeSnapshot,
} from './types';

/** The only script ABI this runtime executes; anything else is a load error (format spec section 21). */
export const BLINK_SCRIPT_ABI = 'blink/1';

export interface BlinkScriptRuntimeSpec {
    readonly abi: string;
    readonly events: readonly BlinkScriptEventBinding[];
    readonly module: BlinkScriptModuleFactory;
}

function buildContext(
    controls: ScriptControlSurface,
    time: ScriptTimeSnapshot,
    audio: BlinkAudioFrame
): BlinkScriptContext {
    return { controls, time, audio };
}

function resolveEventHandler(module: BlinkScriptModule, name: string): BlinkScriptEventHandler {
    const candidate: unknown = module[name];
    if (typeof candidate !== 'function') {
        throw new Error(`BlinkScriptRuntime: event handler "${name}" is not exported by the script module`);
    }
    return candidate as BlinkScriptEventHandler;
}

/**
 * Executes a `blink/1` script module against its host lifecycle: `setup`
 * once at init, `update` once per frame, `dispose` at teardown, plus the
 * manifest-declared event bindings evaluated each frame.
 *
 * Runs on the main thread. The format spec ties the ABI to observable
 * behavior, not an execution thread; the worker isolation the integration
 * architecture prefers for `blink/1` is out of scope for this runtime and is
 * left to a future host that constructs it inside that worker instead.
 */
export class BlinkScriptRuntime implements ScriptRuntime {
    private readonly spec: BlinkScriptRuntimeSpec;
    private readonly previousEventValues = new Map<string, BlinkScriptControlValue>();
    private module: BlinkScriptModule | null = null;
    private controls: ScriptControlSurface | null = null;
    private lastAudio: BlinkAudioFrame | null = null;

    public constructor(spec: BlinkScriptRuntimeSpec) {
        this.spec = spec;
    }

    public async init(context: ScriptInitContext): Promise<void> {
        if (this.spec.abi !== BLINK_SCRIPT_ABI) {
            throw new Error(`BlinkScriptRuntime: unrecognized script ABI "${this.spec.abi}"`);
        }

        const module = await this.spec.module();
        const ctx = buildContext(context.controls, { elapsed: 0, delta: 0, frame: 0 }, context.audio);
        await module.setup?.(ctx);

        // Commit state only after setup succeeds, so a failed init leaves the
        // runtime in the same "never initialized" state it started in rather
        // than one that runs frames against a module that failed to start.
        this.module = module;
        this.controls = context.controls;
        this.lastAudio = context.audio;
        for (const binding of this.spec.events) {
            if (!this.previousEventValues.has(binding.input)) {
                this.previousEventValues.set(binding.input, context.controls.get(binding.input));
            }
        }
    }

    public async runFrame(frameInput: ScriptFrameInput): Promise<ScriptFrameResult> {
        const module = this.module;
        const controls = frameInput.controls ?? this.controls;
        if (module === null || controls === null) {
            throw new Error('BlinkScriptRuntime: runFrame called before a successful init');
        }

        this.lastAudio = frameInput.audio;
        const time: ScriptTimeSnapshot = { elapsed: frameInput.elapsed, delta: frameInput.dt, frame: frameInput.frame };
        const ctx = buildContext(controls, time, frameInput.audio);

        // A throwing update or event handler must not wedge the host's frame
        // loop: the failure is reported on the result instead of rejecting, so
        // the caller keeps driving frames after a bad one.
        try {
            await this.dispatchEvents(ctx, module);
            await module.update?.(ctx, frameInput.dt);
            return { ok: true, error: null };
        } catch (error) {
            return { ok: false, error };
        }
    }

    public async dispose(): Promise<void> {
        const module = this.module;
        if (module === null || this.controls === null || this.lastAudio === null) {
            return;
        }

        const ctx = buildContext(this.controls, { elapsed: 0, delta: 0, frame: 0 }, this.lastAudio);
        this.module = null;
        this.controls = null;
        this.lastAudio = null;
        await module.dispose?.(ctx);
    }

    /**
     * Evaluates every event binding against the control values observed since
     * the previous frame.
     *
     * Commits the new values before invoking any handler, so a handler that
     * throws cannot corrupt the next frame's transition detection into a
     * repeated or missed edge.
     */
    private async dispatchEvents(ctx: BlinkScriptContext, module: BlinkScriptModule): Promise<void> {
        if (this.spec.events.length === 0) {
            return;
        }

        const current = new Map<string, BlinkScriptControlValue>();
        const previous = new Map<string, BlinkScriptControlValue>();
        for (const binding of this.spec.events) {
            if (current.has(binding.input)) {
                continue;
            }
            const value = ctx.controls.get(binding.input);
            current.set(binding.input, value);
            previous.set(binding.input, this.previousEventValues.get(binding.input) ?? value);
        }
        for (const [input, value] of current) {
            this.previousEventValues.set(input, value);
        }

        for (const binding of this.spec.events) {
            const currentValue = current.get(binding.input);
            const previousValue = previous.get(binding.input);
            if (currentValue === undefined || previousValue === undefined) {
                continue;
            }
            if (!matchesEventTransition(binding.on, previousValue, currentValue)) {
                continue;
            }
            const handler = resolveEventHandler(module, binding.handler);
            await handler(ctx, currentValue, previousValue);
        }
    }
}
