import type { BlinkAudioFrame } from './BlinkAudioFrame';

// ---------------------------------------------------------------------------
// Level EMA — Synesthesia-compatible smoothed band levels
//
// SSF semantics:  source = band energy, normalize with clamp(2*raw, 0, 1),
// slow temporal smoothing with ~98% persistence per frame (alpha ≈ 0.02).
// ---------------------------------------------------------------------------

// Synesthesia's Level EMA: α=0.02 per audio frame at ~31.5 fps.
// Must be dt-scaled so the time constant is frame-rate-independent.
const LEVEL_EMA_ALPHA = 0.02; // per Syn frame
const LEVEL_EMA_REFERENCE_DT = 1 / 31.5; // Syn frame period in seconds

function tickEma(prev: number, input: number, alpha: number): number {
    return prev + alpha * (input - prev);
}

// ---------------------------------------------------------------------------
// RawLevel peak normalizer
//
// SSF semantics: whole-spectrum raw energy, peak-normalized against recent
// maximum. The peak decays over time (half-life ~2 seconds). Output [0, 1].
// ---------------------------------------------------------------------------

const RAW_PEAK_DECAY = 0.9994; // ~2 s half-life at 60 fps

// ---------------------------------------------------------------------------
// Presence — spectral novelty / flux tracker
//
// Presence is NOT plain energy. It is spectral change / novelty:
//   - sustained static tone → lower presence
//   - fresh spectral change → higher presence
//
// Conceptual model (per band):
//   dual tracker:  current follower (fast) + slower baseline
//   presence = normalized exceedance of current over baseline
// ---------------------------------------------------------------------------

const PRESENCE_TRACK_ALPHA = 0.15;
const PRESENCE_BASELINE_ALPHA = 0.02;

// ---------------------------------------------------------------------------
// Hits — quadratic onset emphasis + stateful decay
//
// SSF semantics:  onset-like/transient signal
//   - quadratic emphasis: approx x * (1 + 2x)
//   - moderate decay per frame (~α ≈ 0.10)
// ---------------------------------------------------------------------------

const HITS_DECAY_ALPHA = 0.1;

// ---------------------------------------------------------------------------
// OnBeat — adaptive beat pulse with refractory window
//
// SSF semantics:
//   - adaptive beat pulse
//   - refractory window ~0.12 s
//   - EMA-like decay with α ≈ 0.2
//   - not just boolean isBeat
// ---------------------------------------------------------------------------

const ONBEAT_ALPHA = 0.2;
const ONBEAT_REFRACTORY_S = 0.12;

// ---------------------------------------------------------------------------
// CurvedTime — energy-warped time accumulator
//
// SSF semantics:  energy modulates accumulation rate. Higher musical energy
// accelerates time progression.
// ---------------------------------------------------------------------------

const CURVEDTIME_BASE_RATE = 0.3;

// ---------------------------------------------------------------------------
// BPMSin8 / BPMTri8 — 8 cycles per beat LFOs
//
// 8 cycles per beat (NOT 8-beat period). Output [0, 1] scaled by BPM confidence.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// State container
// ---------------------------------------------------------------------------

class BandPresenceTracker {
    current = 0;
    baseline = 0;

    update(input: number): number {
        this.current = tickEma(this.current, input, PRESENCE_TRACK_ALPHA);
        this.baseline = tickEma(this.baseline, input, PRESENCE_BASELINE_ALPHA);

        if (this.baseline <= 0) return 0;
        const exceedance = Math.max(0, this.current - this.baseline);
        return Math.min(1, exceedance / this.baseline);
    }

    reset(): void {
        this.current = 0;
        this.baseline = 0;
    }
}

export class BlinkAudioSignalState {
    // Level EMA state
    levelEma = 0;
    bassEma = 0;
    midEma = 0;
    midHighEma = 0;
    highEma = 0;

    // RawLevel peak
    rawLevelPeak = 0;

    // Presence trackers (bass, mid, midHigh, high, all)
    bassPresenceTracker = new BandPresenceTracker();
    midPresenceTracker = new BandPresenceTracker();
    midHighPresenceTracker = new BandPresenceTracker();
    highPresenceTracker = new BandPresenceTracker();
    allPresenceTracker = new BandPresenceTracker();

    // Hits state
    bassHits = 0;
    midHits = 0;
    midHighHits = 0;
    highHits = 0;

