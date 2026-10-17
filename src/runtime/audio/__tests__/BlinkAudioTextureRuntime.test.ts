import { describe, expect, it } from 'vitest';

import type { BlinkAudioFrame } from '../BlinkAudioFrame';
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

describe('BlinkAudioTextureRuntime', () => {
    describe('construction', () => {
        it('creates spectrum texture with correct dimensions and format', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const tex = runtime.spectrumTexture;
            expect(tex.width).toBe(SPECTRUM_BINS);
            expect(tex.height).toBe(1);
            expect(tex.format).toBe('rgba32f');
            runtime.destroy();
        });

        it('creates histogram texture with correct dimensions and format', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const tex = runtime.histogramTexture;
            expect(tex.width).toBe(HISTOGRAM_WIDTH);
            expect(tex.height).toBe(1);
            expect(tex.format).toBe('rgba32f');
            runtime.destroy();
        });

        it('allocates spectrum buffer of correct size', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const buf = runtime.spectrumTexture.buffer;
            expect(buf).toBeInstanceOf(Float32Array);
            expect(buf.length).toBe(SPECTRUM_BINS * 4);
            runtime.destroy();
        });

        it('allocates histogram buffer of correct size', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const buf = runtime.histogramTexture.buffer;
            expect(buf).toBeInstanceOf(Float32Array);
            expect(buf.length).toBe(HISTOGRAM_WIDTH * 4);
            runtime.destroy();
        });
    });

    describe('update', () => {
        it('populates spectrum buffer after update with non-zero energy', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const energy = new Float32Array(12);
            energy.fill(0.5);
            const frame = dummyAudioFrame({ level: 0.5, bass: 0.4, mid: 0.3, high: 0.2 });

            runtime.update(energy, null, frame, null, 0.016);

            const buf = runtime.spectrumTexture.buffer;
            let nonZero = 0;
            for (const val of buf) {
                if (val > 0) nonZero++;
            }
            expect(nonZero).toBeGreaterThan(0);
            runtime.destroy();
        });

        it('populates histogram buffer after an update long enough to trigger a push', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const energy = new Float32Array(12);
            energy.fill(0.3);
            const frame = dummyAudioFrame({ level: 0.7, bass: 0.5, mid: 0.3, high: 0.1 });

            // dt=0.034 s exceeds the 31.75 ms LevelTrail push interval
            runtime.update(energy, null, frame, null, 0.034);

            const buf = runtime.histogramTexture.buffer;
            expect(buf[0]).toBeGreaterThan(0);
            expect(buf[1]).toBeGreaterThan(0);
            runtime.destroy();
        });

        it('spectrum R channel (raw) is non-zero with energy input', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const energy = new Float32Array(12);
            energy.fill(0.8);

            runtime.update(energy, null, dummyAudioFrame(), null, 0.016);

            const buf = runtime.spectrumTexture.buffer;
            expect(buf[0]).toBeGreaterThan(0);
            runtime.destroy();
        });

        it('histogram R channel reflects level after a push-interval update', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const energy = new Float32Array(12);
            const frame = dummyAudioFrame({ level: 0.6 });

            // dt=0.034 s exceeds the 31.75 ms LevelTrail push interval
            runtime.update(energy, null, frame, null, 0.034);

            const buf = runtime.histogramTexture.buffer;
            expect(buf[0]).toBeGreaterThan(0);
            runtime.destroy();
        });

        it('does not throw with null waveform data', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const energy = new Float32Array(12);

            expect(() => {
                runtime.update(energy, null, dummyAudioFrame(), null, 0.016);
            }).not.toThrow();
            runtime.destroy();
        });

        it('handles waveform data when provided', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const energy = new Float32Array(12);
            const waveform = new Float32Array(2048);
            for (let i = 0; i < waveform.length; i++) {
                waveform[i] = Math.sin((i / waveform.length) * Math.PI * 4);
            }

            expect(() => {
                runtime.update(energy, null, dummyAudioFrame(), waveform, 0.016);
            }).not.toThrow();
            runtime.destroy();
        });
    });

    describe('surface', () => {
        it('resolves the spectrum surface to the spectrum DataTexture', () => {
            const runtime = new BlinkAudioTextureRuntime();
            expect(runtime.surface('spectrum')).toBe(runtime.spectrumTexture);
            runtime.destroy();
        });

        it('resolves the levelTrail surface to the histogram DataTexture', () => {
            const runtime = new BlinkAudioTextureRuntime();
            expect(runtime.surface('levelTrail')).toBe(runtime.histogramTexture);
            runtime.destroy();
        });
    });

    describe('packed array sizes', () => {
        it('packed spectrum array size is SPECTRUM_BINS * 4', () => {
            const runtime = new BlinkAudioTextureRuntime();
            expect(runtime.spectrumTexture.buffer.length).toBe(SPECTRUM_BINS * 4);
            runtime.destroy();
        });

        it('packed histogram array size is HISTOGRAM_WIDTH * 4', () => {
            const runtime = new BlinkAudioTextureRuntime();
            expect(runtime.histogramTexture.buffer.length).toBe(HISTOGRAM_WIDTH * 4);
            runtime.destroy();
        });
    });

    describe('spectrum source routing', () => {
        function runOnce(fftLinearDb: number | Float32Array, fftLogDb: number | Float32Array | null): Float32Array {
            const runtime = new BlinkAudioTextureRuntime();
            const energy = new Float32Array(12);
            const frame = dummyAudioFrame({ level: 0.5 });
            const fftLinear = typeof fftLinearDb === 'number' ? new Float32Array(1024).fill(fftLinearDb) : fftLinearDb;
            const fftLog =
                fftLogDb === null
                    ? null
                    : typeof fftLogDb === 'number'
                      ? new Float32Array(1024).fill(fftLogDb)
                      : fftLogDb;
            runtime.update(energy, fftLinear, frame, null, 0.016, 48000, null, fftLog);
            const out = new Float32Array(runtime.spectrumTexture.buffer);
            runtime.destroy();
            return out;
        }

        function channelMaxAbsDiff(a: Float32Array, b: Float32Array, channel: number): number {
            let maxDiff = 0;
            for (let i = channel; i < a.length; i += 4) {
                const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
                if (d > maxDiff) {
                    maxDiff = d;
                }
            }
            return maxDiff;
        }

        it('Raw channel (R) is unchanged by log FFT input', () => {
            const quietLog = runOnce(-20, -90);
            const loudLog = runOnce(-20, -6);

            expect(Math.abs(quietLog[0] - loudLog[0])).toBeLessThan(1e-8);
            expect(Math.abs(quietLog[400 * 4 + 0] - loudLog[400 * 4 + 0])).toBeLessThan(1e-8);
        });

        it('Juiced channel (G) is unchanged by log FFT input when linear FFT is fixed', () => {
            const quietLog = runOnce(-20, -90);
            const loudLog = runOnce(-20, -6);

            expect(Math.abs(quietLog[1] - loudLog[1])).toBeLessThan(1e-8);
            expect(Math.abs(quietLog[400 * 4 + 1] - loudLog[400 * 4 + 1])).toBeLessThan(1e-8);
        });

        it('Juiced channel (G) responds to linear FFT input changes', () => {
            const baseLinear = new Float32Array(1024).fill(-20);
            const shapedLinear = new Float32Array(baseLinear);
            shapedLinear[512] = -6;
            const base = runOnce(baseLinear, -20);
            const shaped = runOnce(shapedLinear, -20);

            expect(channelMaxAbsDiff(base, shaped, 1)).toBeGreaterThan(1e-4);
        });

        it('Smooth channel (B) remains tied to log FFT path', () => {
            const quietLog = runOnce(-20, -90);
            const loudLog = runOnce(-20, -6);

            expect(Math.abs(quietLog[2] - loudLog[2])).toBeGreaterThan(1e-4);
            expect(Math.abs(quietLog[400 * 4 + 2] - loudLog[400 * 4 + 2])).toBeGreaterThan(1e-4);
        });

        it('Smooth channel (B) still produces output when log FFT is unavailable (fallback)', () => {
            const fallback = runOnce(-20, null);
            expect(fallback[2]).toBeGreaterThan(0);
            expect(fallback[400 * 4 + 2]).toBeGreaterThan(0);
        });
    });

    describe('histogram ring buffer accumulation', () => {
        it('histogram R channel updates to newest value (pixel 0 = newest)', () => {
            const runtime = new BlinkAudioTextureRuntime();
            const energy = new Float32Array(12);

            // dt=0.034 s exceeds the 31.75 ms LevelTrail push interval, triggering one push per call.
            const firstFrame = dummyAudioFrame({ level: 0.2 });
            runtime.update(energy, null, firstFrame, null, 0.034);
            // After first push: pixel 0 (newest) = 0.2
            expect(runtime.histogramTexture.buffer[0]).toBeCloseTo(0.2);

            const secondFrame = dummyAudioFrame({ level: 0.8 });
            runtime.update(energy, null, secondFrame, null, 0.034);
            // After second push: pixel 0 (newest) = 0.8
            expect(runtime.histogramTexture.buffer[0]).toBeCloseTo(0.8);

            runtime.destroy();
        });
    });
});
