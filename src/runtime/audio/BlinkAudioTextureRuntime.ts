import type { UniformValue } from '@codexo/exojs';
import { DataTexture, TextureFormat } from '@codexo/exojs';

import type { BlinkAudioFrame } from './BlinkAudioFrame';
import { packFxHistogram, packFxSpectrum } from './BlinkAudioPackers';
import { CANDIDATE_SCALAR_COUNT } from './BlinkAudioSignals';
import type { SpectrumStageFrameCallback } from './BlinkAudioSpectrumStageRecorder';
import type { BlinkAudioSurfaceDump, BlinkAudioSurfaceSnapshot, BlinkAudioSurfaceStats } from './BlinkAudioSurfaceDump';
import {
    type BlinkAudioSurfaces,
    createBlinkAudioSurfaces,
    HISTOGRAM_WIDTH,
    SPECTRUM_BINS,
} from './BlinkAudioSurfaces';
import {
    buildJuicedSpectrum,
    buildLogSpectrum,
    buildRawSpectrum,
    buildRawSpectrumFromFFT,
    buildSmoothSpectrum,
    buildWaveform,
    createJuicedStageAState,
    type JuicedStageAState,
} from './BlinkSpectrumGenerators';

const SPECTRUM_CHANNEL_LAYOUT = ['raw', 'juiced', 'smooth', 'waveform'];
const HISTOGRAM_CHANNEL_LAYOUT = ['all', 'bass', 'mid', 'high'];

function copyArrayBuffer(src: Float32Array): ArrayBuffer {
    return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
}

export type ProbeSessionFrameCallback = (
    spectrumBuffer: Float32Array,
    histogramBuffer: Float32Array,
    frameIndex: number
) => void;

export class BlinkAudioTextureRuntime {
    readonly spectrumTexture: DataTexture<TextureFormat.Rgba32F>;
    readonly histogramTexture: DataTexture<TextureFormat.Rgba32F>;

    private readonly surfaces: BlinkAudioSurfaces;
    private readonly juicedStageAState: JuicedStageAState;
    private readonly juicedStageA: Float32Array;
    private readonly juicedState: Float32Array;
    private readonly juicedStageBNormalized: Float32Array;
    private readonly prevSmooth: Float32Array;
    private _frameIndex = 0;
    private _sessionCallback: ProbeSessionFrameCallback | null = null;
    private _stageCallback: SpectrumStageFrameCallback | null = null;
    private _lastFftDb: Float32Array | null = null;

    // LevelTrail push-rate throttle.
    // Synesthesia's LevelTrail is populated once per audio-pipeline frame (~31.5 fps
    // in the reference capture). Pushing at Blink's render rate (~60-144 fps) would
    // produce a 400-pixel texture that covers only 2-7 s of history, while Synesthesia's
    // covers ~12.7 s — causing fundamentally different time windows and near-zero
    // (or negative) packed_leveltrail correlation.
    private _levelTrailAccumMs = 0;
    private static readonly LEVEL_TRAIL_PUSH_INTERVAL_MS = 1000 / 31.5; // ≈ 31.75 ms

    // 4-float buffer: [level_all, level_bass, level_mid, level_high] — captured every frame.
    private readonly _levelScalarsBuffer: Float32Array = new Float32Array(4);
    // CANDIDATE_SCALAR_COUNT-float buffer of pre-EMA candidate values for offline comparison.
    private readonly _candidateScalarsBuffer: Float32Array = new Float32Array(CANDIDATE_SCALAR_COUNT);

    constructor() {
        this.surfaces = createBlinkAudioSurfaces(SPECTRUM_BINS);
        const tb = this.surfaces.textureBuffers;

        this.juicedStageAState = createJuicedStageAState();
        this.juicedStageA = new Float32Array(SPECTRUM_BINS);
        this.juicedState = new Float32Array(SPECTRUM_BINS);
        this.juicedStageBNormalized = new Float32Array(SPECTRUM_BINS);
        this.prevSmooth = new Float32Array(SPECTRUM_BINS);

        this.spectrumTexture = new DataTexture({
            width: SPECTRUM_BINS,
            height: 1,
            format: TextureFormat.Rgba32F,
            data: tb.packedSpectrum,
        });

        this.histogramTexture = new DataTexture({
            width: HISTOGRAM_WIDTH,
            height: 1,
            format: TextureFormat.Rgba32F,
            data: tb.packedHistogram,
        });
    }

    get frameIndex(): number {
        return this._frameIndex;
    }

    setProbeSessionCallback(cb: ProbeSessionFrameCallback | null): void {
        this._sessionCallback = cb;
    }

    setSpectrumStageCallback(cb: SpectrumStageFrameCallback | null): void {
        this._stageCallback = cb;
    }

