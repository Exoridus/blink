import { describe, expect, it } from 'vitest';

import type { AudioBlockSource, PcmSink } from '../BlinkAudioOutputRuntime';
import { BlinkAudioOutputRuntime } from '../BlinkAudioOutputRuntime';
import {
    AUDIO_BLOCK_HEIGHT,
    AUDIO_BLOCK_SAMPLES,
    AUDIO_BLOCK_WIDTH,
    buildAudioShader,
    NATIVE_AUDIO_ABI,
    SHADERTOY_AUDIO_ABI,
} from '../buildAudioShader';
import type { PcmWorkletCommand } from '../pcmWorklet';
import { PCM_WORKLET_SOURCE, pcmWorkletModule } from '../pcmWorklet';

describe('buildAudioShader', () => {
    it('wraps a blink-audio/1 program so every pixel is one sample of the block', () => {
        const shader = buildAudioShader(
            'vec2 renderSound(float t, int i) { return vec2(sin(t)); }',
            NATIVE_AUDIO_ABI,
            []
        );

        expect(shader).toContain('#version 300 es');
        expect(shader).toContain('uniform float bl_audioSampleRate;');
        expect(shader).toContain('uniform int bl_audioBlockStart;');
        expect(shader).toContain(`int row = ${AUDIO_BLOCK_HEIGHT - 1} - pixel.y;`);
        expect(shader).toContain(`int index = bl_audioBlockStart + row * ${AUDIO_BLOCK_WIDTH} + pixel.x;`);
        expect(shader).toContain('vec2 sound = renderSound(t, index);');
        expect(shader.indexOf('vec2 renderSound')).toBeLessThan(shader.indexOf('void main()'));
    });

    it('calls a Shadertoy mainSound with the index first', () => {
        const shader = buildAudioShader(
            'vec2 mainSound(int samp, float time) { return vec2(0.0); }',
            SHADERTOY_AUDIO_ABI,
            []
        );
        expect(shader).toContain('vec2 sound = mainSound(index, t);');
    });

    it('keeps NaN and out-of-range values away from the output', () => {
        const shader = buildAudioShader('vec2 renderSound(float t, int i) { return vec2(0.0); }', NATIVE_AUDIO_ABI, []);
        expect(shader).toContain('clamp(sound, -1.0, 1.0)');
        expect(shader).toContain('isnan(sound)');
    });

    it('refuses an ABI it does not know', () => {
        expect(() => buildAudioShader('', 'mystery/9', [])).toThrow(/not supported/);
    });

    it('declares the package controls ahead of the program', () => {
        const shader = buildAudioShader('vec2 renderSound(float t, int i) { return vec2(pitch); }', NATIVE_AUDIO_ABI, [
            {
                name: 'pitch',
                type: 'float',
                default: 440,
                min: 20,
                max: 2000,
                step: null,
                label: null,
                description: null,
                group: null,
            },
        ]);
        expect(shader.indexOf('uniform float pitch;')).toBeLessThan(shader.indexOf('vec2 renderSound'));
    });
});

class FakeSink implements PcmSink {
    public readonly chunks: Float32Array[] = [];
    public played = 0;
    public underruns = 0;
    public disposed = false;
    public enqueue(samples: Float32Array): void {
        this.chunks.push(samples);
    }
    public playedFrames(): number {
        return this.played;
    }
    public dispose(): void {
        this.disposed = true;
    }
}

