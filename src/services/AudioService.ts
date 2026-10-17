import { getAudioContext } from '@codexo/exojs';
import { AudioAnalyser, BeatDetector } from '@codexo/exojs-audio-fx';

import { captureSsfPcm } from '../packages/ssf/original/pcm';
import { lerp } from '../utils/utils';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export class AudioService {
    private readonly analyser: AudioAnalyser;
    private readonly beatDetector: BeatDetector;

    private readonly frequencyEnergyData = new Float32Array(12);
    private readonly rawFrequencyEnergyData = new Float32Array(12);

    private readonly soundSpectrum: Array<[number, number]> = [
        [20, 40],
        [40, 80],
        [80, 160],
        [20, 160],
        [160, 320],
        [320, 640],
        [640, 1280],
        [160, 1280],
        [1280, 2560],
        [2560, 5120],
        [5120, 10240],
        [1280, 10240],
    ];

    private readonly smoothing: number = 0.65;
    private readonly fftSpectrumBuffer: Float32Array;
    private readonly fftLogSpectrumBuffer: Float32Array = new Float32Array(1024);
    private readonly _sampleRate: number;
    private beatPulse = 0;
    private downbeatPulse = 0;
    private grooveDrive = 0;
    private barCounter = 0;
    private bassDirectionTarget = 1;
    private midDirectionTarget = 1;
    private trebleDirectionTarget = -1;
    private bassDirectionState = 1;
    private midDirectionState = 1;
    private trebleDirectionState = -1;

    public get bpm(): number {
        return Math.round(this.beatDetector.tempo);
    }

    public get tempoFactor(): number {
        return clamp01((this.beatDetector.tempo - 118) / 72);
    }

    public get beatIntensity(): number {
        const phaseBoost = 1 - clamp01(this.beatDetector.beatPhase);
        const onsetBoost = clamp01(this.beatDetector.onsetStrength * 1.25);
        return clamp01(this.beatPulse * 0.62 + this.downbeatPulse * 0.34 + phaseBoost * 0.12 + onsetBoost * 0.18);
    }

    public get downbeatIntensity(): number {
        return this.downbeatPulse;
    }

    public get bassPhaseDrive(): number {
        const amplitude = 0.95 + this.tempoFactor * 0.65 + this.beatIntensity * 0.4 + this.downbeatIntensity * 0.28;
        return clamp(this.bassDirectionState * amplitude, -1.7, 1.7);
    }

    public get midPhaseDrive(): number {
        const amplitude = 0.78 + this.tempoFactor * 0.4 + this.beatIntensity * 0.26 + this.grooveDrive * 0.18;
        return clamp(this.midDirectionState * amplitude, -1.35, 1.35);
    }

    public get treblePhaseDrive(): number {
        const amplitude = 0.64 + this.tempoFactor * 0.34 + this.beatIntensity * 0.2 + this.grooveDrive * 0.14;
        return clamp(this.trebleDirectionState * amplitude, -1.15, 1.15);
    }

    public get beatPhase(): number {
        return this.beatDetector.beatPhase;
    }

    public get onsetStrength(): number {
        return clamp01(this.beatDetector.onsetStrength);
    }

    public get beatPulseLevel(): number {
        return this.beatPulse;
    }

    public get downbeatPulseLevel(): number {
        return this.downbeatPulse;
    }

    public get waveformData(): Float32Array | null {
        if (this.analyser.source === null) {
            return null;
        }
        return this.analyser.getWaveformFloat();
    }

    public get fftSpectrum(): Float32Array | null {
        if (this.analyser.source === null) {
            return null;
        }
        return this.analyser.getSpectrumFloat(this.fftSpectrumBuffer as Float32Array<ArrayBuffer>);
    }

    /**
     * Log-frequency spectrum: 1024 dBFS bins, octave-spaced from 30 Hz to 16 kHz.
     * Used by Blink's current Smooth (B) approximation path and retained
     * for stage-level diagnostics/comparison.
     */
    public get fftSpectrumLog(): Float32Array | null {
        if (this.analyser.source === null) {
            return null;
        }
        return this.analyser.getSpectrumLogFloat(this.fftLogSpectrumBuffer as Float32Array<ArrayBuffer>, {
            bands: 1024,
            fMin: 30,
            fMax: 16000,
        });
    }

    public get sampleRate(): number {
        return this._sampleRate;
    }

    public get inputLevel(): number {
        if (this.analyser.source === null) {
            return 0;
        }
        return clamp01(this.analyser.getRms() * 2.5);
    }

    public get frequencyEnergy(): Float32Array {
        const energyData = this.frequencyEnergyData;
        const beatBoost = this.beatIntensity * (1 + this.tempoFactor * 0.38);
        const downbeatBoost = this.downbeatIntensity;

        for (let i = 0; i < energyData.length; i++) {
            const [from, to] = this.soundSpectrum[i];
            const energy = this.analyser.getBandEnergy(from, to);

            energyData[i] = lerp(energyData[i], energy, 1 - this.smoothing);
        }

        energyData[0] = clamp01(energyData[0] + beatBoost * 0.36 + downbeatBoost * 0.18);
        energyData[1] = clamp01(energyData[1] + beatBoost * 0.3);
        energyData[2] = clamp01(energyData[2] + beatBoost * 0.24);
        energyData[3] = clamp01(Math.max(energyData[3], beatBoost));

        energyData[4] = clamp01(energyData[4] + beatBoost * 0.16);
        energyData[5] = clamp01(energyData[5] + beatBoost * 0.12);
        energyData[6] = clamp01(energyData[6] + beatBoost * 0.1);
        energyData[7] = clamp01(Math.max(energyData[7], beatBoost * 0.8));

        energyData[11] = clamp01(Math.max(energyData[11], downbeatBoost));

        return energyData;
    }

    public get rawFrequencyEnergy(): Float32Array {
        const raw = this.rawFrequencyEnergyData;
        for (let i = 0; i < raw.length; i++) {
            const [from, to] = this.soundSpectrum[i];
            raw[i] = this.analyser.getBandEnergy(from, to);
        }
        return raw;
    }

    public constructor(
        private readonly source: MediaStream | AudioNode | null,
        fftSize: number
    ) {
        this.analyser = new AudioAnalyser({
            fftSize,
            minDecibels: -90,
            maxDecibels: 0,
        });
        this.analyser.source = source;
        this.fftSpectrumBuffer = new Float32Array(this.analyser.frequencyBinCount);
        this._sampleRate = getAudioContext().sampleRate;

        this.beatDetector = new BeatDetector();
        this.beatDetector.source = source;

        this.beatDetector.onBeat.add(beatInfo => {
            this.beatPulse = Math.max(this.beatPulse, clamp01(0.55 + beatInfo.energy * 0.9));

            if (beatInfo.beatInBar === 4) {
                this.midDirectionTarget *= -1;
            }

            if (beatInfo.energy > 0.9) {
                this.trebleDirectionTarget *= -1;
            }
        });
        this.beatDetector.onDownbeat.add(beatInfo => {
            this.downbeatPulse = Math.max(this.downbeatPulse, clamp01(0.65 + beatInfo.energy));
            this.barCounter += 1;

            this.bassDirectionTarget = this.barCounter % 8 < 4 ? 1 : -1;
            this.trebleDirectionTarget = -this.bassDirectionTarget;
        });
    }

    /**
     * Disconnects both analysis taps from the source node. The source itself (a MediaStream's
     * tracks, a media element) stays the caller's to release; without this the taps keep the
     * Web Audio graph, and through it the source, alive after the service is dropped.
     */
    public destroy(): void {
        this.analyser.destroy();
        this.beatDetector.destroy();
    }

    /** Starts a continuous PCM tap only for a consumer that requests the original analysis path. */
    public subscribePcm(listener: (samples: Float32Array) => void): Promise<() => void> {
        return captureSsfPcm(getAudioContext(), this.source, listener);
    }

    /** Detaches the generic analyzers while an original PCM provider owns analysis. */
    public setGenericAnalysisEnabled(enabled: boolean): void {
        this.analyser.source = enabled ? this.source : null;
        this.beatDetector.source = enabled ? this.source : null;
    }

    public update(deltaSeconds: number): void {
        this.beatPulse *= Math.exp(-deltaSeconds * 4.4);
        this.downbeatPulse *= Math.exp(-deltaSeconds * 3.1);

        const onset = clamp01(this.beatDetector.onsetStrength * 1.4);
        const settle = 1 - Math.exp(-deltaSeconds * 3.4);
        this.grooveDrive = lerp(this.grooveDrive, clamp01(onset + this.beatIntensity * 0.4), settle);

        const bassBlend = 1 - Math.exp(-deltaSeconds * 0.78);
        const midBlend = 1 - Math.exp(-deltaSeconds * 0.98);
        const trebleBlend = 1 - Math.exp(-deltaSeconds * 0.88);

        this.bassDirectionState = lerp(this.bassDirectionState, this.bassDirectionTarget, bassBlend);
        this.midDirectionState = lerp(this.midDirectionState, this.midDirectionTarget, midBlend);
        this.trebleDirectionState = lerp(this.trebleDirectionState, this.trebleDirectionTarget, trebleBlend);
    }
}