    // Beat state
    beatTime = 0;
    curvedTime = 0;
    onBeatPulse = 0;
    lastBeatTime = 0;
    lastBeatTick = -1;

    // BPMTwitcher state (placeholder approximation)
    bpmTwitcherPhase = 0;

    reset(): void {
        this.levelEma = 0;
        this.bassEma = 0;
        this.midEma = 0;
        this.midHighEma = 0;
        this.highEma = 0;
        this.rawLevelPeak = 0;
        this.bassPresenceTracker.reset();
        this.midPresenceTracker.reset();
        this.midHighPresenceTracker.reset();
        this.highPresenceTracker.reset();
        this.allPresenceTracker.reset();
        this.bassHits = 0;
        this.midHits = 0;
        this.midHighHits = 0;
        this.highHits = 0;
        this.beatTime = 0;
        this.curvedTime = 0;
        this.onBeatPulse = 0;
        this.lastBeatTime = 0;
        this.lastBeatTick = -1;
        this.bpmTwitcherPhase = 0;
    }
}

// ---------------------------------------------------------------------------
// Per-frame update function
// ---------------------------------------------------------------------------

/**
 * Candidate LevelTrail scalar values captured every render frame.
 *
 * These are PRE-EMA, un-EMA'd candidate values for offline comparison
 * against Synesthesia's scalar ground truth. They do NOT affect live
 * trail behavior — the live trail always uses the formulas in
 * updateBlinkAudioSignals().
 *
 * Index layout (CANDIDATE_SCALAR_NAMES):
 *   0  all_9band_avg    — current live formula (9-band average)
 *   1  all_input_level  — inputLevelValue (getRms×2.5 from AudioService); proven ≈0
 *   2  all_max_narrow   — max(rawE[0..2,4..6,8..10]); best 12-band candidate (ratio 2.00×)
 *   3  all_avg_broad    — avg(rawE[3,7,11])  (broad bands; ranking showed worse than max_narrow)
 *   4  all_max_broad    — max(rawE[3,7,11])
 *   5  mid_proven       — avg(rawE[5,6])  320-1280 Hz (probe-confirmed live formula)
 *   6  mid_3band        — avg(rawE[4,5,6])  includes rawE[4] (wrong: bass range)
 *   7  mid_broad        — rawE[7]  broad mid 160-1280 Hz
 *   8  high_proven      — rawE[10]  5120-10240 Hz (probe-confirmed live formula)
 *   9  high_2band       — avg(rawE[9,10])  old formula (rawE[9] proven wrong)
 *  10  high_broad       — rawE[11]  broad treble 1280-10240 Hz
 *  --- Full-spectrum FFT candidates (require fftSpectrum input) ---
 *  11  all_fft_mean     — mean(10^(dB/20)) over all FFT bins [0..N-1]; 0–Nyquist Hz
 *  12  all_fft_rms      — RMS(10^(dB/20))  over all FFT bins; power-weighted variant
 *  13  all_fft_bp_mean  — mean(10^(dB/20)) over bins ≈ 20–10240 Hz only
 *
 * Semantic justification for indices 11-13:
 *   Decompile of Syn_LevelComponent_Update + FUN_008c6600 + FUN_008c8730 proves that
 *   Band 0 (syn_Level) reads from a per-band ring buffer populated by a full-spectrum
 *   audio primitive. The 12-band AudioService cannot reproduce this exactly. The FFT
 *   candidates test whether the raw linear-amplitude FFT (already computed in Blink's
 *   render path) is a better approximation than any sub-band combination.
 *   Convention: all values are normalized to [0,1] before the ×2 clamp, consistent
 *   with rawE-based candidates above.
 */
export const CANDIDATE_SCALAR_COUNT = 14;
export const CANDIDATE_SCALAR_NAMES = [
    'all_9band_avg',
    'all_input_level',
    'all_max_narrow',
    'all_avg_broad',
    'all_max_broad',
    'mid_proven',
    'mid_3band',
    'mid_broad',
    'high_proven',
    'high_2band',
    'high_broad',
    'all_fft_mean',
    'all_fft_rms',
    'all_fft_bp_mean',
] as const;

