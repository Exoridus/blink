import { describe, expect, it } from 'vitest';

import {
    JUICED_FILL_FACTOR_HIGH,
    JUICED_FILL_FACTOR_LOW,
    JUICED_INPUT_FLOOR,
    JUICED_INPUT_SCALE,
    JUICED_LOG_CUTOFF_BIN,
    JUICED_PEAK_DECAY,
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
    RAW_FLOOR,
    RAW_OUTPUT_CLAMP,
    TEXTURE_CLAMP_MAX,
} from '../BlinkAudioConstants';
import {
    buildJuicedSpectrum,
    buildJuicedStageA,
    buildJuicedStageB,
    buildLogSpectrum,
    buildRawSpectrum,
    buildRawSpectrumFromFFT,
    buildSmoothSpectrum,
    buildWaveform,
    createJuicedStageAState,
} from '../BlinkSpectrumGenerators';

function stageALookup(i: number): number {
    return Math.exp((i * 9) / 1024);
}

function lowFillCount(i: number): number {
    return Math.ceil((JUICED_LOG_CUTOFF_BIN - i) * (JUICED_LOG_CUTOFF_BIN - i) * JUICED_FILL_FACTOR_LOW);
}

function lowFillStart(i: number): number {
    let start = 0;
    for (let b = 0; b < i; b++) {
        start += lowFillCount(b);
    }
    return start;
}

function computeStageBParams(dt: number) {
    const boostLevel = 2.0 * dt;
    const boostScale = Math.sqrt(2.0 * dt);
    const dVar18 = 1.0 - boostLevel;
    const attackBlend = JUICED_STAGE_B_ATTACK_BASE - dVar18 * JUICED_STAGE_B_ATTACK_DT_SCALE;
    const releaseRate = JUICED_STAGE_B_RELEASE_BASE - dVar18 * JUICED_STAGE_B_RELEASE_DT_SCALE;
    return { attackBlend, releaseRate, boostScale };
}

function referenceStageB(
    stageA: Float32Array,
    stateIn: Float32Array,
    dt: number
): { out: Float32Array; state: Float32Array } {
    const bins = Math.min(stageA.length, stateIn.length);
    const out = new Float32Array(bins);
    const state = new Float32Array(stateIn);
    const normalized = new Float32Array(bins);
    const { attackBlend, releaseRate, boostScale } = computeStageBParams(dt);

    for (let i = 0; i < bins; i++) {
        normalized[i] = (stageA[i] / JUICED_STAGE_B_LN2) * JUICED_STAGE_B_NORMALIZE_SCALE + 1.0;
    }

    const last = bins - 1;
    const n = (j: number): number => normalized[j < 0 ? 0 : j > last ? last : j] ?? 0;

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
        const firScaled = fir * boostScale;
        const prev = state[k];
        if (firScaled <= prev) {
            state[k] = prev - releaseRate * (prev - firScaled);
        } else {
            state[k] = (1.0 - attackBlend) * prev + attackBlend * firScaled;
        }
        out[k] = state[k];
    }

    return { out, state };
}

