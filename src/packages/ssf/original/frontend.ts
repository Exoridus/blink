import { MAIN_BANDS, TABLE_22, TABLE_35 } from './bands';
import { f, floatWords } from './math';
import tables from './tables.json';

/** Natural-order complex forward DFT, binary64 butterflies, optional 1/sqrt(N) scaling. */
export function ssfTransform(
    input: Float64Array | Float32Array,
    scaled = true
): { real: Float64Array; imag: Float64Array } {
    const n = input.length;
    if (n < 2 || (n & (n - 1)) !== 0) throw new RangeError('SSF transform size must be a power of two');
    const real = new Float64Array(n);
    const imag = new Float64Array(n);
    let reverse = 0;
    for (let i = 0; i < n; i++) {
        real[reverse] = input[i];
        let bit = n >> 1;
        while ((reverse & bit) !== 0) {
            reverse ^= bit;
            bit >>= 1;
        }
        reverse ^= bit;
    }
    for (let width = 2; width <= n; width *= 2) {
        for (let k = 0; k < width / 2; k++) {
            const angle = (-2 * Math.PI * k) / width;
            const wr = Math.cos(angle);
            const wi = Math.sin(angle);
            for (let start = 0; start < n; start += width) {
                const a = start + k;
                const b = a + width / 2;
                const tr = wr * real[b] - wi * imag[b];
                const ti = wr * imag[b] + wi * real[b];
                real[b] = real[a] - tr;
                imag[b] = imag[a] - ti;
                real[a] += tr;
                imag[a] += ti;
            }
        }
    }
    if (scaled) {
        const scale = Math.sqrt(n);
        for (let i = 0; i < n; i++) {
            real[i] /= scale;
            imag[i] /= scale;
        }
    }
    return { real, imag };
}

export function ssfBandIntegrate(power: Float32Array, lowHz: number, highHz: number): number {
    const n = power.length;
    const hzPerBin = f(44100 / f(2 * n));
    const binsPerHz = f(1 / hzPerBin);
    const start = Math.trunc(f(f(lowHz) * binsPerHz));
    const end = Math.trunc(f(f(highHz) * binsPerHz));
    if (start < 0 || start >= n || end < start || end > n) throw new RangeError('SSF band exceeds power spectrum');
    if (start === end) return power[start];
    const fractionStart = f(f(f(lowHz) % hzPerBin) * binsPerHz);
    const fractionEnd = f(f(f(highHz) % hzPerBin) * binsPerHz);
    if (end !== n && end + 1 >= n) throw new RangeError('SSF band end exceeds power spectrum');
    const tail = end === n ? 0 : f(fractionEnd * power[end + 1]);
    let sum = 0;
    for (let i = start; i < end; i++) sum = f(sum + power[i]);
    return f(f(f(sum - f(fractionStart * power[start])) + tail) / f(end - start));
}

export class SsfFrontend {
    public readonly history = new Float32Array(2048);
    public readonly real = new Float32Array(1024);
    public readonly imag = new Float32Array(1024);
    public readonly magnitude = new Float32Array(1024);
    public readonly power = new Float32Array(1024);
    public readonly phase = new Float32Array(1024);
    public readonly bands = new Float32Array(5);
    public readonly bpmBands = new Float32Array(22);
    public readonly smoothBands = new Float32Array(35);
    public readonly features = new Float32Array(5);
    private readonly window = floatWords(tables.blackman2048);
    private previousFlux: Float32Array | null = null;

    public process(chunk: Float32Array): void {
        if (chunk.length > 2048) throw new RangeError('SSF host chunk exceeds 2048 samples');
        if (chunk.length > 0) {
            this.history.copyWithin(0, chunk.length);
            this.history.set(chunk, 2048 - chunk.length);
        }
        const windowed = this.history.map((value, index) => f(value * this.window[index]));
        const spectrum = ssfTransform(windowed);
        let peak = 0;
        let squares = 0;
        for (const value of this.history) {
            // F1 compares the original finite sample; an absolute value would count negative peaks.
            if (Number.isFinite(value) && value > peak) peak = value;
            squares = f(squares + f(value * value));
        }
        let centroidSum = 0;
        let magnitudeSum = 0;
        let flux = 0;
        let mass = 0;
        const nextFlux = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
            const re = (this.real[i] = f(spectrum.real[i]));
            const im = (this.imag[i] = f(spectrum.imag[i]));
            const magnitude = (this.magnitude[i] = f(Math.sqrt(re * re + im * im)));
            this.power[i] = f(magnitude * magnitude);
            this.phase[i] = f(Math.atan2(im, re));
            magnitudeSum = f(magnitudeSum + magnitude);
            centroidSum = f(centroidSum + f(f(f(i + 1) * magnitude) * 21.533203125));
            mass = f(mass + f(f(magnitude * 0.5) * f(f(2 * i + 1) * 21.533203125)));
            nextFlux[i] = f(f(magnitude * 4) * magnitude);
            if (this.previousFlux !== null) {
                const difference = f(nextFlux[i] - this.previousFlux[i]);
                flux = f(flux + f(f(Math.abs(difference) + difference) * 0.5));
            }
        }
        this.previousFlux = nextFlux;
        this.features.set([peak, f(centroidSum / magnitudeSum), f(Math.sqrt(f(squares / 2048))), flux, mass]);
        for (const [table, destination] of [
            [MAIN_BANDS, this.bands],
            [TABLE_22, this.bpmBands],
            [TABLE_35, this.smoothBands],
        ] as const) {
            for (const [index, [low, high]] of table.entries()) {
                destination[index] = ssfBandIntegrate(this.power, low, high);
            }
        }
    }
}
