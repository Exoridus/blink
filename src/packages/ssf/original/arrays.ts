import { SSF_CONSTANTS as K } from './constants';
import { clamp, f, floatWords, lerp } from './math';
import tables from './tables.json';

function compress(value: number, r2: number): number {
    const quad = f(f(f(value * value) * K.C625) * K.QUAD_A + value * K.QUAD_B);
    const gate = K.F_0721 > value ? 0 : 1;
    return lerp(value, lerp(quad, f(f(value + 1) * 0.5), gate), f(r2 - 1));
}

export function ssfRawSpectrum(source: Float32Array, reactivity: number): Float32Array {
    const r2 = f(2 * f(reactivity));
    const scale = f(Math.cbrt(r2));
    return source.map(value => {
        const x = value >= 1e-5 ? value : K.RAW_FLOOR;
        const a = f(f(f(Math.log(x)) * K.R24) + 1);
        return r2 > 1 ? compress(a, r2) : f(a * scale);
    });
}

export function ssfWaveform(source: Float32Array, reactivity: number): Float32Array {
    if (source.length < 1024) return new Float32Array(source);
    const r2 = f(2 * f(reactivity));
    return source.slice(0, 1024).map(value => f(0.5 * (clamp(f(value * r2), -1, 1) + 1)));
}

export class SsfTimeSeries {
    private readonly data = new Float32Array(800);
    private position = 0;

    public update(band: number): Float32Array {
        const x = f(clamp(f(2 * f(band)), 0, 1) * f(0.6));
        const next = f(x + 0.4 * this.data[(this.position + 399) % 400]);
        this.data[this.position] = this.data[this.position + 400] = next;
        this.position = (this.position + 1) % 400;
        return this.data.slice(this.position, this.position + 400);
    }
}

/** Channels are producer values; waveform is already mapped and history is oldest first. */
export function packSsfAudio(
    channels: readonly [Float32Array, Float32Array, Float32Array, Float32Array]
): Float32Array {
    const width = channels[0].length;
    if (channels.some(channel => channel.length !== width)) throw new RangeError('SSF audio channel lengths differ');
    const packed = new Float32Array(width * 4);
    for (let i = 0; i < width; i++) {
        for (let channel = 0; channel < 4; channel++) {
            const value = channels[channel][i];
            // MINSS/MAXSS select their second operand for unordered comparisons and equal zero.
            const upper = value < 2 ? value : 2;
            packed[i * 4 + channel] = upper > 0 ? upper : 0;
        }
    }
    return packed;
}

export class SsfJuiced {
    private gain = 2 ** -126;
    private readonly weights = Float32Array.from({ length: 1024 }, (_, i) => f(Math.exp(f(f(i) * K.WEIGHT_EXP_C))));
    private readonly work = new Float32Array(1024);
    private readonly output = new Float32Array(1024);

    public update(source: Float32Array, reactivity: number): Float32Array {
        if (source.length !== 1024) throw new RangeError('SSF Juiced requires 1024 power bins');
        const r2 = f(2 * f(reactivity));
        this.gain = Math.max(f(K.J_GAIN_DECAY * this.gain), K.J_GAIN_FLOOR);
        let slot = 0;
        let groupStart = 279;
        let group = 1;
        for (let i = 0; i < source.length; i++) {
            const x = source[i];
            let value: number;
            if (!(x < K.J_THRESH_D)) {
                value = f(x * K.J_D06);
                if (Number.isNaN(value) || value > 1) value = 1;
                if (value > this.gain) this.gain = value;
                value = f(value / this.gain);
            } else value = f(K.J_THRESH_D);
            if (value >= K.D_1EM4) value = f(value * this.weights[i]);
            if (i < 279) {
                const count = Math.ceil(f(f((279 - i) ** 2) * K.J_EXP_C));
                this.work.fill(value, slot, slot + count);
                slot += count;
            } else {
                if (i === 279) this.work[slot] = 0;
                const width = Math.ceil(f(f(group * group) * K.J_GROUP_C));
                if (i - groupStart >= width) {
                    slot++;
                    groupStart = i;
                    group++;
                    this.work[slot] = 0;
                }
                // The first value after a group switch retains the preceding width.
                this.work[slot] = f(this.work[slot] + f(value / f(width)));
            }
        }
        return this.finalize(r2);
    }

