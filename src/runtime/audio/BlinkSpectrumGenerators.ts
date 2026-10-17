/**
 * Spectrum generation helpers for the BlinkFX audio surface.
 *
 * All functions are pure — they take Float32Array inputs and write
 * results into caller-provided output arrays. No ExoJS dependency.
 */

import {
    JUICED_FILL_FACTOR_HIGH,
    JUICED_FILL_FACTOR_LOW,
    JUICED_INPUT_FLOOR,
    JUICED_INPUT_SCALE,
    JUICED_LINEAR_B,
    JUICED_LOG_CUTOFF_BIN,
    JUICED_PEAK_DECAY,
    JUICED_PEAK_MIN,
    JUICED_PEAK_TRACKER_INIT,
    JUICED_QUAD_COEFF,
    JUICED_STAGE_B_ATTACK_BASE,
    JUICED_STAGE_B_ATTACK_DT_SCALE,
    JUICED_STAGE_B_LN2,
    JUICED_STAGE_B_NORMALIZE_SCALE,
    JUICED_STAGE_B_RELEASE_BASE,
    JUICED_STAGE_B_RELEASE_DT_SCALE,
    JUICED_STAGE_B_TAP0,
    JUICED_STAGE_B_TAP1,
    JUICED_STAGE_B_TAP2,
    JUICED_STAGE_B_TAP3,
    JUICED_STAGE_B_TAP4,
    JUICED_STAGE_B_TAP5,
    JUICED_STAGE_B_TAP6,
    JUICED_STAGE_B_TAP7,
    JUICED_WEIGHT_THRESHOLD,
    RAW_BOOST_CLAMP,
    RAW_FLOOR,
    RAW_OUTPUT_CLAMP,
    RAW_SCALE_FACTOR,
    RAW_THRESHOLD,
} from './BlinkAudioConstants';