describe('buildJuicedStageA', () => {
    it('floor branch: raw below 2^-16 produces floor value', () => {
        const input = new Float32Array(1024).fill(0);
        const out = new Float32Array(1024);
        const state = createJuicedStageAState();

        buildJuicedStageA(input, out, state);

        expect(out[0]).toBeCloseTo(JUICED_INPUT_FLOOR, 10);
    });

    it('above-floor branch applies 0.6 scale before peak tracking', () => {
        const input = new Float32Array([0.5]);
        const out = new Float32Array(1);
        const state = createJuicedStageAState();

        buildJuicedStageA(input, out, state);

        expect(state.peakTracker).toBeCloseTo(0.5 * JUICED_INPUT_SCALE, 8);
    });

    it('peak tracker decays each frame and updates on higher scaled input', () => {
        const silent = new Float32Array(1024).fill(0);
        const out = new Float32Array(1024);
        const state = createJuicedStageAState(0.5);

        buildJuicedStageA(silent, out, state);
        expect(state.peakTracker).toBeCloseTo(0.5 * JUICED_PEAK_DECAY, 8);

        const loud = new Float32Array(1024).fill(0);
        loud[0] = 1.0;
        buildJuicedStageA(loud, out, state);
        expect(state.peakTracker).toBeCloseTo(0.6, 8);
    });

    it('applies lookup weighting only when local >= 0.0001', () => {
        const input = new Float32Array(1024).fill(JUICED_INPUT_FLOOR * 0.5);
        input[100] = 1.0;
        const out = new Float32Array(1024);
        const writeIndex = lowFillStart(100);

        const weightedState = createJuicedStageAState();
        buildJuicedStageA(input, out, weightedState);
        expect(out[writeIndex]).toBeCloseTo(stageALookup(100), 5);

        const unweightedState = createJuicedStageAState(1e9);
        buildJuicedStageA(input, out, unweightedState);
        const decayedPeak = 1e9 * JUICED_PEAK_DECAY;
        const expectedLocal = (1.0 * JUICED_INPUT_SCALE) / decayedPeak;
        expect(expectedLocal).toBeLessThan(JUICED_WEIGHT_THRESHOLD);
        expect(out[writeIndex]).toBeCloseTo(expectedLocal, 12);
    });

    it('low-cutoff fill path writes expected repeated slots', () => {
        const input = new Float32Array(1024).fill(0);
        const out = new Float32Array(1024);
        const state = createJuicedStageAState();

        buildJuicedStageA(input, out, state);

        const fill0 = lowFillCount(0);
        for (let i = 0; i < fill0; i++) {
            expect(out[i]).toBeCloseTo(JUICED_INPUT_FLOOR, 10);
        }

        const lowFillTotal = lowFillStart(JUICED_LOG_CUTOFF_BIN);
        expect(out[lowFillTotal - 1]).toBeCloseTo(JUICED_INPUT_FLOOR, 10);
    });

    it('high-cutoff accumulate path combines contributions into shared slot spans', () => {
        const input = new Float32Array(1024).fill(JUICED_INPUT_FLOOR * 0.5);
        input[279] = 1.0;
        input[280] = 1.0;
        const out = new Float32Array(1024);
        const state = createJuicedStageAState();

        buildJuicedStageA(input, out, state);

        const highStart = lowFillStart(JUICED_LOG_CUTOFF_BIN);
        const expectedShared = stageALookup(279) + stageALookup(280);
        expect(out[highStart]).toBeCloseTo(expectedShared, 5);

        const expectedNext = JUICED_INPUT_FLOOR / Math.ceil(3 * 3 * JUICED_FILL_FACTOR_HIGH);
        expect(out[highStart + 2]).toBeCloseTo(expectedNext, 10);
    });

    it('preserves 1024-bin output width', () => {
        const input = new Float32Array(1024).fill(0.25);
        const out = new Float32Array(1024);
        const state = createJuicedStageAState();

        buildJuicedStageA(input, out, state);

        expect(out.length).toBe(1024);
    });
});