    getCurrentSpectrumCoverageStats(): Record<string, number | string> {
        const fft = this._lastFftDb;
        if (!fft) return { status: 'no FFT data yet' };

        let leftHalfMax = -Infinity,
            rightHalfMax = -Infinity;
        let rightHalfSum = 0;
        const half = Math.floor(fft.length / 2);
        let lastAboveMinus60 = -1;
        let lastAboveMinus80 = -1;

        for (let i = 0; i < fft.length; i++) {
            const db = fft[i] ?? -90;
            if (i < half) {
                if (db > leftHalfMax) leftHalfMax = db;
            } else {
                if (db > rightHalfMax) rightHalfMax = db;
                rightHalfSum += db;
            }
            if (db > -60) lastAboveMinus60 = i;
            if (db > -80) lastAboveMinus80 = i;
        }

        return {
            leftHalfMaxDB: Math.round(leftHalfMax),
            rightHalfMaxDB: Math.round(rightHalfMax),
            rightHalfMeanDB: Math.round(rightHalfSum / half),
            binCount: fft.length,
            lastBinAboveMinus60dB: lastAboveMinus60,
            lastBinAboveMinus80dB: lastAboveMinus80,
            rightHalfAlive: rightHalfMax > -80 ? 'yes' : 'no',
        };
    }

    getPackedSurfaceStats(prevStats?: BlinkAudioSurfaceStats): BlinkAudioSurfaceStats {
        const tb = this.surfaces.textureBuffers;
        const spec = tb.packedSpectrum;
        const hist = tb.packedHistogram;

        function chStats(arr: Float32Array, ch: number, width: number) {
            let mn = Infinity,
                mx = -Infinity,
                sum = 0;
            for (let i = 0; i < width; i++) {
                const v = arr[i * 4 + ch] ?? 0;
                if (v < mn) mn = v;
                if (v > mx) mx = v;
                sum += v;
            }
            return { min: mn, max: mx, mean: sum / width };
        }

        const raw = chStats(spec, 0, 1024);
        const juiced = chStats(spec, 1, 1024);
        const smooth = chStats(spec, 2, 1024);
        const waveRaw = chStats(spec, 3, 1024);

        // RMS deviation of waveform from 0.5
        let waveDevSum = 0;
        for (let i = 0; i < 1024; i++) {
            const v = (spec[i * 4 + 3] ?? 0) - 0.5;
            waveDevSum += v * v;
        }
        const waveRmsDev = Math.sqrt(waveDevSum / 1024);

        const hasChanged =
            prevStats?.spectrum.raw.mean !== raw.mean ||
            prevStats.spectrum.waveform.rmsDeviation !== waveRmsDev ||
            prevStats.histogram.all.mean !== chStats(hist, 0, 400).mean;

        const histAll = chStats(hist, 0, 400);
        const histBass = chStats(hist, 1, 400);
        const histMid = chStats(hist, 2, 400);
        const histHigh = chStats(hist, 3, 400);

        return {
            spectrum: {
                raw,
                juiced,
                smooth,
                waveform: { ...waveRaw, rmsDeviation: waveRmsDev },
            },
            histogram: {
                all: histAll,
                bass: histBass,
                mid: histMid,
                high: histHigh,
            },
            hasChanged,
        };
    }

