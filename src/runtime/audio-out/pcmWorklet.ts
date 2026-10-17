/**
 * The AudioWorklet that plays queued PCM.
 *
 * The main thread posts interleaved stereo `Float32Array` chunks; the processor drains them in
 * order. It never waits: when the queue runs dry it outputs silence and counts the underrun, and
 * it reports its state back on a slow cadence so diagnostics never cost the audio thread a
 * round trip.
 */

export const PCM_PROCESSOR_NAME = 'blink-pcm-source';

/** Messages the processor sends back. */
export interface PcmWorkletReport {
    readonly type: 'report';
    /** Frames (left/right pairs) still queued. */
    readonly queuedFrames: number;
    /** Audio frames output since the last `clear`; the silence of an underrun is not counted. */
    readonly playedFrames: number;
    readonly underruns: number;
}

/** Messages the processor accepts. */
export type PcmWorkletCommand = { readonly type: 'chunk'; readonly samples: Float32Array } | { readonly type: 'clear' };

/**
 * The worklet module body. It is serialized with `toString()` and evaluated inside the audio
 * thread, so it must stay free of anything defined outside it: no imports, no class fields, no
 * helpers a compiler might hoist.
 */
export function pcmWorkletModule(): void {
    interface Scope {
        // The property names belong to the Web Audio worklet scope.

        AudioWorkletProcessor: new () => { port: MessagePort };
        registerProcessor: (name: string, processor: unknown) => void;
    }
    const scope = globalThis as unknown as Scope;
    const REPORT_EVERY_QUANTA = 8;

    class PcmSourceProcessor extends scope.AudioWorkletProcessor {
        public chunks: Float32Array[];
        public offset: number;
        public queuedFrames: number;
        public playedFrames: number;
        public underruns: number;
        public quanta: number;
        public started: boolean;

        public constructor() {
            super();
            this.chunks = [];
            this.offset = 0;
            this.queuedFrames = 0;
            this.playedFrames = 0;
            this.underruns = 0;
            this.quanta = 0;
            this.started = false;
            this.port.onmessage = (event: MessageEvent<PcmWorkletCommand>): void => {
                const message = event.data;
                if (message.type === 'chunk') {
                    this.chunks.push(message.samples);
                    this.started = true;
                    this.queuedFrames += message.samples.length / 2;
                } else {
                    this.chunks = [];
                    this.offset = 0;
                    this.queuedFrames = 0;
                    this.playedFrames = 0;
                    this.started = false;
                }
            };
        }

        public process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
            const output = outputs[0];
            const left = output[0];
            const right = output.length > 1 ? output[1] : output[0];
            const frames = left.length;
            let written = 0;

            while (written < frames && this.chunks.length > 0) {
                const chunk = this.chunks[0];
                const available = (chunk.length - this.offset) / 2;
                const take = Math.min(frames - written, available);
                for (let i = 0; i < take; i++) {
                    left[written + i] = chunk[this.offset + i * 2];
                    right[written + i] = chunk[this.offset + i * 2 + 1];
                }
                written += take;
                this.offset += take * 2;
                if (this.offset >= chunk.length) {
                    this.chunks.shift();
                    this.offset = 0;
                }
            }

            if (written < frames) {
                left.fill(0, written);
                right.fill(0, written);
                // Silence before the first chunk is the start-up wait, not an underrun.
                if (this.started) this.underruns++;
            }
            this.queuedFrames -= written;
            this.playedFrames += written;

            this.quanta++;
            if (this.quanta % REPORT_EVERY_QUANTA === 0) {
                this.port.postMessage({
                    type: 'report',
                    queuedFrames: this.queuedFrames,
                    playedFrames: this.playedFrames,
                    underruns: this.underruns,
                });
            }
            return true;
        }
    }

    scope.registerProcessor('blink-pcm-source', PcmSourceProcessor);
}

/** Source text for `audioWorklet.addModule`. */
export const PCM_WORKLET_SOURCE = `(${pcmWorkletModule.toString()})();`;
