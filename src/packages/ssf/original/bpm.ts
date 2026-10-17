import { SSF_CONSTANTS as K } from './constants';
import { ssfTransform } from './frontend';
import { f } from './math';

function nearestEven(value: number): number {
    const low = Math.floor(value);
    const fraction = value - low;
    return fraction === 0.5 ? (low % 2 === 0 ? low : low + 1) : Math.round(value);
}

function flatness(values: Float64Array): number {
    let sumLog = 0;
    let total = 0;
    for (const value of values) {
        const rounded = f(value);
        const v = rounded >= 2 ** -126 ? rounded : 2 ** -126;
        sumLog = f(sumLog + f(Math.log(v)));
        total = f(total + v);
    }
    const inverse = f(1 / values.length);
    return f(f(Math.exp(f(sumLog * inverse))) / f(total * inverse));
}

function subBin(best: number, real: Float64Array, imag: Float64Array): number {
    const product = (index: number): number => real[index] * real[best] + imag[index] * imag[best];
    const left = product(best - 1);
    const center = product(best);
    const right = product(best + 1);
    const denominator = left + 2 * center + right;
    if (denominator === 0) return 0;
    const fraction = (left - right) / denominator;
    return fraction === 0 ? 0 : ((Math.sqrt(1 + 8 * fraction * fraction) - 1) * 0.25) / fraction;
}

/** Portable reference FFT profile; cadence is analysis callbacks, independent of render frames. */
export class SsfBpmTracker {
    public bpm = 0;
    public confidence = 0;
    public candidate = 0;
    public rawCandidate = Number.NaN;
    public stability = 0;
    public lastBucket = 0;
    private counter = 0;
    private position = 0;
    private readonly candidates = new Float32Array(60);
    private readonly votes = new Map<number, number>();
    private readonly sums = new Map<number, number>();
    private readonly window = Float32Array.from({ length: 1024 }, (_, i) => {
        const angle = (2 * Math.PI * i) / 1023;
        return f(0.42 - 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle));
    });

    public update(histories: readonly Float32Array[]): void {
        this.counter = (this.counter + 1) % 12;
        if (this.counter !== 0) return;
        if (histories.length !== 22 || histories.some(history => history.length !== 1024))
            throw new RangeError('SSF BPM requires 22 histories of 1024 values');
        const accumulatedPower = new Float64Array(512);
        const accumulatedReal = new Float64Array(512);
        const accumulatedImag = new Float64Array(512);
        for (const history of histories) {
            const input = Float64Array.from(history, (v, i) => v * this.window[i]);
            const { real, imag } = ssfTransform(input, false);
            const power = new Float64Array(512);
            let maxPower = 0;
            for (let i = 0; i < 512; i++) {
                power[i] = real[i] * real[i] + imag[i] * imag[i];
                maxPower = Math.max(maxPower, power[i]);
            }
            const normalized = power.map(value => value / maxPower);
            const ratio = flatness(normalized.slice(10, 44));
            const maxMagnitude = Math.sqrt(maxPower);
            for (let i = 10; i < 44; i++) {
                accumulatedPower[i] += normalized[i] / ratio / ratio;
                accumulatedReal[i] += real[i] / maxMagnitude;
                accumulatedImag[i] += imag[i] / maxMagnitude;
            }
        }
        let best = 10;
        let maximum = 0;
        for (let i = 10; i < 44; i++) {
            if (accumulatedPower[i] > maximum) {
                maximum = accumulatedPower[i];
                best = i;
            }
        }
        this.rawCandidate = (best + subBin(best, accumulatedReal, accumulatedImag)) * K.BPM_SCALE;
        let candidate = Number.isFinite(this.rawCandidate) ? this.rawCandidate : 120;
        if (candidate < 50) candidate *= 2;
        else if (candidate > 220) candidate *= 0.5;
        this.candidate = candidate;
        this.stabilize(candidate);
    }

    private stabilize(candidate: number): void {
        const bucket = (value: number): number => nearestEven(value * K.F_01) - 5;
        const old = this.candidates[this.position];
        const key = bucket(candidate);
        this.votes.set(key, (this.votes.get(key) ?? 0) + 1);
        this.sums.set(key, (this.sums.get(key) ?? 0) + candidate);
        if (old !== 0) {
            const oldKey = bucket(old);
            const votes = this.votes.get(oldKey) ?? 0;
            if (votes >= 1) this.votes.set(oldKey, votes - 1);
            this.sums.set(oldKey, (this.sums.get(oldKey) ?? 0) - old);
        }
        let winner = key;
        let count = 0;
        for (const k of [...this.votes.keys()].sort((a, b) => a - b)) {
            const votes = this.votes.get(k) ?? 0;
            if (votes > count) {
                winner = k;
                count = votes;
            }
        }
        if (winner !== this.lastBucket) {
            this.stability = 0;
            this.lastBucket = winner;
        }
        const target = Math.min(this.stability / 120, 1);
        this.stability++;
        this.confidence = f(this.confidence + 0.2 * (target - this.confidence));
        this.bpm = f((this.sums.get(winner) ?? 0) / count);
        this.candidates[this.position] = f(candidate);
        this.position = (this.position + 1) % 60;
    }
}