describe('buildJuicedStageB', () => {
    it('normalization uses v / ln(2) * 0.0625 + 1', () => {
        const bins = 1024;
        const dt = 0.5;
        const k = 256;
        const stageAZero = new Float32Array(bins);
        const stageAPulse = new Float32Array(bins);
        stageAPulse[k] = JUICED_STAGE_B_LN2 / JUICED_STAGE_B_NORMALIZE_SCALE; // +1 normalized delta at k

        const out0 = new Float32Array(bins);
        const out1 = new Float32Array(bins);
        const state0 = new Float32Array(bins);
        const state1 = new Float32Array(bins);

        buildJuicedStageB(stageAZero, state0, out0, dt);
        buildJuicedStageB(stageAPulse, state1, out1, dt);

        const { attackBlend, boostScale } = computeStageBParams(dt);
        const expectedDelta = attackBlend * boostScale * JUICED_STAGE_B_TAP0;
        expect(out1[k] - out0[k]).toBeCloseTo(expectedDelta, 7);
    });

    it('FIR direct-index implementation matches verified coefficient formula', () => {
        const bins = 1024;
        const dt = 0.016;
        const stageA = new Float32Array(bins);
        const state = new Float32Array(bins);
        for (let i = 0; i < bins; i++) {
            stageA[i] = ((i % 17) - 8) * 0.01;
            state[i] = (i % 11) * 0.005;
        }

        const out = new Float32Array(bins);
        const stateForReference = new Float32Array(state);
        buildJuicedStageB(stageA, state, out, dt);
        const ref = referenceStageB(stageA, stateForReference, dt);

        for (const idx of [0, 1, 2, 17, 113, 279, 511, 777, 1022, 1023]) {
            expect(out[idx]).toBeCloseTo(ref.out[idx], 8);
            expect(state[idx]).toBeCloseTo(ref.state[idx], 8);
        }
    });

    it('preserves duplicate n(k+7) participation in TAP6 and TAP7', () => {
        const bins = 1024;
        const dt = 0.5;
        const k = 100;
        const stageAZero = new Float32Array(bins);
        const stageASpike = new Float32Array(bins);
        stageASpike[k + 7] = JUICED_STAGE_B_LN2 / JUICED_STAGE_B_NORMALIZE_SCALE; // +1 normalized at k+7

        const out0 = new Float32Array(bins);
        const out1 = new Float32Array(bins);
        const state0 = new Float32Array(bins);
        const state1 = new Float32Array(bins);

        buildJuicedStageB(stageAZero, state0, out0, dt);
        buildJuicedStageB(stageASpike, state1, out1, dt);

        const { attackBlend, boostScale } = computeStageBParams(dt);
        const expectedDelta = attackBlend * boostScale * (JUICED_STAGE_B_TAP6 + JUICED_STAGE_B_TAP7);
        expect(out1[k] - out0[k]).toBeCloseTo(expectedDelta, 8);
    });

    it('uses attack branch when firScaled > previous state', () => {
        const bins = 1024;
        const dt = 0.016;
        const stageA = new Float32Array(bins);
        const out = new Float32Array(bins);
        const state = new Float32Array(bins);

        buildJuicedStageB(stageA, state, out, dt);

        const { attackBlend, boostScale } = computeStageBParams(dt);
        const firAtUnity =
            JUICED_STAGE_B_TAP0 +
            2 *
                (JUICED_STAGE_B_TAP1 +
                    JUICED_STAGE_B_TAP2 +
                    JUICED_STAGE_B_TAP3 +
                    JUICED_STAGE_B_TAP4 +
                    JUICED_STAGE_B_TAP5 +
                    JUICED_STAGE_B_TAP6 +
                    JUICED_STAGE_B_TAP7);
        const expected = attackBlend * firAtUnity * boostScale;
        expect(out[500]).toBeCloseTo(expected, 7);
        expect(out[500]).toBeGreaterThan(0);
    });

    it('uses release branch when firScaled <= previous state', () => {
        const bins = 1024;
        const dt = 0.016;
        const stageA = new Float32Array(bins);
        const out = new Float32Array(bins);
        const state = new Float32Array(bins).fill(1.0);

        buildJuicedStageB(stageA, state, out, dt);

        const { releaseRate, boostScale } = computeStageBParams(dt);
        const firAtUnity =
            JUICED_STAGE_B_TAP0 +
            2 *
                (JUICED_STAGE_B_TAP1 +
                    JUICED_STAGE_B_TAP2 +
                    JUICED_STAGE_B_TAP3 +
                    JUICED_STAGE_B_TAP4 +
                    JUICED_STAGE_B_TAP5 +
                    JUICED_STAGE_B_TAP6 +
                    JUICED_STAGE_B_TAP7);
        const firScaled = firAtUnity * boostScale;
        const expected = 1.0 - releaseRate * (1.0 - firScaled);
        expect(out[500]).toBeCloseTo(expected, 7);
        expect(out[500]).toBeLessThan(1.0);
    });

    it('uses boostScale = sqrt(2*dt)', () => {
        const bins = 1024;
        const dt = 0.125;
        const stageA = new Float32Array(bins);
        const out = new Float32Array(bins);
        const state = new Float32Array(bins);

        buildJuicedStageB(stageA, state, out, dt);

        const { attackBlend, boostScale } = computeStageBParams(dt);
        const firAtUnity =
            JUICED_STAGE_B_TAP0 +
            2 *
                (JUICED_STAGE_B_TAP1 +
                    JUICED_STAGE_B_TAP2 +
                    JUICED_STAGE_B_TAP3 +
                    JUICED_STAGE_B_TAP4 +
                    JUICED_STAGE_B_TAP5 +
                    JUICED_STAGE_B_TAP6 +
                    JUICED_STAGE_B_TAP7);
        const expected = attackBlend * firAtUnity * boostScale;
        expect(out[256]).toBeCloseTo(expected, 7);
    });
});