function manualSource(): AudioBlockSource<number> & {
    calls: number[];
    resolve: (index: number) => void;
    reject: (index: number) => void;
} {
    const waiting: { resolve: (value: Float32Array) => void; reject: () => void }[] = [];
    const calls: number[] = [];
    return {
        calls,
        render: (_context, start) =>
            new Promise((resolve, reject) => {
                calls.push(start);
                waiting.push({ resolve, reject: () => reject(new Error('gpu lost')) });
            }),
        resolve: index => waiting[index].resolve(new Float32Array(AUDIO_BLOCK_SAMPLES * 2)),
        reject: index => waiting[index].reject(),
    };
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('BlinkAudioOutputRuntime', () => {
    const rate = 48_000;

    it('asks for consecutive blocks on an absolute sample index, one at a time', async () => {
        const source = manualSource();
        const sink = new FakeSink();
        const runtime = new BlinkAudioOutputRuntime({ source, sink, sampleRate: rate, targetBufferSeconds: 1 });

        runtime.pump(0);
        runtime.pump(0);
        expect(source.calls).toEqual([0]);

        source.resolve(0);
        await flush();
        runtime.pump(0);
        expect(source.calls).toEqual([0, AUDIO_BLOCK_SAMPLES]);
        expect(sink.chunks).toHaveLength(1);
    });

    it('stops requesting once the target is buffered and resumes as playback drains it', async () => {
        const source = manualSource();
        const sink = new FakeSink();
        const runtime = new BlinkAudioOutputRuntime({
            source,
            sink,
            sampleRate: rate,
            targetBufferSeconds: AUDIO_BLOCK_SAMPLES / rate,
        });

        runtime.pump(0);
        source.resolve(0);
        await flush();

        runtime.pump(0);
        expect(source.calls).toHaveLength(1);

        sink.played = AUDIO_BLOCK_SAMPLES / 2;
        runtime.pump(0);
        expect(source.calls).toHaveLength(2);
    });

    it('hands blocks to the sink in request order even when they finish out of order', async () => {
        const source = manualSource();
        const sink = new FakeSink();
        const runtime = new BlinkAudioOutputRuntime({
            source,
            sink,
            sampleRate: rate,
            targetBufferSeconds: 10,
            maxInFlight: 3,
        });

        runtime.pump(0);
        runtime.pump(0);
        runtime.pump(0);
        runtime.pump(0);
        expect(source.calls).toEqual([0, AUDIO_BLOCK_SAMPLES, AUDIO_BLOCK_SAMPLES * 2]);

        source.resolve(2);
        source.resolve(1);
        await flush();
        expect(sink.chunks).toHaveLength(0);

        source.resolve(0);
        await flush();
        expect(sink.chunks).toHaveLength(3);
    });

    it('skips a failed block instead of shifting the timeline, and counts it', async () => {
        const source = manualSource();
        const runtime = new BlinkAudioOutputRuntime({
            source,
            sink: new FakeSink(),
            sampleRate: rate,
            targetBufferSeconds: 10,
        });

        runtime.pump(0);
        source.reject(0);
        await flush();
        runtime.pump(0);

        expect(source.calls).toEqual([0, AUDIO_BLOCK_SAMPLES]);
        expect(runtime.stats().failures).toBe(1);
    });

    it('stops asking a source that keeps failing, and says so', async () => {
        const source = manualSource();
        const runtime = new BlinkAudioOutputRuntime({
            source,
            sink: new FakeSink(),
            sampleRate: rate,
            targetBufferSeconds: 10,
            maxConsecutiveFailures: 2,
        });

        runtime.pump(0);
        source.reject(0);
        await flush();
        runtime.pump(0);
        source.reject(1);
        await flush();
        runtime.pump(0);

        expect(source.calls).toHaveLength(2);
        expect(runtime.stats()).toMatchObject({ halted: true, failures: 2 });
    });

    it('keeps going while failures are not consecutive', async () => {
        const source = manualSource();
        const runtime = new BlinkAudioOutputRuntime({
            source,
            sink: new FakeSink(),
            sampleRate: rate,
            targetBufferSeconds: 10,
            maxConsecutiveFailures: 2,
        });

        for (const outcome of ['reject', 'resolve', 'reject', 'resolve'] as const) {
            runtime.pump(0);
            source[outcome](source.calls.length - 1);
            await flush();
        }

        expect(runtime.stats().halted).toBe(false);
        expect(source.calls).toHaveLength(4);
    });

    it('turns a source that throws before returning into a failed block', async () => {
        const throwing: AudioBlockSource<number> = {
            render: () => {
                throw new Error('no context');
            },
        };
        const runtime = new BlinkAudioOutputRuntime({
            source: throwing,
            sink: new FakeSink(),
            sampleRate: rate,
            targetBufferSeconds: 10,
        });

        expect(() => runtime.pump(0)).not.toThrow();
        await flush();

        expect(runtime.stats()).toMatchObject({ failures: 1, lastFailure: 'no context' });
    });

    it('drops a block that lands after dispose, and releases the sink and the source', async () => {
        const source = manualSource();
        const sink = new FakeSink();
        let released = false;
        const runtime = new BlinkAudioOutputRuntime({
            source,
            sink,
            sampleRate: rate,
            release: () => (released = true),
        });

        runtime.pump(0);
        runtime.dispose();
        source.resolve(0);
        await flush();

        expect(sink.chunks).toHaveLength(0);
        expect(sink.disposed).toBe(true);
        expect(released).toBe(true);

        runtime.pump(0);
        expect(source.calls).toHaveLength(1);
    });

    it('reports buffered time and underruns', async () => {
        const source = manualSource();
        const sink = new FakeSink();
        const runtime = new BlinkAudioOutputRuntime({ source, sink, sampleRate: rate, targetBufferSeconds: 1 });

        runtime.pump(0);
        source.resolve(0);
        await flush();
        sink.played = 1000;
        sink.underruns = 3;

        expect(runtime.stats()).toMatchObject({
            sampleRate: rate,
            blocksRendered: 1,
            framesGenerated: AUDIO_BLOCK_SAMPLES,
            underruns: 3,
            targetBufferSeconds: 1,
        });
        expect(runtime.stats().bufferedSeconds).toBeCloseTo((AUDIO_BLOCK_SAMPLES - 1000) / rate);
    });
});

describe('pcm worklet', () => {
    /** Runs the serialized module the way the audio thread does, against a stand-in global scope. */
    function load() {
        interface Processor {
            port: {
                onmessage: ((event: { data: PcmWorkletCommand }) => void) | null;
                postMessage: (message: unknown) => void;
            };
            process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
        }
        const posted: unknown[] = [];
        let ctor: (new () => Processor) | undefined;
        class FakeProcessor {
            public port = {
                onmessage: null as ((event: { data: PcmWorkletCommand }) => void) | null,
                postMessage: (message: unknown) => posted.push(message),
            };
        }
        const scope = {
            AudioWorkletProcessor: FakeProcessor,
            registerProcessor: (_name: string, processor: new () => Processor) => {
                ctor = processor;
            },
        };
        // eslint-disable-next-line no-new-func -- evaluating the worklet source is the test
        new Function('globalThis', PCM_WORKLET_SOURCE)(scope);
        const processor = new ctor!();
        const send = (message: PcmWorkletCommand): void => processor.port.onmessage?.({ data: message });
        const quantum = (frames = 4): Float32Array[][] => [[new Float32Array(frames), new Float32Array(frames)]];
        return { processor, send, quantum, posted };
    }

    it('is self-contained text that registers its processor', () => {
        expect(PCM_WORKLET_SOURCE.startsWith('(')).toBe(true);
        expect(pcmWorkletModule.toString()).not.toContain('import(');
        expect(() => load()).not.toThrow();
    });

    it('plays queued chunks in order across quantum boundaries', () => {
        const { processor, send, quantum } = load();
        send({ type: 'chunk', samples: new Float32Array([1, -1, 2, -2, 3, -3]) });
        send({ type: 'chunk', samples: new Float32Array([4, -4, 5, -5]) });

        const first = quantum(4);
        processor.process([], first);
        expect([...first[0][0]]).toEqual([1, 2, 3, 4]);
        expect([...first[0][1]]).toEqual([-1, -2, -3, -4]);

        const second = quantum(4);
        processor.process([], second);
        expect([...second[0][0]]).toEqual([5, 0, 0, 0]);
    });

    it('outputs silence and counts an underrun only once playback has started', () => {
        const { processor, send, quantum, posted } = load();

        processor.process([], quantum());
        send({ type: 'chunk', samples: new Float32Array([1, 1, 1, 1]) });
        processor.process([], quantum(4));
        processor.process([], quantum(4));
        for (let i = 0; i < 8; i++) processor.process([], quantum(4));

        const report = posted.at(-1) as { underruns: number; playedFrames: number; queuedFrames: number };
        expect(report.underruns).toBe(7);
        expect(report.playedFrames).toBe(2);
        expect(report.queuedFrames).toBe(0);
    });

    it('forgets its queue on clear', () => {
        const { processor, send, quantum } = load();
        send({ type: 'chunk', samples: new Float32Array([9, 9, 9, 9]) });
        send({ type: 'clear' });

        const out = quantum(2);
        processor.process([], out);
        expect([...out[0][0]]).toEqual([0, 0]);
    });
});
