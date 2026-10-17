export const f = Math.fround;

export function clamp(value: number, low: number, high: number): number {
    const v = f(value);
    return low > v ? f(low) : v > high ? f(high) : v;
}

export function lerp(x: number, y: number, value: number): number {
    const t = Number.isNaN(value) ? 1 : clamp(value, 0, 1);
    return f(f(f(1 - t) * f(x)) + f(t * f(y)));
}

export function floatWords(words: readonly number[]): Float32Array {
    return new Float32Array(new Uint32Array(words).buffer);
}

export class SsfSmoother {
    public value = 0;
    public r1: number;
    public readonly r2: number;

    public constructor(
        rate = 0.98,
        public readonly mode = 0
    ) {
        this.r1 = f(1 - f(rate));
        this.r2 = this.r1;
    }

    public update(target: number, delta: number): number {
        const t = f(target);
        const dt = f(delta);
        if (this.mode === 0) {
            const v = f(f(1 - f(f(dt * this.r1) * 60)) * this.value);
            this.value = t <= v ? v : t;
        } else if (this.mode === 1) {
            this.value = f(f(f(f(t - this.value) * 60) * f(dt * this.r1)) + this.value);
        } else if (this.mode === 2) {
            const v = f(f(f(f(dt * this.r1) * 60) + 1) * this.value);
            this.value = v <= t ? v : t;
        }
        return this.value;
    }
}
