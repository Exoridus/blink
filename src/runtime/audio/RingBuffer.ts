/**
 * Generic fixed-size ring buffer for audio history.
 *
 * New values are appended at the write position; the buffer wraps
 * around when full, maintaining the most recent `capacity` values.
 * Read order is chronological (oldest first).
 */
export class RingBuffer {
    private readonly buffer: Float32Array;
    private writeIndex: number;
    private _count: number;

    public readonly capacity: number;

    public constructor(capacity: number) {
        this.capacity = capacity;
        this.buffer = new Float32Array(capacity);
        this.writeIndex = 0;
        this._count = 0;
    }

    public get count(): number {
        return this._count;
    }

    public get isFull(): boolean {
        return this._count >= this.capacity;
    }

    /** Append a single value. */
    public push(value: number): void {
        this.buffer[this.writeIndex] = value;
        this.writeIndex = (this.writeIndex + 1) % this.capacity;
        if (this._count < this.capacity) {
            this._count++;
        }
    }

    /** Append multiple values. */
    public pushMany(values: ArrayLike<number>): void {
        for (let i = 0; i < values.length; i++) {
            this.push(values[i]);
        }
    }

    /**
     * Read values in chronological order (oldest first, newest last).
     * Returns a new Float32Array.
     */
    public read(): Float32Array {
        if (this._count === 0) {
            return new Float32Array(0);
        }

        const out = new Float32Array(this._count);
        if (this._count < this.capacity || this.writeIndex === 0) {
            const start = this._count < this.capacity ? 0 : this.writeIndex;
            for (let i = 0; i < this._count; i++) {
                out[i] = this.buffer[(start + i) % this.capacity];
            }
        } else {
            for (let i = 0; i < this._count; i++) {
                out[i] = this.buffer[(this.writeIndex + i) % this.capacity];
            }
        }
        return out;
    }

    /** Read the most recent N values (newest last). Returns a new Float32Array. */
    public readLast(n: number): Float32Array {
        const len = Math.min(n, this._count);
        if (len === 0) return new Float32Array(0);

        const out = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            const idx = (this.writeIndex - len + i + this.capacity) % this.capacity;
            out[i] = this.buffer[idx];
        }
        return out;
    }

    /** Reset the buffer to empty. */
    public clear(): void {
        this.buffer.fill(0);
        this.writeIndex = 0;
        this._count = 0;
    }
}
