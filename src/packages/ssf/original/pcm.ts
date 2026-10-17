import { f } from './math';

/** Portable linear source-rate conversion, explicitly outside the native SSF DSP profile. */
export class SsfPcmResampler {
    private inputOffset = 0;
    private outputIndex = 0;
    private previous = 0;

    public constructor(private readonly inputRate: number) {
        if (!Number.isFinite(inputRate) || inputRate <= 0) throw new RangeError('Invalid PCM sample rate');
    }

    public process(input: Float32Array): Float32Array {
        if (this.inputRate === 44100) return new Float32Array(input);
        const result: number[] = [];
        const end = this.inputOffset + input.length;
        while (true) {
            const position = (this.outputIndex * this.inputRate) / 44100;
            const index = Math.floor(position);
            const fraction = position - index;
            if (index + (fraction > 0 ? 1 : 0) >= end) break;
            const local = index - this.inputOffset;
            const left = local === -1 ? this.previous : input[local];
            const right = fraction === 0 ? left : input[local + 1];
            result.push(f(left + fraction * (right - left)));
            this.outputIndex++;
        }
        if (input.length > 0) this.previous = input[input.length - 1];
        this.inputOffset = end;
        return new Float32Array(result);
    }
}

export const SSF_PCM_WORKLET = `class SsfPcmTap extends AudioWorkletProcessor {
  constructor() { super(); this.samples = new Float32Array(512); this.position = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let mono = 0;
      for (let channel = 0; channel < channels.length; channel++) mono += channels[channel][i];
      this.samples[this.position++] = mono / channels.length;
      if (this.position === 512) {
        this.port.postMessage(this.samples, [this.samples.buffer]);
        this.samples = new Float32Array(512); this.position = 0;
      }
    }
    return true;
  }
}
registerProcessor('blink-ssf-pcm-tap', SsfPcmTap);`;

const loaded = new WeakSet<AudioContext>();

/** Lazy capture; disconnect only this tap, never the caller's existing audio routes. */
export async function captureSsfPcm(
    context: AudioContext,
    source: MediaStream | AudioNode | null,
    listener: (samples: Float32Array) => void
): Promise<() => void> {
    if (source === null) return () => {};
    if (!loaded.has(context)) {
        const url = URL.createObjectURL(new Blob([SSF_PCM_WORKLET], { type: 'text/javascript' }));
        try {
            await context.audioWorklet.addModule(url);
            loaded.add(context);
        } finally {
            URL.revokeObjectURL(url);
        }
    }
    const node = new AudioWorkletNode(context, 'blink-ssf-pcm-tap');
    const adapter = new SsfPcmResampler(context.sampleRate);
    const input = source instanceof MediaStream ? context.createMediaStreamSource(source) : source;
    const muted = context.createGain();
    muted.gain.value = 0;
    node.port.onmessage = (event: MessageEvent<Float32Array>): void => {
        listener(adapter.process(event.data));
    };
    input.connect(node);
    node.connect(muted);
    muted.connect(context.destination);
    return () => {
        input.disconnect(node);
        node.disconnect();
        muted.disconnect();
        node.port.onmessage = null;
        node.port.close();
    };
}
