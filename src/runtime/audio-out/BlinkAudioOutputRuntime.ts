import { AUDIO_BLOCK_SAMPLES } from './buildAudioShader';

/**
 * Where a block of PCM comes from. `context` is whatever the host needs to produce one: for the
 * GPU renderer it is the frame's rendering context, because a block can only be drawn while a
 * frame is being built.
 */
export interface AudioBlockSource<Context> {
    /** Renders `AUDIO_BLOCK_SAMPLES` stereo frames starting at the absolute sample `startSample`, interleaved. */
    render(context: Context, startSample: number): Promise<Float32Array>;
}

/** Where PCM goes: a queue that something else drains in real time. */
export interface PcmSink {
    /** Takes ownership of an interleaved stereo chunk. */
    enqueue(samples: Float32Array): void;
    /** How many frames the sink has played by now, including the time since its last report. */
    playedFrames(): number;
    readonly underruns: number;
    dispose(): void;
}

export interface AudioOutputOptions<Context> {
    readonly source: AudioBlockSource<Context>;
    readonly sink: PcmSink;
    readonly sampleRate: number;
    /** How much generated audio to keep ahead of playback. Defaults to a quarter of a second. */
    readonly targetBufferSeconds?: number;
    /**
     * How many blocks may be rendering at once. A readback takes more than a frame on a slow GPU, so
     * a single block in flight caps generation below real time there; blocks still reach the sink in
     * order. Defaults to one.
     */
    readonly maxInFlight?: number;
    /** Releases whatever backs the source, once generation has stopped. */
    readonly release?: () => void;
    /**
     * Blocks that may fail in a row before generation stops for good. A source that keeps failing
     * would otherwise be asked for a new block every frame, forever. Defaults to five.
     */
    readonly maxConsecutiveFailures?: number;
}

export interface AudioOutputStats {
    readonly sampleRate: number;
    readonly blocksRendered: number;
    readonly framesGenerated: number;
    /** Generated audio not yet played, in seconds. */
    readonly bufferedSeconds: number;
    readonly targetBufferSeconds: number;
    readonly underruns: number;
    readonly failures: number;
    /** Whether generation stopped because the source kept failing; the sink then plays out what is queued. */
    readonly halted: boolean;
    /** The message of the most recent failed block, or null. */
    readonly lastFailure: string | null;
    /** The first 64 stereo frames ever generated, interleaved, for checking the output against an oracle. */
    readonly head: readonly number[];
}

const DEFAULT_TARGET_BUFFER_SECONDS = 0.25;
const MAX_BLOCKS_PER_PUMP = 3;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Keeps a bounded amount of generated PCM queued ahead of playback.
 *
 * Audio is generated against an absolute, monotonically increasing sample index, independent of
 * the visual frame rate: `pump` is called from the frame loop only because that is where the GPU
 * is reachable, and it asks for at most one block per call. Anything already
 * queued is immutable, so a control change is heard after the buffered audio drains - the
 * latency is `targetBufferSeconds`, and it is reported rather than hidden.
 */
export class BlinkAudioOutputRuntime<Context> {
    private readonly options: AudioOutputOptions<Context>;
    private nextSample = 0;
    private issued = 0;
    private enqueued = 0;
    /** Finished blocks by sequence number; null marks one that failed and is skipped. */
    private readonly finished = new Map<number, Float32Array | null>();
    private disposed = false;
    private blocksRendered = 0;
    private failures = 0;
    private consecutiveFailures = 0;
    private isHalted = false;
    private lastFailure: string | null = null;
    private head: readonly number[] = [];

    public constructor(options: AudioOutputOptions<Context>) {
        this.options = options;
    }

    /**
     * Requests blocks while playback is closer to running dry than the target allows, at most
     * `MAX_BLOCKS_PER_PUMP` per call so one slow frame cannot queue unbounded GPU work.
     */
    public pump(context: Context): void {
        for (let count = 0; count < MAX_BLOCKS_PER_PUMP && this.issueBlock(context); count++) {
            // Each call issues one block until the buffer is full or the in-flight limit is reached.
        }
    }

    private issueBlock(context: Context): boolean {
        if (this.disposed || this.isHalted || this.issued - this.enqueued >= (this.options.maxInFlight ?? 1)) {
            return false;
        }
        const target = this.options.targetBufferSeconds ?? DEFAULT_TARGET_BUFFER_SECONDS;
        if (this.bufferedFrames() >= target * this.options.sampleRate) {
            return false;
        }

        const startSample = this.nextSample;
        const sequence = this.issued++;
        this.nextSample += AUDIO_BLOCK_SAMPLES;

        let rendering: Promise<Float32Array>;
        try {
            rendering = this.options.source.render(context, startSample);
        } catch (error) {
            // A source that throws before returning would leave this sequence number open forever, and
            // every later block would wait behind it.
            rendering = Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
        rendering.then(
            samples => {
                this.consecutiveFailures = 0;
                this.finish(sequence, samples);
            },
            (error: unknown) => {
                this.lastFailure = error instanceof Error ? error.message : String(error);
                this.failures++;
                this.consecutiveFailures++;
                if (
                    this.consecutiveFailures >=
                    (this.options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES)
                ) {
                    this.isHalted = true;
                }
                // The block's samples are skipped: playing the next block in their place would shift
                // every later sample, while leaving the gap keeps the timeline honest.
                this.finish(sequence, null);
            }
        );
        return true;
    }

    /** Hands finished blocks to the sink strictly in the order they were requested. */
    private finish(sequence: number, samples: Float32Array | null): void {
        this.finished.set(sequence, samples);
        while (this.finished.has(this.enqueued)) {
            const block = this.finished.get(this.enqueued) ?? null;
            this.finished.delete(this.enqueued);
            this.enqueued++;
            if (block !== null && !this.disposed) {
                if (this.blocksRendered === 0) this.head = [...block.subarray(0, 128)];
                this.blocksRendered++;
                this.options.sink.enqueue(block);
            }
        }
    }

    /** Whether generation stopped because the source kept failing. */
    public get halted(): boolean {
        return this.isHalted;
    }

    public stats(): AudioOutputStats {
        return {
            sampleRate: this.options.sampleRate,
            blocksRendered: this.blocksRendered,
            framesGenerated: this.blocksRendered * AUDIO_BLOCK_SAMPLES,
            bufferedSeconds: this.bufferedFrames() / this.options.sampleRate,
            targetBufferSeconds: this.options.targetBufferSeconds ?? DEFAULT_TARGET_BUFFER_SECONDS,
            underruns: this.options.sink.underruns,
            failures: this.failures,
            halted: this.isHalted,
            lastFailure: this.lastFailure,
            head: this.head,
        };
    }

    /** Stops generation, drops anything still in flight and releases the sink. */
    public dispose(): void {
        this.disposed = true;
        this.options.sink.dispose();
        this.options.release?.();
    }

    /** Frames generated or requested but not yet played. */
    private bufferedFrames(): number {
        return Math.max(this.nextSample - this.options.sink.playedFrames(), 0);
    }
}
