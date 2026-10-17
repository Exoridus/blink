import { describe, expect, it } from 'vitest';

import { packAllSurfaces, packFxHistogram, packFxSpectrum } from '../BlinkAudioPackers';
import type { BlinkAudioSurfaces } from '../BlinkAudioSurfaces';
import { createBlinkAudioSurfaces } from '../BlinkAudioSurfaces';

describe('packFxSpectrum', () => {
    it('packs four channels into interleaved RGBA', () => {
        const bins = 4;
        const raw = new Float32Array([0.1, 0.2, 0.3, 0.4]);
        const juiced = new Float32Array([0.5, 0.6, 0.7, 0.8]);
        const smooth = new Float32Array([0.15, 0.25, 0.35, 0.45]);
        const waveform = new Float32Array([-1.0, -0.5, 0.0, 1.0]);
        const out = new Float32Array(bins * 4);

        packFxSpectrum(raw, juiced, smooth, waveform, out, bins);

        // Bin 0: R=0.1, G=0.5, B=0.15, A=((-1)+1)*0.5=0
        expect(out[0]).toBeCloseTo(0.1, 5); // R
        expect(out[1]).toBeCloseTo(0.5, 5); // G
        expect(out[2]).toBeCloseTo(0.15, 5); // B
        expect(out[3]).toBeCloseTo(0.0, 5); // A (waveform -1 → 0)

        // Bin 3: R=0.4, G=0.8, B=0.45, A=((1)+1)*0.5=1.0
        const o3 = 3 * 4;
        expect(out[o3 + 3]).toBeCloseTo(1.0, 5);
    });

    it('clamps all channels to [0, 2]', () => {
        const bins = 2;
        const raw = new Float32Array([2.0, -1.0]);
        const juiced = new Float32Array([5.0, -3.0]);
        const smooth = new Float32Array([10.0, -5.0]);
        const waveform = new Float32Array([100.0, -100.0]);
        const out = new Float32Array(bins * 4);

        packFxSpectrum(raw, juiced, smooth, waveform, out, bins);

        for (let i = 0; i < bins * 4; i++) {
            expect(out[i]).toBeGreaterThanOrEqual(0);
            expect(out[i]).toBeLessThanOrEqual(2);
        }
    });

    it('handles fewer input bins than output expects', () => {
        const bins = 4;
        const raw = new Float32Array(2);
        raw[0] = 0.3;
        raw[1] = 0.7;
        const juiced = new Float32Array(2);
        const smooth = new Float32Array(2);
        const waveform = new Float32Array(2);
        const out = new Float32Array(bins * 4);

        packFxSpectrum(raw, juiced, smooth, waveform, out, bins);

        // Bins beyond input length should be 0
        expect(out[2 * 4]).toBeCloseTo(0, 5);
        expect(out[2 * 4 + 1]).toBeCloseTo(0, 5);
    });
});

describe('packFxHistogram', () => {
    it('packs four history channels into interleaved RGBA (newest-first orientation)', () => {
        const width = 3;
        const level = new Float32Array([0.8, 0.7, 0.6]); // oldest → newest
        const bass = new Float32Array([0.3, 0.4, 0.5]);
        const mid = new Float32Array([0.1, 0.2, 0.3]);
        const high = new Float32Array([0.05, 0.1, 0.15]);
        const out = new Float32Array(width * 4);

        packFxHistogram(level, bass, mid, high, out, width);

        // Pixel 0 = newest (level[2] = 0.6)
        expect(out[0]).toBeCloseTo(0.6, 5); // R = level
        expect(out[1]).toBeCloseTo(0.5, 5); // G = bass
        expect(out[2]).toBeCloseTo(0.3, 5); // B = mid
        expect(out[3]).toBeCloseTo(0.15, 5); // A = high

        // Pixel 1 = level[1] = 0.7
        expect(out[4]).toBeCloseTo(0.7, 5);
        expect(out[5]).toBeCloseTo(0.4, 5);

        // Pixel 2 = oldest (level[0] = 0.8)
        expect(out[8]).toBeCloseTo(0.8, 5);
        expect(out[9]).toBeCloseTo(0.3, 5);
    });

    it('clamps all channels to [0, 2]', () => {
        const width = 2;
        const level = new Float32Array([5, -3]);
        const bass = new Float32Array([10, -5]);
        const mid = new Float32Array([20, -10]);
        const high = new Float32Array([30, -15]);
        const out = new Float32Array(width * 4);

        packFxHistogram(level, bass, mid, high, out, width);

        for (let i = 0; i < width * 4; i++) {
            expect(out[i]).toBeGreaterThanOrEqual(0);
            expect(out[i]).toBeLessThanOrEqual(2);
        }
    });

    it('handles shorter input than width (newest-first)', () => {
        const width = 5;
        const level = new Float32Array([0.1, 0.2]); // oldest, newest
        const bass = new Float32Array([0.3, 0.4]);
        const mid = new Float32Array([0.5, 0.6]);
        const high = new Float32Array([0.7, 0.8]);
        const out = new Float32Array(width * 4);

        packFxHistogram(level, bass, mid, high, out, width);

        // Pixel 0 (i=0, srcIdx=1) = newest = 0.2
        expect(out[0]).toBeCloseTo(0.2, 5);
        // Pixel 1 (i=1, srcIdx=0) = oldest = 0.1
        expect(out[4]).toBeCloseTo(0.1, 5);
        // Beyond input length: should be 0
        expect(out[8]).toBeCloseTo(0, 5);
    });
});

describe('packAllSurfaces', () => {
    it('packs both textures from a BlinkAudioSurfaces instance', () => {
        const surfaces: BlinkAudioSurfaces = createBlinkAudioSurfaces(8);

        // Seed some data
        surfaces.textureBuffers.rawSpectrum.fill(0.5);
        surfaces.textureBuffers.juicedSpectrum.fill(0.3);
        surfaces.textureBuffers.smoothSpectrum.fill(0.7);
        surfaces.textureBuffers.waveform.fill(0);
        surfaces.levelHistory.pushMany([0.1, 0.2, 0.3]);
        surfaces.bassHistory.pushMany([0.4, 0.5, 0.6]);
        surfaces.midHistory.pushMany([0.05, 0.06, 0.07]);
        surfaces.highHistory.pushMany([0.08, 0.09, 0.1]);

        const bins = 8;
        const histWidth = 400;

        packAllSurfaces(surfaces, bins, histWidth);

        // spectrum check
        expect(surfaces.textureBuffers.packedSpectrum[0]).toBeCloseTo(0.5, 5); // R
        expect(surfaces.textureBuffers.packedSpectrum[1]).toBeCloseTo(0.3, 5); // G
        expect(surfaces.textureBuffers.packedSpectrum[2]).toBeCloseTo(0.7, 5); // B

        // histogram check (first sample, R channel = level history, newest-first)
        // levelHistory = [0.1, 0.2, 0.3] oldest→newest; pixel 0 = newest = 0.3
        expect(surfaces.textureBuffers.packedHistogram[0]).toBeCloseTo(0.3, 5);
        expect(surfaces.textureBuffers.packedHistogram[1]).toBeCloseTo(0.6, 5); // G = bass, newest
    });
});
