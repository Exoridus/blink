import type { PcmSink } from './BlinkAudioOutputRuntime';
import type { PcmWorkletReport } from './pcmWorklet';
import { PCM_PROCESSOR_NAME, PCM_WORKLET_SOURCE } from './pcmWorklet';

/** The slice of `AudioContext` the sink uses, so tests can supply a fake. */
export interface PcmAudioContext {
    readonly currentTime: number;
    readonly sampleRate: number;
    readonly destination: AudioNode;
    readonly audioWorklet: { addModule(url: string): Promise<void> };
}

export type WorkletNodeFactory = (context: PcmAudioContext, name: string) => AudioWorkletNode;

const defaultNodeFactory: WorkletNodeFactory = (context, name) =>
    new AudioWorkletNode(context as unknown as BaseAudioContext, name, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
    });

/** Loads the PCM processor into a context once; the module registers a global name. */
const loadedContexts = new WeakSet();

async function loadProcessor(context: PcmAudioContext): Promise<void> {
    if (loadedContexts.has(context)) return;
    const url = URL.createObjectURL(new Blob([PCM_WORKLET_SOURCE], { type: 'text/javascript' }));
    try {
        await context.audioWorklet.addModule(url);
        loadedContexts.add(context);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Plays queued PCM through an AudioWorklet into the context's output.
 *
 * The worklet reports its played-frame count about every 20 ms; between reports the sink
 * extrapolates with the context clock, so the scheduler's view of what is buffered does not
 * lag the audio thread by a whole report interval.
 */
export class WorkletPcmSink implements PcmSink {
    private readonly context: PcmAudioContext;
    private node: AudioWorkletNode | null = null;
    private reportedFrames = 0;
    private reportedAt = 0;
    private reportedUnderruns = 0;
    private started = false;

    private constructor(context: PcmAudioContext) {
        this.context = context;
    }

    public static async create(
        context: PcmAudioContext,
        factory: WorkletNodeFactory = defaultNodeFactory
    ): Promise<WorkletPcmSink> {
        await loadProcessor(context);
        const sink = new WorkletPcmSink(context);
        const node = factory(context, PCM_PROCESSOR_NAME);
        node.port.onmessage = (event: MessageEvent<PcmWorkletReport>): void => {
            if (event.data.type === 'report') {
                sink.reportedFrames = event.data.playedFrames;
                sink.reportedUnderruns = event.data.underruns;
                sink.reportedAt = context.currentTime;
            }
        };
        node.connect(context.destination);
        sink.node = node;
        return sink;
    }

    public get underruns(): number {
        return this.reportedUnderruns;
    }

    public enqueue(samples: Float32Array): void {
        if (this.node === null) return;
        if (!this.started) {
            this.started = true;
            this.reportedAt = this.context.currentTime;
        }
        this.node.port.postMessage({ type: 'chunk', samples }, [samples.buffer]);
    }

    public playedFrames(): number {
        if (!this.started) return 0;
        // Only audio the worklet has actually been handed can have played, so extrapolation is capped
        // by the caller's bookkeeping; here it simply follows the context clock from the last report.
        const elapsed = Math.max(this.context.currentTime - this.reportedAt, 0);
        return this.reportedFrames + Math.floor(elapsed * this.context.sampleRate);
    }

    public dispose(): void {
        if (this.node === null) return;
        this.node.port.postMessage({ type: 'clear' });
        this.node.disconnect();
        this.node.port.onmessage = null;
        this.node = null;
    }
}
