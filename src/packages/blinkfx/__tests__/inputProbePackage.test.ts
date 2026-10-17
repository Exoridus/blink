// @vitest-environment jsdom
/**
 * Slice-3 acceptance test: the shipped `input_probe.blinkfx` package declares every host input
 * type, and synthetic inputs must arrive at the sampling boundary as exact, known values.
 *
 * This asserts the bound payloads, not the rendered pixels. The repo has no GPU test harness -
 * every render test mocks the engine wholesale - so a pixel assertion here would prove nothing
 * about a real backend. What a shader would sample is fully determined by these payloads.
 */
import { readFile } from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HostAudioSource } from '../../../runtime/hostinput/HostInputBinder';
import { HostInputBinder } from '../../../runtime/hostinput/HostInputBinder';
import { KeyboardBinder } from '../../../runtime/input/KeyboardBinder';
import { PointerBinder } from '../../../runtime/input/PointerBinder';
import type { BlinkEffectIR } from '../../../runtime/ir/types';
import { buildBlinkPointerValues } from '../../../runtime/render/BlinkPrelude';
import { loadBlinkFx } from '../loader';
import type { BlinkFxManifest } from '../manifest';
import { validateBlinkFxManifest } from '../validate';

const PACKAGE_DIR = 'public/effects/input_probe.blinkfx';
const BASE_PATH = 'effects/input_probe.blinkfx';

const loadPackageIr = async (): Promise<BlinkEffectIR> => {
    const raw: unknown = JSON.parse(await readFile(`${PACKAGE_DIR}/manifest.json`, 'utf8'));
    expect(validateBlinkFxManifest(raw)).toEqual({ valid: true });
    return loadBlinkFx(raw as BlinkFxManifest, BASE_PATH);
};

/** A synthetic analyser: a ramp waveform and a spectrum at three known dB levels. */
class SyntheticAudio implements HostAudioSource {
    public readonly decibelRange = { min: -90, max: 0 };

    public waveform(): Float32Array {
        const wave = new Float32Array(512);
        for (let i = 0; i < wave.length; i++) {
            wave[i] = (i / (wave.length - 1)) * 2 - 1;
        }
        return wave;
    }

    public spectrumDb(): Float32Array {
        const spectrum = new Float32Array(512).fill(-90);
        spectrum[0] = 0;
        spectrum[256] = -45;
        return spectrum;
    }
}

const texelR = (texture: unknown, x: number, row: number, width: number): number =>
    (texture as { buffer: Float32Array }).buffer[(row * width + x) * 4];

describe('input_probe.blinkfx', () => {
    let ir: BlinkEffectIR;

    beforeEach(async () => {
        ir = await loadPackageIr();
    });

    it('declares one of every audio-shaped and keyboard host input', () => {
        expect(ir.hostInputs.map(input => `${input.name}:${input.type}`)).toEqual([
            'wave:audio',
            'fft:audioFFT',
            'audioTex:audioTexture',
            'keys:keyboard',
        ]);
        expect(
            ir.hostInputs.every(input => input.type !== 'audioTexture' || input.representation === 'spectrum-waveform')
        ).toBe(true);
    });

    it('binds the synthetic waveform at the declared width, endpoints intact', () => {
        const binder = new HostInputBinder(new SyntheticAudio());
        binder.bind(ir.hostInputs);

        binder.snapshot();

        const wave = binder.resolve('wave');
        expect(texelR(wave, 0, 0, 512)).toBeCloseTo(-1, 5);
        expect(texelR(wave, 511, 0, 512)).toBeCloseTo(1, 5);
        expect(texelR(wave, 255, 0, 512)).toBeCloseTo(-1 + (255 / 511) * 2, 5);
    });

    it('binds the synthetic spectrum mapped onto [0, 1] at the same width', () => {
        const binder = new HostInputBinder(new SyntheticAudio());
        binder.bind(ir.hostInputs);

        binder.snapshot();

        const fft = binder.resolve('fft');
        expect(texelR(fft, 0, 0, 512)).toBeCloseTo(1, 5);
        expect(texelR(fft, 256, 0, 512)).toBeCloseTo(0.5, 5);
        expect(texelR(fft, 511, 0, 512)).toBeCloseTo(0, 5);
    });

    it('lays the audioTexture out as spectrum over waveform, both rows from the same frame', () => {
        const binder = new HostInputBinder(new SyntheticAudio());
        binder.bind(ir.hostInputs);

        binder.snapshot();

        const tex = binder.resolve('audioTex');
        expect(texelR(tex, 0, 0, 512)).toBeCloseTo(1, 5);
        expect(texelR(tex, 0, 1, 512)).toBeCloseTo(-1, 5);
        expect(texelR(tex, 511, 1, 512)).toBeCloseTo(1, 5);
    });

    it('binds the keyboard surface with the three state rows the spec defines', () => {
        const keyboard = new KeyboardBinder();
        const binder = new HostInputBinder(new SyntheticAudio(), () => keyboard.textureData);
        binder.bind(ir.hostInputs);

        keyboard.keyDown(65);
        keyboard.snapshot();
        binder.snapshot();

        const keys = binder.resolve('keys') as unknown as { buffer: Uint8Array };
        expect(keys.buffer[65 * 4]).toBe(255);
        expect(keys.buffer[(256 + 65) * 4]).toBe(255);
        expect(keys.buffer[(512 + 65) * 4]).toBe(255);

        // The transition row is defined against rendered frames: still held, no longer new.
        keyboard.snapshot();
        binder.snapshot();
        expect(keys.buffer[65 * 4]).toBe(255);
        expect(keys.buffer[(256 + 65) * 4]).toBe(0);
    });

    // The convention most easily got backwards: a browser reports top-left, the shader gets
    // bottom-left, in output pixels.
    it('turns a top-left browser coordinate into the bottom-left pointer uniforms', () => {
        const pointer = new PointerBinder(1080);
        pointer.pointerPressed(640, 200);
        pointer.snapshot();

        const values = buildBlinkPointerValues(
            pointer.state.position,
            pointer.state.pressOrigin,
            pointer.state.down,
            pointer.state.active
        );

        expect(Array.from(values.bl_pointerPosition as Float32Array)).toEqual([640, 880]);
        expect(Array.from(values.bl_pointerPressOrigin as Float32Array)).toEqual([640, 880]);
        expect(values.bl_pointerDown).toBe(1);
        expect(values.bl_pointerActive).toBe(1);
    });

    it('keeps one frame coherent while events keep arriving', () => {
        const audio = new SyntheticAudio();
        const spectrum = vi.spyOn(audio, 'spectrumDb');
        const pointer = new PointerBinder(1080);
        const keyboard = new KeyboardBinder();
        const binder = new HostInputBinder(audio, () => keyboard.textureData);
        binder.bind(ir.hostInputs);

        pointer.pointerMoved(10, 10);
        pointer.snapshot();
        keyboard.snapshot();
        binder.snapshot();
        const framePosition = [...pointer.state.position];

        // Everything that arrives after the frame's snapshot belongs to the next frame.
        pointer.pointerMoved(900, 900);
        keyboard.keyDown(32);

        expect([...pointer.state.position]).toEqual(framePosition);
        const keys = binder.resolve('keys') as unknown as { buffer: Uint8Array };
        expect(keys.buffer[32 * 4]).toBe(0);
        expect(spectrum).toHaveBeenCalledTimes(1);
    });
});