    update(
        frequencyEnergy: Float32Array,
        fftSpectrum: Float32Array | null,
        audioFrame: BlinkAudioFrame,
        waveformData: Float32Array | null,
        dt: number,
        sampleRate = 48000,
        candidateScalars: Float32Array | null = null,
        fftLogSpectrum: Float32Array | null = null
    ): void {
        const tb = this.surfaces.textureBuffers;

        if (fftSpectrum !== null && fftSpectrum.length >= SPECTRUM_BINS) {
            this._lastFftDb = fftSpectrum;
            // Fill dB→linear intermediate for stage debugging and Juiced Stage A input.
            const dB2linear = tb.rawInputCandidate;
            for (let i = 0; i < SPECTRUM_BINS; i++) {
                const db = fftSpectrum[i] ?? -90;
                const linear = Math.pow(10, Math.max(-90, Math.min(0, db)) / 20) * 2;
                dB2linear[i] = Number.isFinite(linear) ? linear : 0;
            }
            // Build raw spectrum with SSF frequency-axis remapping:
            // Blink FFT spans 0-Nyquist, SSF semantics span ~0-16 kHz.
            buildRawSpectrumFromFFT(fftSpectrum, tb.rawSpectrum, audioFrame.level, sampleRate);
        } else {
            buildRawSpectrum(frequencyEnergy, tb.rawSpectrum);
            // Fallback path when full FFT is unavailable.
            tb.rawInputCandidate.set(tb.rawSpectrum);
        }

        // Populate log-frequency source for Smooth (B) approximation path.
        if (fftLogSpectrum !== null && fftLogSpectrum.length >= SPECTRUM_BINS) {
            buildLogSpectrum(fftLogSpectrum, tb.logSpectrum, audioFrame.level);
        } else {
            tb.logSpectrum.set(tb.rawSpectrum); // graceful fallback when log FFT unavailable
        }

        buildJuicedSpectrum(
            tb.rawInputCandidate,
            this.juicedStageAState,
            this.juicedState,
            this.juicedStageA,
            tb.juicedSpectrum,
            dt,
            this.juicedStageBNormalized
        );
        buildSmoothSpectrum(tb.logSpectrum, this.prevSmooth, tb.smoothSpectrum, audioFrame.level, dt);
        buildWaveform(waveformData, tb.waveform, audioFrame.level);

        this.prevSmooth.set(tb.smoothSpectrum);

        // Capture level scalars every render frame for comparison against Syn scalar values.
        this._levelScalarsBuffer[0] = audioFrame.level;
        this._levelScalarsBuffer[1] = audioFrame.bass;
        this._levelScalarsBuffer[2] = audioFrame.mid;
        this._levelScalarsBuffer[3] = audioFrame.high;

        // Store candidate scalars if provided.
        if (candidateScalars !== null) {
            this._candidateScalarsBuffer.set(candidateScalars.subarray(0, CANDIDATE_SCALAR_COUNT));
        }

        // Throttle LevelTrail pushes to match Synesthesia's audio-frame rate (~31.5 fps).
        this._levelTrailAccumMs += dt * 1000;
        if (this._levelTrailAccumMs >= BlinkAudioTextureRuntime.LEVEL_TRAIL_PUSH_INTERVAL_MS) {
            this._levelTrailAccumMs -= BlinkAudioTextureRuntime.LEVEL_TRAIL_PUSH_INTERVAL_MS;
            this.surfaces.levelHistory.push(audioFrame.level);
            this.surfaces.bassHistory.push(audioFrame.bass);
            this.surfaces.midHistory.push(audioFrame.mid);
            this.surfaces.highHistory.push(audioFrame.high);
        }

        packFxSpectrum(
            tb.rawSpectrum,
            tb.juicedSpectrum,
            tb.smoothSpectrum,
            tb.waveform,
            tb.packedSpectrum,
            SPECTRUM_BINS
        );
        packFxHistogram(
            this.surfaces.levelHistory.read(),
            this.surfaces.bassHistory.read(),
            this.surfaces.midHistory.read(),
            this.surfaces.highHistory.read(),
            tb.packedHistogram,
            HISTOGRAM_WIDTH
        );

        if (this._sessionCallback !== null) {
            this._sessionCallback(tb.packedSpectrum, tb.packedHistogram, this._frameIndex);
        }

        if (this._stageCallback !== null) {
            this._stageCallback(
                {
                    analyserDb: fftSpectrum ?? new Float32Array(0),
                    ...(fftLogSpectrum !== null ? { analyserLogDb: fftLogSpectrum } : {}),
                    rawInputCandidate: tb.rawInputCandidate,
                    rawOutput: tb.rawSpectrum,
                    juicedOutput: tb.juicedSpectrum,
                    smoothOutput: tb.smoothSpectrum,
                    waveformOutput: tb.waveform,
                    packedSpectrum: tb.packedSpectrum,
                    packedLeveltrail: tb.packedHistogram,
                    levelScalars: this._levelScalarsBuffer,
                    candidateScalars: this._candidateScalarsBuffer,
                },
                this._frameIndex
            );
        }

        this.spectrumTexture.commit();
        this.histogramTexture.commit();

        this._frameIndex++;
    }

    captureSpectrumSnapshot(): BlinkAudioSurfaceDump {
        const tb = this.surfaces.textureBuffers;
        return {
            kind: 'spectrum',
            width: SPECTRUM_BINS,
            channels: 4,
            floatCount: SPECTRUM_BINS * 4,
            byteLength: SPECTRUM_BINS * 4 * 4,
            channelLayout: SPECTRUM_CHANNEL_LAYOUT,
            timestamp: new Date().toISOString(),
            frameIndex: this._frameIndex,
            seriesIndex: null,
            bytes: copyArrayBuffer(tb.packedSpectrum),
        };
    }

    captureHistogramSnapshot(): BlinkAudioSurfaceDump {
        const tb = this.surfaces.textureBuffers;
        return {
            kind: 'histogram',
            width: HISTOGRAM_WIDTH,
            channels: 4,
            floatCount: HISTOGRAM_WIDTH * 4,
            byteLength: HISTOGRAM_WIDTH * 4 * 4,
            channelLayout: HISTOGRAM_CHANNEL_LAYOUT,
            timestamp: new Date().toISOString(),
            frameIndex: this._frameIndex,
            seriesIndex: null,
            bytes: copyArrayBuffer(tb.packedHistogram),
        };
    }

    captureSurfaceSnapshot(): BlinkAudioSurfaceSnapshot {
        return {
            source: 'blink',
            capturedAt: new Date().toISOString(),
            frameIndex: this._frameIndex,
            seriesIndex: null,
            spectrum: this.captureSpectrumSnapshot(),
            histogram: this.captureHistogramSnapshot(),
        };
    }

    /** Resolves a `blink.audio.*` pass source (see PassResourceStore) to its backing texture. */
    surface(name: 'spectrum' | 'levelTrail'): UniformValue {
        return name === 'spectrum' ? this.spectrumTexture : this.histogramTexture;
    }

    destroy(): void {
        this.spectrumTexture.destroy();
        this.histogramTexture.destroy();
    }
}
