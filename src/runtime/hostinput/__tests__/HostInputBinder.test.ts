import { DataTexture, Texture, TextureFormat } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import type { BlinkHostInputSpec } from '../../ir/types';
import { DEFAULT_AUDIO_SAMPLES, type HostAudioSource, HostInputBinder } from '../HostInputBinder';

class FakeAudioSource implements HostAudioSource {
    public readonly decibelRange = { min: -90, max: 0 };
    public wave: Float32Array | null = null;
    public spectrum: Float32Array | null = null;

    public waveform(): Float32Array | null {
        return this.wave;
    }

    public spectrumDb(): Float32Array | null {
        return this.spectrum;
    }
}

function input(overrides: Partial<BlinkHostInputSpec> & Pick<BlinkHostInputSpec, 'type'>): BlinkHostInputSpec {
    return {
        name: overrides.name ?? 'in',
        type: overrides.type,
        required: overrides.required ?? false,
        samples: overrides.samples ?? null,
        representation: overrides.representation ?? null,
        ...(overrides.sampling === undefined ? {} : { sampling: overrides.sampling }),
    };
}

/** Reads the R channel of one texture row out of the binder's packed surface. */
function row(binder: HostInputBinder, name: string, index: number, width: number): number[] {
    const texture = binder.resolve(name) as unknown as { buffer: Float32Array };
    const out: number[] = [];
    for (let x = 0; x < width; x++) {
        out.push(texture.buffer[(index * width + x) * 4]);
    }
    return out;
}

describe('HostInputBinder - audio-shaped inputs', () => {
    it('packs the waveform of an audio input into one row, unchanged', () => {
        const audio = new FakeAudioSource();
        audio.wave = new Float32Array([-1, -0.5, 0.5, 1]);
        const binder = new HostInputBinder(audio);
        binder.bind([input({ name: 'wave', type: 'audio', samples: 4 })]);

        binder.snapshot();

        expect(row(binder, 'wave', 0, 4)).toEqual([-1, -0.5, 0.5, 1]);
    });

    // The analyser reports dBFS; a shader wants a sampled value it can use directly.
    it('maps an audioFFT input from the analyser dB window onto [0, 1]', () => {
        const audio = new FakeAudioSource();
        audio.spectrum = new Float32Array([-90, -45, 0, -120]);
        const binder = new HostInputBinder(audio);
        binder.bind([input({ name: 'fft', type: 'audioFFT', samples: 4 })]);

        binder.snapshot();

        const values = row(binder, 'fft', 0, 4);
        expect(values[0]).toBeCloseTo(0, 5);
        expect(values[1]).toBeCloseTo(0.5, 5);
        expect(values[2]).toBeCloseTo(1, 5);
        // Below the analyser floor clamps rather than going negative.
        expect(values[3]).toBeCloseTo(0, 5);
    });

    it('lays an audioTexture out as spectrum over waveform', () => {
        const audio = new FakeAudioSource();
        audio.spectrum = new Float32Array([0, 0]);
        audio.wave = new Float32Array([0.25, -0.25]);
        const binder = new HostInputBinder(audio);
        binder.bind([input({ name: 'tex', type: 'audioTexture', samples: 2, representation: 'spectrum-waveform' })]);

        binder.snapshot();

        expect(row(binder, 'tex', 0, 2)).toEqual([1, 1]);
        expect(row(binder, 'tex', 1, 2)).toEqual([0.25, -0.25]);
    });

    it('falls back to the analyser bin count when the package declares no sample width', () => {
        const audio = new FakeAudioSource();
        audio.wave = new Float32Array(DEFAULT_AUDIO_SAMPLES).fill(0.5);
        const binder = new HostInputBinder(audio);
        binder.bind([input({ name: 'wave', type: 'audio' })]);

        binder.snapshot();

        expect(row(binder, 'wave', 0, DEFAULT_AUDIO_SAMPLES)).toHaveLength(DEFAULT_AUDIO_SAMPLES);
    });

    it('resamples a source wider than the requested width', () => {
        const audio = new FakeAudioSource();
        audio.wave = new Float32Array([0, 0.25, 0.5, 0.75]);
        const binder = new HostInputBinder(audio);
        binder.bind([input({ name: 'wave', type: 'audio', samples: 2 })]);

        binder.snapshot();

        expect(row(binder, 'wave', 0, 2)).toEqual([0, 0.5]);
    });

    it('packs silence rather than stale data while no source is connected', () => {
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([input({ name: 'wave', type: 'audio', samples: 3 })]);

        binder.snapshot();

        expect(row(binder, 'wave', 0, 3)).toEqual([0, 0, 0]);
    });

    // Every pass and script in one frame must see the same values, so sampling reads the latch,
    // not the analyser.
    it('does not change a bound value until the next snapshot', () => {
        const audio = new FakeAudioSource();
        audio.wave = new Float32Array([1, 1]);
        const binder = new HostInputBinder(audio);
        binder.bind([input({ name: 'wave', type: 'audio', samples: 2 })]);
        binder.snapshot();

        audio.wave = new Float32Array([-1, -1]);

        expect(row(binder, 'wave', 0, 2)).toEqual([1, 1]);
        binder.snapshot();
        expect(row(binder, 'wave', 0, 2)).toEqual([-1, -1]);
    });
});

