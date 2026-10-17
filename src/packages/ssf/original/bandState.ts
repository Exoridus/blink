import { f } from './math';

export class SsfBandState {
    private readonly ring = new Float32Array(173);
    private position = 0;
    private count = 0;
    private sum = 0;
    private squares = 0;
    private peak = 2 ** -126;
    public raw = 0;
    public mean = 0;
    public z = 0;
    public band = 0;

    public push(input: number): void {
        const value = f(input);
        const old = this.ring[this.position];
        this.ring[this.position] = value;
        this.position = (this.position + 1) % 173;
        this.count = Math.min(this.count + 1, 173);
        this.sum = value + this.sum - old;
        this.squares += f(f(value * value) - f(old * old));
        this.mean = f(this.sum / this.count);
        const standardDeviation = f(Math.sqrt(this.squares / this.count - f(this.mean * this.mean)));
        // The native unordered comparison keeps NaN rather than clearing it with the small-std branch.
        this.z = standardDeviation <= 1e-5 ? 0 : f(f(value - this.mean) / standardDeviation);
        const decayed = f(0.9995 * this.peak);
        this.peak = value > decayed ? value : decayed;
        if (this.peak === 0) this.peak = 2 ** -126;
        this.raw = value;
        this.band = f(value / this.peak);
    }
}
