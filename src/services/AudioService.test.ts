import { describe, expect, it, vi } from 'vitest';

interface StubAnalyserOptions {
    fftSize: number;
}

class StubAudioAnalyser {
    public source: unknown = null;
    public bandEnergy = 0;
    public constructor(public readonly options: StubAnalyserOptions) {}
    public get frequencyBinCount(): number {
        return this.options.fftSize / 2;
    }
    public getBandEnergy(_from: number, _to: number): number {
        return this.bandEnergy;
    }
    public getSpectrumFloat(_into?: Float32Array): Float32Array {
        return new Float32Array(this.frequencyBinCount);
    }
    public getWaveformFloat(_into?: Float32Array): Float32Array {
        return new Float32Array(this.options.fftSize);
    }
    public getRms(): number {
        return 0;
    }
    public destroy = vi.fn();
}

class StubBeatDetector {
    public source: unknown = null;
    public tempo = 118;
    public onsetStrength = 0;
    public beatPhase = 1;
    public onBeat = { add: vi.fn() };
    public onDownbeat = { add: vi.fn() };
    public destroy = vi.fn();
}

vi.mock('@codexo/exojs', () => ({
    getAudioContext: () => ({ sampleRate: 48000 }) as unknown as AudioContext,
}));

vi.mock('@codexo/exojs-audio-fx', () => ({
    AudioAnalyser: StubAudioAnalyser,
    BeatDetector: StubBeatDetector,
}));

const { AudioService } = await import('./AudioService');

interface AudioServiceInternals {
    analyser: StubAudioAnalyser;
    beatDetector: StubBeatDetector;
}

const internals = (service: object): AudioServiceInternals => service as unknown as AudioServiceInternals;

describe('AudioService.frequencyEnergy', () => {
    it('produces a Float32Array of length 12', () => {
        const service = new AudioService(null, 2048);
        const energy = service.frequencyEnergy;
        expect(energy).toBeInstanceOf(Float32Array);
        expect(energy.length).toBe(12);
    });

    const tick = (service: object, frames: number): Float32Array => {
        const s = service as { readonly frequencyEnergy: Float32Array };
        let snapshot = s.frequencyEnergy;
        for (let i = 1; i < frames; i++) {
            snapshot = s.frequencyEnergy;
        }
        return snapshot;
    };

    it('returns ~zeros at idle (no analyser energy, beat phase quiescent)', () => {
        const service = new AudioService(null, 2048);
        const energy = tick(service, 50);
        for (const band of energy) {
            expect(band).toBeCloseTo(0, 5);
        }
    });

    it('clamps explicitly-clamped indices (0..7, 11) into [0, 1] under extreme analyser input', () => {
        const service = new AudioService(null, 2048);
        internals(service).analyser.bandEnergy = 50;
        const energy = tick(service, 200);
        const clampedIndices = [0, 1, 2, 3, 4, 5, 6, 7, 11] as const;
        for (const i of clampedIndices) {
            expect(energy[i]).toBeGreaterThanOrEqual(0);
            expect(energy[i]).toBeLessThanOrEqual(1);
        }
    });
});

describe('AudioService.destroy', () => {
    it('destroys both taps so the source node is released', () => {
        const service = new AudioService(null, 2048);
        const { analyser, beatDetector } = internals(service);

        service.destroy();

        expect(analyser.destroy).toHaveBeenCalledTimes(1);
        expect(beatDetector.destroy).toHaveBeenCalledTimes(1);
    });
});