function clampRange(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

function clamp01(v: number): number {
    return clampRange(v, 0, 1);
}

function clampIndex(i: number, max: number): number {
    return i < 0 ? 0 : i > max ? max : i;
}

const JUICED_LOOKUP_SIZE = 1024;
const JUICED_LOOKUP_MULT = 9 / JUICED_LOOKUP_SIZE;

// Stage A lookup table:
// lookupTable[i] = exp(i * 9 / 1024), i=0..1023.
const JUICED_STAGE_A_LOOKUP_TABLE = (() => {
    const table = new Float32Array(JUICED_LOOKUP_SIZE);
    for (let i = 0; i < JUICED_LOOKUP_SIZE; i++) {
        table[i] = Math.exp(i * JUICED_LOOKUP_MULT);
    }
    return table;
})();

export interface JuicedStageAState {
    peakTracker: number;
}

export function createJuicedStageAState(initialPeakTracker: number = JUICED_PEAK_TRACKER_INIT): JuicedStageAState {
    return { peakTracker: initialPeakTracker };
}

/**
 * Stage A — Syn_SpectrumJuiced2D_Update
 *
 * Input:
 *   linear FFT bins (expected 1024)
 *
 * Output:
 *   stageA (1024 bins)
 *
 * Stateful:
 *   peakTracker
 */
export function buildJuicedStageA(
    linearFftSpectrum: Float32Array,
    stageAOut: Float32Array,
    state: JuicedStageAState
): void {
    const bins = Math.min(linearFftSpectrum.length, stageAOut.length, JUICED_LOOKUP_SIZE);
    stageAOut.fill(0);
    if (bins <= 0) {
        return;
    }

    // Per-frame peak decay before processing bins.
    state.peakTracker *= JUICED_PEAK_DECAY;
    if (state.peakTracker < JUICED_PEAK_MIN) {
        state.peakTracker = JUICED_PEAK_MIN;
    }

    let writeIndex = 0;
    let accumCount = 1;
    let accumStart = JUICED_LOG_CUTOFF_BIN;

    for (let i = 0; i < bins; i++) {
        const raw = linearFftSpectrum[i] ?? 0;
        let local: number;

        if (raw >= JUICED_INPUT_FLOOR) {
            const scaled = Math.min(raw * JUICED_INPUT_SCALE, 1);
            if (scaled > state.peakTracker) {
                state.peakTracker = scaled;
            }

            local = scaled / state.peakTracker;
            if (local >= JUICED_WEIGHT_THRESHOLD) {
                local *= JUICED_STAGE_A_LOOKUP_TABLE[i];
            }
        } else {
            // Exact floor branch: no peakTracker update.
            local = JUICED_INPUT_FLOOR;
        }

        if (i < JUICED_LOG_CUTOFF_BIN) {
            const distance = JUICED_LOG_CUTOFF_BIN - i;
            const fillCount = Math.ceil(distance * distance * JUICED_FILL_FACTOR_LOW);

            for (let n = 0; n < fillCount; n++) {
                if (writeIndex < bins) {
                    stageAOut[writeIndex] = local;
                    writeIndex++;
                }
            }
            continue;
        }

        if (i === JUICED_LOG_CUTOFF_BIN) {
            if (writeIndex < bins) {
                stageAOut[writeIndex] = 0;
            }
            accumCount = 1;
            accumStart = JUICED_LOG_CUTOFF_BIN;
        }

        const slotSpan = Math.ceil(accumCount * accumCount * JUICED_FILL_FACTOR_HIGH);

        if (writeIndex < bins) {
            stageAOut[writeIndex] += local / slotSpan;
        }

        if (slotSpan <= i - accumStart) {
            writeIndex++;
            accumCount++;

            if (writeIndex < bins) {
                stageAOut[writeIndex] = 0;
            }

            accumStart = i;
        }
    }
}

/**
 * Stage B — Syn_SpectrumJuiced_Update
 *
 * Input:
 *   stageA (1024 bins)
 *
 * Stateful:
 *   juicedState (1024 bins)
 *
 * Output:
 *   outJuiced (1024 bins)
 */
export function buildJuicedStageB(
    stageA: Float32Array,
    juicedState: Float32Array,
    outJuiced: Float32Array,
    dt = 0.016,
    normalizedScratch?: Float32Array
): void {
    const bins = Math.min(stageA.length, juicedState.length, outJuiced.length);
    if (bins <= 0) {
        return;
    }

    const normalized =
        normalizedScratch !== undefined && normalizedScratch.length >= bins
            ? normalizedScratch
            : new Float32Array(bins);

    for (let i = 0; i < bins; i++) {
        normalized[i] = ((stageA[i] ?? 0) / JUICED_STAGE_B_LN2) * JUICED_STAGE_B_NORMALIZE_SCALE + 1;
    }

    const boostLevel = 2 * dt;
    const boostScale = Math.sqrt(2 * dt);
    const dVar18 = 1 - boostLevel;
    const attackBlend = JUICED_STAGE_B_ATTACK_BASE - dVar18 * JUICED_STAGE_B_ATTACK_DT_SCALE;
    const releaseRate = JUICED_STAGE_B_RELEASE_BASE - dVar18 * JUICED_STAGE_B_RELEASE_DT_SCALE;
    const last = bins - 1;

    const n = (j: number): number => normalized[clampIndex(j, last)] ?? 0;

    for (let k = 0; k < bins; k++) {
        const fir =
            n(k) * JUICED_STAGE_B_TAP0 +
            (n(k - 1) + n(k + 1)) * JUICED_STAGE_B_TAP1 +
            (n(k - 3) + n(k + 3)) * JUICED_STAGE_B_TAP2 +
            (n(k - 2) + n(k + 2)) * JUICED_STAGE_B_TAP3 +
            (n(k - 5) + n(k + 5)) * JUICED_STAGE_B_TAP4 +
            (n(k - 4) + n(k + 4)) * JUICED_STAGE_B_TAP5 +
            (n(k - 6) + n(k + 7)) * JUICED_STAGE_B_TAP6 +
            (n(k - 7) + n(k + 7)) * JUICED_STAGE_B_TAP7;

        // Verified runtime branch for real frame times (boostLevel << 1.0):
        const firScaled = fir * boostScale;
        const prev = juicedState[k] ?? 0;

        juicedState[k] =
            firScaled <= prev
                ? prev - releaseRate * (prev - firScaled)
                : (1 - attackBlend) * prev + attackBlend * firScaled;

        outJuiced[k] = juicedState[k];
    }
}

/**
 * End-to-end exact Juiced pipeline:
 *   linear FFT -> Stage A -> Stage B
 */
export function buildJuicedSpectrum(
    linearFftSpectrum: Float32Array,
    stageAState: JuicedStageAState,
    juicedState: Float32Array,
    stageAOut: Float32Array,
    outJuiced: Float32Array,
    dt = 0.016,
    normalizedScratch?: Float32Array
): void {
    buildJuicedStageA(linearFftSpectrum, stageAOut, stageAState);
    buildJuicedStageB(stageAOut, juicedState, outJuiced, dt, normalizedScratch);
}

/**
 * Build a smooth spectrum using forensics-backed algorithm.
 *
 * Algorithm (from Synesthesia SmootherSpectrum2DComponent forensics):
 *
 * 1. Apply a 33-tap uniform moving-average across neighbouring bins to the
 *    input spectrum.  This creates a "spatially" smoothed version.
 * 2. Per-bin emphasis: higher bins receive slightly stronger weighting:
 *       emphasis = 1.0 + pow(binFrac, 4.0) * 0.25
 * 3. Temporal blend controlled by the overall audio level:
 *       tempo  = (clamp(binFrac, 0.5, 0.75) - 0.5) * 4.0
 *       blend  = audioLevel * 0.4
 *       result = (tempo + 1.0) * smoothed * blend + (1.0 - blend) * prevOutput[i]
 * 4. If the audio level is low (audioLevel * 2 <= 1.0), scale down by the
 *    audio level to avoid noise-floor artefacts during silence.
 * 5. Final clamp to [0, 1].
 *
 * @param inputSpectrum — input spectrum [0, 2] per bin
 * @param prevSmooth — previous frame's smooth output (stateful)
 * @param outSmooth  — output smooth spectrum [0, 1] per bin
 * @param audioLevel — overall audio level [0, 1] for temporal blend
 * @param dt         — delta-time in seconds (reserved for future use)
 */
export function buildSmoothSpectrum(
    inputSpectrum: Float32Array,
    prevSmooth: Float32Array,
    outSmooth: Float32Array,
    audioLevel: number,
    _dt = 0.016
): void {
    const bins = Math.min(inputSpectrum.length, outSmooth.length, prevSmooth.length);
    const kernelRadius = 16; // 33-tap = radius 16 on each side
    const blendFactor = clamp01(audioLevel) * 0.4;

    for (let i = 0; i < bins; i++) {
        // 1. 33-tap moving average
        let acc = 0;
        let count = 0;
        for (let k = -kernelRadius; k <= kernelRadius; k++) {
            const idx = i + k;
            if (idx >= 0 && idx < bins) {
                acc += inputSpectrum[idx];
                count++;
            }
        }
        const smoothed = count > 0 ? acc / count : 0;

        // 2. Per-bin emphasis
        const binFrac = i / (bins - 1 || 1);
        const emphasis = 1 + Math.pow(binFrac, 4) * 0.25;
        const emphasised = smoothed * emphasis;

        // 3. Temporal blend
        const tempo = (clampRange(binFrac, 0.5, 0.75) - 0.5) * 4;
        const result = (tempo + 1) * emphasised * blendFactor + (1 - blendFactor) * (prevSmooth[i] ?? 0);

        // 4. Quiet attenuation
        let final = result;
        if (clamp01(audioLevel) * 2 <= 1) {
            final *= clamp01(audioLevel);
        }

        // 5. Clamp to [0, 1]
        outSmooth[i] = clampRange(final, 0, 1);
    }
}

/**
 * Build a raw spectrum from full-FFT dB-spectrum data with SSF frequency-axis
 * remapping.
 *
 * **Frequency-axis remapping:**
 *
 * Blink's Web Audio FFT spans 0 Hz → Nyquist (sampleRate/2, typically 24000 Hz)
 * across `fftDb.length` bins.  Synesthesia's `syn_Spectrum` semantics span
 * approximately 0 Hz → 16000 Hz across the same 1024 logical bins.  To match
 * Synesthesia's visual layout, each output bin `i` samples the source FFT at
 * the frequency that corresponds to the SSF-compatible range.
 *
 *   sourceBin = i * SSF_MAX_FREQ_HZ / nyquistHz
 *            = i * 16000 / (sampleRate / 2)
 *
 * At sampleRate=48000, sourceBin ≈ i * 0.667, mapping the lower ~683 FFT bins
 * onto all 1024 SSF target bins.
 *
 * **Amplitude processing** (unchanged from prior forensics):
 *
 *   1. Convert dB → linear magnitude
 *   2. Floor at RAW_FLOOR
 *   3. Near-floor threshold (1e-4) gates active bins from noise
 *   4. Quadratic boost + lower-clamp
 *   5. Final clamp to [RAW_FLOOR, OUTPUT_CLAMP]
 *
 * @param fftDb      — dB-scaled FFT from the analyser (native Nyquist-spaced)
 * @param outRaw     — output raw spectrum [RAW_FLOOR, OUTPUT_CLAMP]
 * @param audioLevel — overall audio level [0, 1]
 * @param sampleRate — AudioContext sample rate in Hz (default 48000)
 */
export function buildRawSpectrumFromFFT(
    fftDb: Float32Array | null,
    outRaw: Float32Array,
    audioLevel = 1,
    sampleRate = 48000
): void {
    if (fftDb === null || fftDb.length === 0) {
        outRaw.fill(RAW_FLOOR);
        return;
    }

    const SSF_MAX_FREQ_HZ = 16000;
    const nyquistHz = sampleRate / 2;
    const freqScale = SSF_MAX_FREQ_HZ / nyquistHz;
    const srcBins = fftDb.length;

    const QUAD_COEFF = JUICED_QUAD_COEFF; // 125/44 ≈ 2.840909 — shared with buildLogSpectrum
    const LIN_COEFF = JUICED_LINEAR_B; // 27/55  ≈ 0.490909 — shared with buildLogSpectrum
    const level = clamp01(audioLevel);
    const bins = outRaw.length;

    for (let i = 0; i < bins; i++) {
        // Frequency-axis remap: map SSF bin i onto source FFT bin
        const srcIdx = clampRange(Math.floor((i * freqScale * srcBins) / bins), 0, srcBins - 1);
        const db = fftDb[srcIdx] ?? -90;
        const clampedDb = clampRange(db, -90, 0);
        const linear = Math.pow(10, clampedDb / 20);
        const scaled = linear * RAW_SCALE_FACTOR;

        if (!isFinite(scaled) || scaled < RAW_FLOOR) {
            outRaw[i] = RAW_FLOOR;
            continue;
        }

        if (scaled > RAW_THRESHOLD) {
            let boosted = scaled * scaled * QUAD_COEFF + scaled * LIN_COEFF;
            boosted = clampRange(boosted, (scaled + 1) * 0.5, RAW_BOOST_CLAMP);
            boosted = Math.max(scaled, boosted);
            outRaw[i] = clampRange(boosted, RAW_FLOOR, RAW_OUTPUT_CLAMP);
        } else {
            outRaw[i] = clampRange(scaled * Math.sqrt(level * 2), RAW_FLOOR, RAW_OUTPUT_CLAMP);
        }
    }
}

/**
 * Build a log-frequency spectrum from pre-log-remapped dBFS data.
 *
 * Input: 1024 dBFS bins already octave-spaced from 30 Hz to 16 kHz,
 * as returned by `getSpectrumLogFloat({ bands: 1024, fMin: 30, fMax: 16000 })`.
 *
 * Applies the same amplitude pipeline (dB→linear, scale, threshold, quadratic
 * boost, clamp) as `buildRawSpectrumFromFFT` but with no frequency remapping,
 * since ExoJS has already placed each bin on the correct log-frequency axis.
 *
 * Used by the temporary Smooth (B) approximation path.
 */
export function buildLogSpectrum(logFftDb: Float32Array, outLog: Float32Array, audioLevel = 1): void {
    const QUAD_COEFF = JUICED_QUAD_COEFF;
    const LIN_COEFF = JUICED_LINEAR_B;
    const level = clamp01(audioLevel);
    const bins = Math.min(logFftDb.length, outLog.length);

    for (let i = 0; i < bins; i++) {
        const db = logFftDb[i] ?? -90;
        const clampedDb = clampRange(db, -90, 0);
        const linear = Math.pow(10, clampedDb / 20);
        const scaled = linear * RAW_SCALE_FACTOR;

        if (!isFinite(scaled) || scaled < RAW_FLOOR) {
            outLog[i] = RAW_FLOOR;
            continue;
        }

        if (scaled > RAW_THRESHOLD) {
            let boosted = scaled * scaled * QUAD_COEFF + scaled * LIN_COEFF;
            boosted = clampRange(boosted, (scaled + 1) * 0.5, RAW_BOOST_CLAMP);
            boosted = Math.max(scaled, boosted);
            outLog[i] = clampRange(boosted, RAW_FLOOR, RAW_OUTPUT_CLAMP);
        } else {
            outLog[i] = clampRange(scaled * Math.sqrt(level * 2), RAW_FLOOR, RAW_OUTPUT_CLAMP);
        }
    }
}

/**
 * Build a raw spectrum from the 12-band frequency energy array.
 *
 * Linear expansion from 12 bands to the target bin count.
 * Each output bin is floored at `RAW_FLOOR` (1e-5).
 *
 * Use `buildRawSpectrumFromFFT` for full-resolution data when available;
 * this is the fallback for when only band energy is accessible.
 */
export function buildRawSpectrum(frequencyEnergy: Float32Array, outRaw: Float32Array, numBands = 12): void {
    const bins = outRaw.length;
    const binsPerBand = bins / numBands;

    for (let i = 0; i < bins; i++) {
        const band = Math.min(Math.floor(i / binsPerBand), numBands - 1);
        const v = frequencyEnergy[band] ?? 0;
        outRaw[i] = Math.max(RAW_FLOOR, clampRange(v, 0, 2));
    }
}

/**
 * Build a waveform buffer by downsampling from an optional source.
 *
 * If source is null or empty, the output is filled with zeroes.
 * Source samples are assumed to be in [-1, 1].
 *
 * Recovered Synesthesia formula:
 *   scaled = inputSample * 2 * audioLevel
 *   output = clamp(scaled, -1, 1)
 *
 * packFxSpectrum then remaps [-1, 1] → [0, 1] via (x + 1) * 0.5,
 * producing the final syn_Spectrum.a texture values.
 *
 * When the source length differs from the output length, samples are
 * mapped via nearest-neighbour (floor(i * step)) so that a 2048-sample
 * AudioAnalyser waveform fits within the 1024-bin A-channel.
 *
 * @param source       — time-domain waveform samples in [-1, 1]
 * @param outWaveform  — output waveform buffer (1024 samples)
 * @param audioLevel   — overall audio level [0, 1] for amplitude scaling
 */
export function buildWaveform(source: Float32Array | null, outWaveform: Float32Array, audioLevel = 1): void {
    if (source === null || source.length === 0) {
        outWaveform.fill(0);
        return;
    }
    const step = source.length / outWaveform.length;
    const level = clamp01(audioLevel);
    for (let i = 0; i < outWaveform.length; i++) {
        const sample = source[Math.floor(i * step)] ?? 0;
        outWaveform[i] = clampRange(sample * 2 * level, -1, 1);
    }
}