describe('buildJuicedSpectrum', () => {
    it('runs exact Stage A -> Stage B pipeline end-to-end', () => {
        const input = new Float32Array(1024).fill(0);
        input[200] = 1.0;
        const stageA = new Float32Array(1024);
        const juicedState = new Float32Array(1024);
        const out = new Float32Array(1024);
        const stageAState = createJuicedStageAState();

        buildJuicedSpectrum(input, stageAState, juicedState, stageA, out, 0.016);

        expect(out[0]).toBeGreaterThan(0);
        expect(out.length).toBe(1024);
    });
});

describe('buildSmoothSpectrum', () => {
    it('produces non-zero output with non-zero input and audio level', () => {
        const raw = new Float32Array(64).fill(0.8);
        const prev = new Float32Array(64);
        const smooth = new Float32Array(64);

        buildSmoothSpectrum(raw, prev, smooth, 0.5, 0.016);

        expect(smooth[32]).toBeGreaterThan(0);
    });

    it('33-tap moving average smooths nearby bins', () => {
        const bins = 64;
        const raw = new Float32Array(bins);
        raw[32] = 1.0;
        const prev = new Float32Array(bins);
        const smooth = new Float32Array(bins);

        buildSmoothSpectrum(raw, prev, smooth, 1.0, 0.016);

        expect(smooth[32]).toBeGreaterThan(0);
        expect(smooth[31]).toBeGreaterThan(0);
        expect(smooth[33]).toBeGreaterThan(0);
    });
});

describe('buildRawSpectrum', () => {
    it('expands 12 bands and floors at RAW_FLOOR', () => {
        const freq = new Float32Array(12);
        freq[0] = 0.1;
        const raw = new Float32Array(24);

        buildRawSpectrum(freq, raw, 12);

        expect(raw[0]).toBeGreaterThanOrEqual(RAW_FLOOR);
        expect(raw[1]).toBeGreaterThanOrEqual(RAW_FLOOR);
    });

    it('clamps output to [0, 2]', () => {
        const freq = new Float32Array(12).fill(5);
        const raw = new Float32Array(12);

        buildRawSpectrum(freq, raw, 12);

        for (let i = 0; i < 12; i++) {
            expect(raw[i]).toBeGreaterThanOrEqual(RAW_FLOOR);
            expect(raw[i]).toBeLessThanOrEqual(TEXTURE_CLAMP_MAX);
        }
    });
});

describe('buildRawSpectrumFromFFT', () => {
    it('handles null fftDb gracefully', () => {
        const out = new Float32Array(64).fill(99);
        buildRawSpectrumFromFFT(null, out);
        for (const val of out) {
            expect(val).toBeCloseTo(RAW_FLOOR, 8);
        }
    });

    it('clamps output at RAW_OUTPUT_CLAMP for 0 dB input', () => {
        const db = new Float32Array(1).fill(0);
        const out = new Float32Array(1);
        buildRawSpectrumFromFFT(db, out);
        expect(out[0]).toBeCloseTo(RAW_OUTPUT_CLAMP, 2);
    });
});

describe('buildLogSpectrum', () => {
    it('identity-maps bins (no frequency remap)', () => {
        const logFft = new Float32Array(16).fill(-90);
        logFft[8] = -6;
        const out = new Float32Array(16);
        buildLogSpectrum(logFft, out, 1.0);
        expect(out[8]).toBeGreaterThan(out[7]);
        expect(out[8]).toBeGreaterThan(out[9]);
    });
});

describe('buildWaveform', () => {
    it('fills output with zeroes when source is null', () => {
        const out = new Float32Array(100).fill(99);
        buildWaveform(null, out);
        for (let i = 0; i < 100; i++) {
            expect(out[i]).toBe(0);
        }
    });

    it('audioLevel=1.0 doubles input and clamps to [-1, 1]', () => {
        const source = new Float32Array([0.3, -0.3, 0.8, -0.8]);
        const out = new Float32Array(4);
        buildWaveform(source, out, 1.0);

        expect(out[0]).toBeCloseTo(0.6, 5);
        expect(out[1]).toBeCloseTo(-0.6, 5);
        expect(out[2]).toBeCloseTo(1.0, 5);
        expect(out[3]).toBeCloseTo(-1.0, 5);
    });
});