/**
 * Compute candidate trail scalars without affecting live EMA state.
 * Returns a Float32Array of length CANDIDATE_SCALAR_COUNT.
 *
 * fftSpectrum: optional raw FFT in dB (from AnalyserNode), length ≥ 1.
 *   When provided, computes full-spectrum candidates at indices 11-13.
 *   When absent, indices 11-13 remain 0.
 */
export function computeTrailCandidates(input: {
    rawFrequencyEnergy?: Float32Array;
    frequencyEnergy: Float32Array;
    inputLevelValue: number;
    fftSpectrum?: Float32Array | null;
}): Float32Array {
    const rawE = input.rawFrequencyEnergy ?? input.frequencyEnergy;
    const out = new Float32Array(CANDIDATE_SCALAR_COUNT);

    const c01 = (v: number) => Math.min(1, Math.max(0, v));

    // all candidates (12-band)
    out[0] = Math.min(
        2 * c01((rawE[0] + rawE[1] + rawE[2] + rawE[4] + rawE[5] + rawE[6] + rawE[8] + rawE[9] + rawE[10]) / 9),
        1
    );
    out[1] = Math.min(input.inputLevelValue * (2 / 2.5), 1); // getRms×2.5×0.8 — proven ≈0
    out[2] = Math.min(
        2 *
            Math.max(
                c01(rawE[0]),
                c01(rawE[1]),
                c01(rawE[2]),
                c01(rawE[4]),
                c01(rawE[5]),
                c01(rawE[6]),
                c01(rawE[8]),
                c01(rawE[9]),
                c01(rawE[10])
            ),
        1
    );
    out[3] = Math.min(2 * c01((rawE[3] + rawE[7] + rawE[11]) / 3), 1);
    out[4] = Math.min(2 * Math.max(c01(rawE[3]), c01(rawE[7]), c01(rawE[11])), 1);

    // mid candidates
    out[5] = Math.min(2 * c01((rawE[5] + rawE[6]) / 2), 1); // mid_proven (live formula)
    out[6] = Math.min(2 * c01((rawE[4] + rawE[5] + rawE[6]) / 3), 1); // mid_3band  (rawE[4] wrong)
    out[7] = Math.min(2 * c01(rawE[7]), 1); // mid_broad

    // high candidates
    out[8] = Math.min(2 * c01(rawE[10]), 1); // high_proven (live formula)
    out[9] = Math.min(2 * c01((rawE[9] + rawE[10]) / 2), 1); // high_2band  (rawE[9] wrong)
    out[10] = Math.min(2 * c01(rawE[11]), 1); // high_broad

    // Full-spectrum FFT candidates (indices 11-13)
    const fft = input.fftSpectrum;
    if (fft !== null && fft !== undefined && fft.length > 0) {
        const n = fft.length;
        let sum = 0,
            sumSq = 0;
        // Band-pass cutoff: bins covering ≈20–10240 Hz.
        // At 48 kHz with n-bin FFT: bin = freq × n / (sampleRate/2) = freq × n / 24000.
        // Approximate for typical 48 kHz / 1024-bin: 10240 Hz → bin 437.
        // Use min(n, 440) as safe upper bound; bin 0 (DC) excluded.
        const bpEnd = Math.min(n, 440);
        let bpSum = 0;

        for (let i = 0; i < n; i++) {
            const lin = Math.pow(10, Math.max(-90, Math.min(0, fft[i] ?? -90)) / 20);
            sum += lin;
            sumSq += lin * lin;
            if (i >= 1 && i < bpEnd) bpSum += lin;
        }

        const mean = sum / n;
        const rms = Math.sqrt(sumSq / n);
        const bpMean = bpSum / (bpEnd - 1);

        out[11] = Math.min(2 * c01(mean), 1); // all_fft_mean
        out[12] = Math.min(2 * c01(rms), 1); // all_fft_rms
        out[13] = Math.min(2 * c01(bpMean), 1); // all_fft_bp_mean (20–10240 Hz)
    }

    return out;
}

export interface AudioSignalInput {
    frequencyEnergy: Float32Array;
    rawFrequencyEnergy?: Float32Array;
    beatIntensity: number;
    downbeatIntensity: number;
    beatPulse: number;
    barPulse: number;
    beatPhase: number;
    onsetStrength: number;
    bpm: number;
    inputLevelValue: number;
    currentTime: number;
    dt: number;
}

function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
}