    private finalize(r2: number): Float32Array {
        const log = (index: number): number => f((f(Math.log(this.work[index])) / K.LN2_D) * K.D_0P0625 + 1);
        const h = [7, 6, 5, 4, 3, 2, 1, 0].map(log);
        const scratch = [h[7], h[1], h[7], h[3], h[7], h[2], h[7], h[5], h[7], h[4], h[7], h[6], h[7]];
        let previous = h[0];
        const taps = [K.TAP_W7C, K.TAP_W78, K.TAP_W70, K.TAP_W74, K.TAP_W68, K.TAP_W6C, K.TAP_W64, K.TAP_W60];
        for (let u = 0; u < 1024; u++) {
            const newest = log(Math.min(u + 7, 1023));
            const oldest = scratch[0];
            // Native local-slot chain: -8,-18,-10,-28,-20,-30,-38,-34,-24,-2c,-14,-1c,-c.
            const chain = [0, 4, 2, 8, 6, 10, 12, 11, 7, 9, 3, 5, 1];
            for (let i = 0; i < chain.length - 1; i++) scratch[chain[i]] = scratch[chain[i + 1]];
            scratch[1] = previous;
            previous = newest;
            const terms = [
                f(f(oldest + newest) * taps[0]),
                f(f(scratch[0] + scratch[1]) * taps[1]),
                f(f(scratch[2] + scratch[3]) * taps[2]),
                f(f(scratch[4] + scratch[5]) * taps[3]),
                f(f(scratch[6] + scratch[7]) * taps[4]),
                f(f(scratch[8] + scratch[9]) * taps[5]),
                f(f(scratch[10] + scratch[11]) * taps[6]),
                f(scratch[12] * taps[7]),
            ];
            let value = f(
                f(f(terms[0] + terms[1]) + f(terms[2] + terms[3])) + f(f(terms[4] + terms[5]) + f(terms[6] + terms[7]))
            );
            value = r2 > 1 ? compress(value, r2) : f(value * f(Math.sqrt(r2)));
            const old = this.output[u];
            const d = f(1 - r2);
            if (value > old) {
                const rise = f(K.D_HALF - K.D_039 * d);
                this.output[u] = f(f(f(1 - rise) * old) + f(rise * value));
            } else {
                const fall = f(K.D_03 - K.D_0P2 * d);
                this.output[u] = f(old - f(fall * f(old - value)));
            }
        }
        return new Float32Array(this.output);
    }
}

/** PC53, CRT ISA >=2, Zen2 reciprocal seed; other CPU profiles need their own table. */
export class SsfSmooth {
    private readonly weights = floatWords(tables.smoothZen2Pc53);
    private readonly output = new Float32Array(1024);

    public update(bands: Float32Array, reactivity: number): Float32Array {
        if (bands.length !== 35) throw new RangeError('SSF Smooth requires 35 bands');
        const r2 = f(f(reactivity) + f(reactivity));
        const powerScale = f(Math.pow(clamp(r2, 0, 1), f(0.2)));
        const rate = f(r2 * K.D_035);
        const db = bands.map(s => f(f(Math.log(s > K.S_MIN_LOG ? s : K.S_MIN_LOG)) * K.S_D10LN10));
        for (let i = 0; i < 1024; i++) {
            const ratio = f(f(i) / 1024);
            const threshold = lerp(K.F_23, K.F_45, f(clamp(ratio, 0, K.F_06S) * K.S_D53));
            let acc = 0;
            let sum = 0;
            for (let k = 0; k < 35; k++) {
                const weight = this.weights[i * 35 + k];
                const gate = clamp(f(f(threshold + db[k]) / threshold), 0, 1);
                acc = f(gate * weight + acc);
                sum = f(sum + weight);
            }
            if (sum > 0) acc = f(acc / sum);
            const square = f(f(i) * f(i));
            const boost = f(f(square * square) * K.S_BOOST);
            if (!(K.D_1EM5 > acc)) acc = f(f(f(acc * boost) * K.F_025) + acc);
            const at = f(f(clamp(ratio, 0.5, 0.75) - 0.5) * 4);
            let value = f(f(f(f(at + 1) * acc) * rate) + f(f(1 - rate) * this.output[i]));
            if (r2 <= 1) value = f(value * powerScale);
            this.output[i] = clamp(value, 0, 1);
        }
        return new Float32Array(this.output);
    }
}
