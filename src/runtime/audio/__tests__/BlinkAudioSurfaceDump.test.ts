import { describe, expect, it } from 'vitest';

import type { BlinkAudioFrame } from '../BlinkAudioFrame';
import { serializeDumpToUint8 } from '../BlinkAudioSurfaceDump';
import { HISTOGRAM_WIDTH, SPECTRUM_BINS } from '../BlinkAudioSurfaces';
import { BlinkAudioTextureRuntime } from '../BlinkAudioTextureRuntime';

function dummyAudioFrame(overrides: Partial<BlinkAudioFrame> = {}): BlinkAudioFrame {
    return {
        level: 0,
        bass: 0,
        mid: 0,
        midHigh: 0,
        high: 0,
        onset: 0,
        hit: 0,
        bassHit: 0,
        midHit: 0,
        midHighHit: 0,
        highHit: 0,
        presence: 0,
        bassPresence: 0,
        midPresence: 0,
        midHighPresence: 0,
        highPresence: 0,
        beatPulse: 0,
        barPulse: 0,
        beatPhase: 0,
        bpm: 0,
        bpmConfidence: 0,
        rawLevel: 0,
        inputLevel: 0,
        onBeat: 0,
        beatTime: 0,
        curvedTime: 0,
        bpmsin8: 0,
        bpmtri8: 0,
        bpmTwitcher: 0,
        ...overrides,
    };
}

function energize(runtime: BlinkAudioTextureRuntime): void {
    const energy = new Float32Array(12);
    energy.fill(0.5);
    runtime.update(energy, null, dummyAudioFrame({ level: 0.5, bass: 0.4, mid: 0.3, high: 0.2 }), null, 0.016);
}

describe('BlinkAudioTextureRuntime capture', () => {
    describe('captureSpectrumSnapshot', () => {
        it('produces spectrum dump with correct byte length (16384)', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump = runtime.captureSpectrumSnapshot();
            expect(dump.byteLength).toBe(16384);
            expect(dump.floatCount).toBe(4096);
            runtime.destroy();
        });

        it('produces spectrum dump with correct width and channels', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump = runtime.captureSpectrumSnapshot();
            expect(dump.width).toBe(SPECTRUM_BINS);
            expect(dump.channels).toBe(4);
            expect(dump.kind).toBe('spectrum');
            runtime.destroy();
        });

        it('preserves RGBA interleaving in output bytes', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump = runtime.captureSpectrumSnapshot();
            const floats = new Float32Array(dump.bytes);

            expect(floats.length).toBe(SPECTRUM_BINS * 4);
            // R channel values for bin 0 (should be nonzero after energize)
            expect(floats[0]).toBeGreaterThan(0);
            // G channel follows immediately (offset 1)
            // B channel follows (offset 2)
            // A channel follows (offset 3)
            runtime.destroy();
        });

        it('produces correct channel layout metadata', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump = runtime.captureSpectrumSnapshot();
            expect(dump.channelLayout).toEqual(['raw', 'juiced', 'smooth', 'waveform']);
            runtime.destroy();
        });

        it('returns a copy, not a live view', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump1 = runtime.captureSpectrumSnapshot();
            const view1 = new Float32Array(dump1.bytes);
            const oldVal = view1[0];

            // Modify energy and update again
            const energy = new Float32Array(12);
            energy.fill(0.9);
            runtime.update(energy, null, dummyAudioFrame({ level: 0.9 }), null, 0.016);

            // First snapshot still has old value
            expect(new Float32Array(dump1.bytes)[0]).toBeCloseTo(oldVal);

            runtime.destroy();
        });
    });

    describe('captureHistogramSnapshot', () => {
        it('produces histogram dump with correct byte length (6400)', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump = runtime.captureHistogramSnapshot();
            expect(dump.byteLength).toBe(6400);
            expect(dump.floatCount).toBe(1600);
            runtime.destroy();
        });

        it('produces histogram dump with correct width and channels', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump = runtime.captureHistogramSnapshot();
            expect(dump.width).toBe(HISTOGRAM_WIDTH);
            expect(dump.channels).toBe(4);
            expect(dump.kind).toBe('histogram');
            runtime.destroy();
        });

        it('produces correct channel layout metadata', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump = runtime.captureHistogramSnapshot();
            expect(dump.channelLayout).toEqual(['all', 'bass', 'mid', 'high']);
            runtime.destroy();
        });

        it('reflects newest-first orientation in packed data', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const frame1 = dummyAudioFrame({ level: 0.3 });
            const energy = new Float32Array(12);
            energy.fill(0.5);
            runtime.update(energy, null, frame1, null, 0.016);

            const frame2 = dummyAudioFrame({ level: 0.8 });
            runtime.update(energy, null, frame2, null, 0.016);

            const dump = runtime.captureHistogramSnapshot();
            const floats = new Float32Array(dump.bytes);

            // Pixel 0 should be newest value (0.8)
            expect(floats[0]).toBeCloseTo(0.8);
            runtime.destroy();
        });

        it('returns a copy, not a live view', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump1 = runtime.captureHistogramSnapshot();
            const view1 = new Float32Array(dump1.bytes);
            const oldVal = view1[0];

            energize(runtime);
            expect(new Float32Array(dump1.bytes)[0]).toBeCloseTo(oldVal);

            runtime.destroy();
        });
    });

    describe('captureSurfaceSnapshot', () => {
        it('produces full snapshot with both surfaces', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const snapshot = runtime.captureSurfaceSnapshot();

            expect(snapshot.source).toBe('blink');
            expect(snapshot.spectrum.byteLength).toBe(16384);
            expect(snapshot.histogram.byteLength).toBe(6400);
            runtime.destroy();
        });

        it('includes timestamp and frame index', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const snapshot = runtime.captureSurfaceSnapshot();

            expect(snapshot.capturedAt).toBeTruthy();
            expect(typeof snapshot.frameIndex).toBe('number');
            runtime.destroy();
        });
    });

    describe('serializeDumpToUint8', () => {
        it('converts dump bytes to Uint8Array', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            const dump = runtime.captureSpectrumSnapshot();
            const bytes = serializeDumpToUint8(dump);

            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.byteLength).toBe(16384);
            runtime.destroy();
        });
    });

    describe('frame counter', () => {
        it('increments frame index after each update', () => {
            const runtime = new BlinkAudioTextureRuntime();
            expect(runtime.frameIndex).toBe(0);

            energize(runtime);
            expect(runtime.frameIndex).toBe(1);

            energize(runtime);
            expect(runtime.frameIndex).toBe(2);
            runtime.destroy();
        });

        it('includes frame index in snapshot metadata', () => {
            const runtime = new BlinkAudioTextureRuntime();
            energize(runtime);
            energize(runtime);

            const snapshot = runtime.captureSurfaceSnapshot();
            expect(snapshot.frameIndex).toBe(2);
            runtime.destroy();
        });
    });
});
