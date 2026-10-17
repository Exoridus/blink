/** The CPU-side stages of one frame. A stage's time excludes any stage measured inside it. */
export type FrameStage = 'update' | 'script' | 'passes' | 'audioOutput';

export const FRAME_STAGES: readonly FrameStage[] = ['update', 'script', 'passes', 'audioOutput'];

/** Milliseconds a frame, and each stage of it, is expected to stay under. */
export interface FrameBudget {
    /** CPU time of the whole frame: the sum of the stages. */
    readonly frame: number;
    readonly stages: Readonly<Record<FrameStage, number>>;
    /** GPU time of a frame, where the device has a hardware timer. */
    readonly gpu: number;
}

/**
 * The stages are CPU time: building and submitting a frame, not the GPU executing it. The GPU
 * figure is a hardware measurement and exists only where the device exposes a timer; elsewhere
 * the report says it is unavailable rather than estimating it.
 */
export const DEFAULT_FRAME_BUDGET: FrameBudget = {
    frame: 12,
    stages: { update: 5, script: 4, passes: 6, audioOutput: 2 },
    gpu: 12,
};

export interface StageTiming {
    readonly meanMs: number;
    readonly p95Ms: number;
    readonly maxMs: number;
    readonly budgetMs: number;
    /** Frames in the window whose time exceeded the budget. */
    readonly overBudgetFrames: number;
}

export interface FrameTimeReport {
    /** Frames the statistics cover, at most the window size. */
    readonly frames: number;
    readonly frame: StageTiming;
    readonly stages: Readonly<Record<FrameStage, StageTiming>>;
    /** Hardware GPU time per frame; null until the device has delivered a measurement. */
    readonly gpu: StageTiming | null;
}

export interface FrameTimeMonitorOptions {
    readonly now?: () => number;
    readonly windowFrames?: number;
    readonly budget?: FrameBudget;
}

const DEFAULT_WINDOW_FRAMES = 120;

class Window {
    private readonly values: Float64Array;
    private count = 0;
    private next = 0;

    public constructor(size: number) {
        this.values = new Float64Array(size);
    }

    public get length(): number {
        return this.count;
    }

    public push(value: number): void {
        this.values[this.next] = value;
        this.next = (this.next + 1) % this.values.length;
        this.count = Math.min(this.count + 1, this.values.length);
    }

    public clear(): void {
        this.count = 0;
        this.next = 0;
    }

    public timing(budgetMs: number): StageTiming {
        if (this.count === 0) {
            return { meanMs: 0, p95Ms: 0, maxMs: 0, budgetMs, overBudgetFrames: 0 };
        }
        // Once the window has wrapped every slot is live, so the first `count` slots are always the window.
        const sorted = [...this.values.subarray(0, this.count)].sort((a, b) => a - b);
        const sum = sorted.reduce((total, value) => total + value, 0);
        return {
            meanMs: sum / sorted.length,
            p95Ms: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
            maxMs: sorted[sorted.length - 1],
            budgetMs,
            overBudgetFrames: sorted.filter(value => value > budgetMs).length,
        };
    }
}

/**
 * Measures how long each stage of a frame takes on the CPU and checks the totals against a
 * budget over a sliding window of recent frames.
 *
 * Stages may nest: the inner stage's time is taken out of the outer one, so the stage times of a
 * frame add up to its total and no work is counted twice.
 */
export class FrameTimeMonitor {
    private readonly now: () => number;
    private readonly budget: FrameBudget;
    private readonly frameWindow: Window;
    private readonly stageWindows: Record<FrameStage, Window>;
    private readonly gpuWindow: Window;
    private lastGpuMs: number | null = null;
    private readonly current: Record<FrameStage, number> = { update: 0, script: 0, passes: 0, audioOutput: 0 };
    /** Time already attributed to inner stages, one entry per stage currently being measured. */
    private readonly childTime: number[] = [];

    public constructor(options: FrameTimeMonitorOptions = {}) {
        const size = options.windowFrames ?? DEFAULT_WINDOW_FRAMES;
        this.now = options.now ?? ((): number => performance.now());
        this.budget = options.budget ?? DEFAULT_FRAME_BUDGET;
        this.frameWindow = new Window(size);
        this.gpuWindow = new Window(size);
        this.stageWindows = {
            update: new Window(size),
            script: new Window(size),
            passes: new Window(size),
            audioOutput: new Window(size),
        };
    }

    /** Runs `work` and charges its own time (inner stages excluded) to `stage` in the current frame. */
    public measure<T>(stage: FrameStage, work: () => T): T {
        const started = this.now();
        this.childTime.push(0);
        try {
            return work();
        } finally {
            const elapsed = this.now() - started;
            const inner = this.childTime.pop() ?? 0;
            this.current[stage] += Math.max(elapsed - inner, 0);
            if (this.childTime.length > 0) {
                this.childTime[this.childTime.length - 1] += elapsed;
            }
        }
    }

    /**
     * Takes the device's latest GPU frame time. Results arrive a frame or more late and the same
     * value is offered again until the next one lands, so only a value that differs from the one
     * before it counts as a new measurement; a null (no timer, or no result yet) counts as none.
     */
    public recordGpu(milliseconds: number | null): void {
        if (milliseconds === null || milliseconds === this.lastGpuMs) {
            return;
        }
        this.lastGpuMs = milliseconds;
        this.gpuWindow.push(milliseconds);
    }

    /** Closes the current frame: its stage times enter the window and the accumulators restart. */
    public endFrame(): void {
        let total = 0;
        for (const stage of FRAME_STAGES) {
            this.stageWindows[stage].push(this.current[stage]);
            total += this.current[stage];
            this.current[stage] = 0;
        }
        this.frameWindow.push(total);
    }

    public report(): FrameTimeReport {
        const timing = (stage: FrameStage): StageTiming => this.stageWindows[stage].timing(this.budget.stages[stage]);
        const stages: Record<FrameStage, StageTiming> = {
            update: timing('update'),
            script: timing('script'),
            passes: timing('passes'),
            audioOutput: timing('audioOutput'),
        };
        return {
            frames: this.frameWindow.length,
            frame: this.frameWindow.timing(this.budget.frame),
            stages,
            gpu: this.gpuWindow.length === 0 ? null : this.gpuWindow.timing(this.budget.gpu),
        };
    }

    public reset(): void {
        this.frameWindow.clear();
        this.gpuWindow.clear();
        // Kept: the device offers the last measurement of the old effect again until a new one
        // lands, and that value must not open the new effect's window.
        for (const stage of FRAME_STAGES) {
            this.stageWindows[stage].clear();
            this.current[stage] = 0;
        }
        this.childTime.length = 0;
    }
}