describe('HostInputBinder - image inputs', () => {
    const imageSpec = input({ name: 'frame', type: 'image', required: true });

    it('reports an image input as unsatisfied until the host supplies a source', () => {
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([imageSpec]);

        expect(binder.unsatisfied()).toEqual(['frame']);
        expect(binder.resolve('frame')).toBeUndefined();

        binder.setImageSource('frame', { id: 'texture' } as never);

        expect(binder.unsatisfied()).toEqual([]);
        expect(binder.resolve('frame')).toEqual({ id: 'texture' });
    });

    it('refuses an image source aimed at an input that is not an image', () => {
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([input({ name: 'wave', type: 'audio' })]);

        expect(() => binder.setImageSource('wave', {} as never)).toThrow(/not an image input/);
    });

    it('refuses an image source for an input the effect never declared', () => {
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([]);

        expect(() => binder.setImageSource('frame', {} as never)).toThrow(/unknown host input/);
    });

    // The host owns image sources, and which one the next effect wants is its call.
    it('drops image sources when a new effect binds', () => {
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([imageSpec]);
        binder.setImageSource('frame', {} as never);

        binder.bind([imageSpec]);

        expect(binder.unsatisfied()).toEqual(['frame']);
    });
});

describe('HostInputBinder - lifetime', () => {
    it('destroys the surfaces it allocated when rebinding and on dispose', () => {
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([input({ name: 'wave', type: 'audio', samples: 2 })]);
        const texture = binder.resolve('wave') as unknown as { destroy: () => void };
        const destroy = vi.spyOn(texture, 'destroy');

        binder.bind([]);

        expect(destroy).toHaveBeenCalledTimes(1);
        expect(binder.resolve('wave')).toBeUndefined();
    });

    it('answers nothing for a pointer input, which is a uniform block rather than a surface', () => {
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([input({ name: 'p', type: 'pointer' })]);

        binder.snapshot();

        expect(binder.resolve('p')).toBeUndefined();
    });
});

describe('HostInputBinder - keyboard input', () => {
    const keyboardPayload = (): Uint8Array => {
        const data = new Uint8Array(256 * 3 * 4);
        // Key code 65 held: row 0, R channel.
        data[65 * 4] = 255;
        // Key code 65 transitioned this frame: row 1 starts at 256 texels.
        data[(256 + 65) * 4] = 255;
        return data;
    };

    it('uploads the keyboard payload the host provides into a 256x3 surface', () => {
        const binder = new HostInputBinder(new FakeAudioSource(), () => keyboardPayload());
        binder.bind([input({ name: 'keys', type: 'keyboard' })]);

        binder.snapshot();

        const texture = binder.resolve('keys') as unknown as { width: number; height: number; buffer: Uint8Array };
        expect([texture.width, texture.height]).toEqual([256, 3]);
        expect(texture.buffer[65 * 4]).toBe(255);
        expect(texture.buffer[(256 + 65) * 4]).toBe(255);
        expect(texture.buffer[(512 + 65) * 4]).toBe(0);
    });

    it('leaves the surface zeroed while no keyboard producer is registered', () => {
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([input({ name: 'keys', type: 'keyboard' })]);

        binder.snapshot();

        const texture = binder.resolve('keys') as unknown as { buffer: Uint8Array };
        expect(texture.buffer.every(byte => byte === 0)).toBe(true);
    });
});