export function updateBlinkAudioSignals(state: BlinkAudioSignalState, input: AudioSignalInput): BlinkAudioFrame {
    const e = input.frequencyEnergy;

    // Use raw (unboosted) band energies for Level EMA when available.
    // This matches Synesthesia's LevelTrail source: clean band energies
    // without beat-detection boosts or heavy smoothing.
    const rawE = input.rawFrequencyEnergy ?? e;

    // ---- Raw band values for Hits/Presence (use smoothed e to keep responsiveness) ----
    const rawBass = clamp01((e[0] + e[1] + e[2]) / 3);
    const rawMid = clamp01((e[4] + e[5]) / 2);
    const rawMidHigh = clamp01((e[6] + e[8]) / 2);
    const rawHigh = clamp01((e[9] + e[10]) / 2);

    // ---- LevelTrail source values ----
    // Band coverage proven by probe-segment analysis (2026-05-13):
    //   bass: 20-200 Hz  — 60 Hz bass=0.475, 180 Hz bass=0.794, 440 Hz bass≈0
    //   mid:  320-1280 Hz — 440 Hz mid=0.812, 1000 Hz mid=0.791, 2000 Hz mid=0.000
    //   high: 5120+ Hz   — 4000 Hz high=0.000, 8000 Hz high=0.673, 12000 Hz high=0.838
    //   all:  full spectrum (ratio vs. Blink ≈ 6.83×, requires dedicated analysis)
    const trailBass = Math.min(2 * clamp01((rawE[0] + rawE[1] + rawE[2]) / 3), 1);
    // rawE[4] (160-320 Hz) is bass range — removed. rawE[6] (640-1280 Hz) IS mid — added.
    const trailMid = Math.min(2 * clamp01((rawE[5] + rawE[6]) / 2), 1);
    const trailMidHigh = Math.min(2 * clamp01((rawE[6] + rawE[8]) / 2), 1);
    // rawE[9] (2560-5120 Hz) is NOT Syn high. Syn high also includes >10240 Hz (uncapturable).
    const trailHigh = Math.min(2 * clamp01(rawE[10]), 1);
    const trailLevel = Math.min(
        2 * clamp01((rawE[0] + rawE[1] + rawE[2] + rawE[4] + rawE[5] + rawE[6] + rawE[8] + rawE[9] + rawE[10]) / 9),
        1
    );

    // ---- Level EMA (dt-scaled to match Synesthesia's ~31.5 fps time constant) ----
    const dtAlpha = 1 - Math.pow(1 - LEVEL_EMA_ALPHA, input.dt / LEVEL_EMA_REFERENCE_DT);
    state.levelEma = tickEma(state.levelEma, trailLevel, dtAlpha);
    state.bassEma = tickEma(state.bassEma, trailBass, dtAlpha);
    state.midEma = tickEma(state.midEma, trailMid, dtAlpha);
    state.midHighEma = tickEma(state.midHighEma, trailMidHigh, dtAlpha);
    state.highEma = tickEma(state.highEma, trailHigh, dtAlpha);

    // ---- All-band raw level (for Presence/RawLevel, unchanged source) ----
    const rawLevel = clamp01(
        (rawE[0] +
            rawE[1] +
            rawE[2] +
            rawE[3] +
            rawE[4] +
            rawE[5] +
            rawE[6] +
            rawE[7] +
            rawE[8] +
            rawE[9] +
            rawE[10] +
            rawE[11]) /
            12
    );

    // ---- RawLevel peak normalization ----
    if (rawLevel > state.rawLevelPeak) {
        state.rawLevelPeak = rawLevel;
    } else {
        state.rawLevelPeak *= RAW_PEAK_DECAY;
    }
    const rawLevelNorm = state.rawLevelPeak > 0 ? clamp01(rawLevel / state.rawLevelPeak) : 0;

    // ---- InputLevel ----
    const inputLevel = clamp01(input.inputLevelValue);

    // ---- Presence (spectral novelty) ----
    const allPresence = state.allPresenceTracker.update(rawLevel);
    const bassPresence = state.bassPresenceTracker.update(rawBass);
    const midPresence = state.midPresenceTracker.update(rawMid);
    const midHighPresence = state.midHighPresenceTracker.update(rawMidHigh);
    const highPresence = state.highPresenceTracker.update(rawHigh);

    // ---- Hits (quadratic onset emphasis) ----
    const hitEnergy = clamp01(input.onsetStrength * 1.25 + input.beatPulse * 0.3);
    const hitQuadratic = hitEnergy * (1 + 2 * hitEnergy);

    state.bassHits = tickEma(state.bassHits, hitQuadratic * rawBass * 1.5, HITS_DECAY_ALPHA);
    state.midHits = tickEma(state.midHits, hitQuadratic * rawMid * 1.3, HITS_DECAY_ALPHA);
    state.midHighHits = tickEma(state.midHighHits, hitQuadratic * rawMidHigh * 1.2, HITS_DECAY_ALPHA);
    state.highHits = tickEma(state.highHits, hitQuadratic * rawHigh * 1.1, HITS_DECAY_ALPHA);

    const compositeHit = clamp01(
        state.bassHits * 0.35 + state.midHits * 0.3 + state.midHighHits * 0.2 + state.highHits * 0.15
    );

    // ---- OnBeat pulse ----
    const currentTick = Math.floor(input.currentTime * 1000);
    const beatPulseIn = input.beatPulse;
    if (beatPulseIn > state.onBeatPulse && currentTick - state.lastBeatTick > ONBEAT_REFRACTORY_S * 1000) {
        state.onBeatPulse = Math.max(state.onBeatPulse, clamp01(beatPulseIn));
        state.lastBeatTick = currentTick;
    }
    state.onBeatPulse = tickEma(state.onBeatPulse, 0, ONBEAT_ALPHA);

    // ---- BeatTime ----
    if (input.beatPulse > 0.35 && currentTick - state.lastBeatTime > 200) {
        state.beatTime += 1;
        state.lastBeatTime = currentTick;
    }

    // ---- CurvedTime ----
    const energyWarp = 1 + rawLevel * 3;
    state.curvedTime += input.dt * CURVEDTIME_BASE_RATE * energyWarp;

    // ---- BPMSin8 / BPMTri8 ----
    const bpmConfidenceFromInput = clamp01(input.onsetStrength * 0.7 + (1 - Math.abs(input.bpm - 120) / 80) * 0.3);
    const phase8 = (input.beatPhase * 8) % 1;
    const bpmsin8 = (Math.sin(input.beatPhase * 8 * Math.PI * 2) + 1) * 0.5 * bpmConfidenceFromInput;
    const bpmtri8 = (phase8 < 0.5 ? 2 * phase8 : 2 * (1 - phase8)) * bpmConfidenceFromInput;

    // ---- BPMTwitcher approximation ----
    state.bpmTwitcherPhase = (state.bpmTwitcherPhase + input.dt * (input.bpm / 60) * 3) % 1;
    const bpmTwitcher = clamp01((Math.sin(state.bpmTwitcherPhase * Math.PI * 2) * 0.5 + 0.5) * bpmConfidenceFromInput);

    return {
        level: clamp01(state.levelEma),
        bass: clamp01(state.bassEma),
        mid: clamp01(state.midEma),
        midHigh: clamp01(state.midHighEma),
        high: clamp01(state.highEma),
        onset: clamp01(input.onsetStrength),
        hit: clamp01(compositeHit),
        bassHit: clamp01(state.bassHits),
        midHit: clamp01(state.midHits),
        midHighHit: clamp01(state.midHighHits),
        highHit: clamp01(state.highHits),
        presence: clamp01(allPresence),
        bassPresence: clamp01(bassPresence),
        midPresence: clamp01(midPresence),
        midHighPresence: clamp01(midHighPresence),
        highPresence: clamp01(highPresence),
        beatPulse: clamp01(input.beatPulse),
        barPulse: clamp01(input.barPulse),
        beatPhase: clamp01(input.beatPhase),
        bpm: Math.round(input.bpm),
        bpmConfidence: clamp01(bpmConfidenceFromInput),
        rawLevel: clamp01(rawLevelNorm),
        inputLevel: clamp01(inputLevel),
        onBeat: clamp01(state.onBeatPulse),
        beatTime: state.beatTime,
        curvedTime: clamp01(state.curvedTime % 1),
        bpmsin8: clamp01(bpmsin8),
        bpmtri8: clamp01(bpmtri8),
        bpmTwitcher: clamp01(bpmTwitcher),
    };
}