describe('HostInputBinder - binding-local image sampling', () => {
    it('samples shared pixels through independent handles and destroys only its owned views', () => {
        const donor = Texture.fromPixels({
            levels: [{ width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]) }],
            colorSpace: 'none',
            alphaMode: 'straight',
        });
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([
            input({ name: 'mirror', type: 'image', sampling: { filter: 'linear', wrap: 'mirror' } }),
            input({ name: 'repeat', type: 'image', sampling: { filter: 'nearest', wrap: 'repeat' } }),
        ]);
        binder.setImageSource('mirror', donor);
        binder.setImageSource('repeat', donor);
        const mirror = binder.resolve('mirror') as Texture;
        const repeat = binder.resolve('repeat') as Texture;
        expect(mirror).not.toBe(donor);
        expect(repeat).not.toBe(mirror);
        expect(mirror.pixels?.levels[0].data).toBe(donor.pixels?.levels[0].data);
        expect(mirror.wrapMode).toBe(33648);
        expect(repeat.wrapMode).toBe(10497);
        expect(repeat.scaleMode).toBe(9728);
        expect(donor.wrapMode).toBe(33071);
        donor.setPixels({
            levels: [{ width: 1, height: 1, data: new Uint8Array([0, 0, 255, 255]) }],
            colorSpace: 'none',
            alphaMode: 'straight',
        });
        binder.snapshot();
        const refreshed = binder.resolve('mirror') as Texture;
        expect(refreshed.pixels?.levels[0].data).toBe(donor.pixels?.levels[0].data);
        expect(refreshed.width).toBe(1);
        expect(mirror.destroyed).toBe(true);
        binder.dispose();
        expect(refreshed.destroyed).toBe(true);
        expect(donor.destroyed).toBe(false);
        donor.destroy();
    });

    it('keeps an unconfigured native image bound directly to its producer', () => {
        const donor = new Texture();
        const binder = new HostInputBinder(new FakeAudioSource());
        binder.bind([input({ type: 'image' })]);
        binder.setImageSource('in', donor);
        expect(binder.resolve('in')).toBe(donor);
        binder.dispose();
        expect(donor.destroyed).toBe(false);
        donor.destroy();
    });

    it('applies a scoped raw sample policy without altering a managed producer', () => {
        const source = { width: 2, height: 1 } as unknown as HTMLImageElement;
        const donor = new Texture(source);
        const binder = new HostInputBinder(new FakeAudioSource(), undefined, {
            colorSpace: 'none',
            premultiplyAlpha: false,
        });
        binder.bind([input({ type: 'image', sampling: { filter: 'linear', wrap: 'repeat' } })]);
        binder.setImageSource('in', donor);
        const view = binder.resolve('in') as Texture;
        expect(view.source).toBe(source);
        expect(view.colorSpace).toBe('none');
        expect(view.premultiplyAlpha).toBe(false);
        expect(view.flipY).toBe(donor.flipY);
        expect(donor.colorSpace).toBe('srgb');
        expect(donor.premultiplyAlpha).toBe(true);
        binder.dispose();
        donor.destroy();
    });
});

describe('HostInputBinder - numeric producer views', () => {
    it('preserves float data, extent and ownership when a sampled image producer commits new contents', () => {
        const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const donor = new DataTexture({ width: 2, height: 1, format: TextureFormat.Rgba32F, data });
        const binder = new HostInputBinder(new FakeAudioSource(), undefined, {
            colorSpace: 'none',
            premultiplyAlpha: false,
        });
        binder.bind([input({ type: 'image', sampling: { filter: 'linear', wrap: 'mirror' } })]);
        binder.setImageSource('in', donor);
        const view = binder.resolve('in') as DataTexture;
        expect(view).toBeInstanceOf(DataTexture);
        expect(view).not.toBe(donor);
        expect(view.format).toBe(TextureFormat.Rgba32F);
        expect([view.width, view.height]).toEqual([2, 1]);
        expect(view.buffer).toBe(data);
        expect(Array.from(view.buffer)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(view.scaleMode).toBe(9729);
        expect(view.wrapMode).toBe(33648);
        expect(view.premultiplyAlpha).toBe(false);
        expect(donor.scaleMode).toBe(9728);
        expect(donor.wrapMode).toBe(33071);
        data[0] = 8.25;
        donor.commit();
        binder.snapshot();
        const refreshed = binder.resolve('in') as DataTexture;
        expect(refreshed).toBeInstanceOf(DataTexture);
        expect(refreshed.format).toBe(TextureFormat.Rgba32F);
        expect(refreshed.buffer).toBe(data);
        expect(refreshed.buffer[0]).toBe(8.25);
        expect([refreshed.width, refreshed.height]).toEqual([2, 1]);
        expect(view.destroyed).toBe(true);
        binder.dispose();
        expect(refreshed.destroyed).toBe(true);
        expect(donor.destroyed).toBe(false);
        donor.destroy();
    });
});
