import { describe, expect, it } from 'vitest';

import { RingBuffer } from '../RingBuffer';

describe('RingBuffer', () => {
    describe('construction', () => {
        it('creates with correct capacity', () => {
            const rb = new RingBuffer(100);
            expect(rb.capacity).toBe(100);
            expect(rb.count).toBe(0);
            expect(rb.isFull).toBe(false);
        });

        it('creates with capacity 1', () => {
            const rb = new RingBuffer(1);
            expect(rb.capacity).toBe(1);
        });
    });

    describe('push', () => {
        it('increments count', () => {
            const rb = new RingBuffer(10);
            rb.push(0.5);
            expect(rb.count).toBe(1);
            rb.push(0.6);
            expect(rb.count).toBe(2);
        });

        it('caps count at capacity', () => {
            const rb = new RingBuffer(3);
            rb.push(1);
            rb.push(2);
            rb.push(3);
            rb.push(4);
            expect(rb.count).toBe(3);
            expect(rb.isFull).toBe(true);
        });
    });

    describe('pushMany', () => {
        it('adds multiple values at once', () => {
            const rb = new RingBuffer(10);
            rb.pushMany([0.1, 0.2, 0.3, 0.4, 0.5]);
            expect(rb.count).toBe(5);
        });
    });

    describe('read', () => {
        it('returns empty for new buffer', () => {
            const rb = new RingBuffer(5);
            expect(rb.read()).toEqual(new Float32Array(0));
        });

        it('returns chronological order when not full', () => {
            const rb = new RingBuffer(5);
            rb.pushMany([1, 2, 3]);
            expect(rb.read()).toEqual(new Float32Array([1, 2, 3]));
        });

        it('returns chronological order when full (wraps around)', () => {
            const rb = new RingBuffer(3);
            rb.pushMany([1, 2, 3]);
            rb.push(4);
            expect(rb.read()).toEqual(new Float32Array([2, 3, 4]));
        });

        it('returns all values when exactly at capacity', () => {
            const rb = new RingBuffer(4);
            rb.pushMany([10, 20, 30, 40]);
            expect(rb.read()).toEqual(new Float32Array([10, 20, 30, 40]));
        });
    });

    describe('readLast', () => {
        it('returns last N values', () => {
            const rb = new RingBuffer(10);
            rb.pushMany([1, 2, 3, 4, 5]);
            expect(rb.readLast(3)).toEqual(new Float32Array([3, 4, 5]));
        });

        it('returns fewer when count < n', () => {
            const rb = new RingBuffer(10);
            rb.pushMany([1, 2]);
            expect(rb.readLast(5)).toEqual(new Float32Array([1, 2]));
        });

        it('returns empty when buffer is empty', () => {
            const rb = new RingBuffer(10);
            expect(rb.readLast(5)).toEqual(new Float32Array(0));
        });

        it('handles wrap-around correctly', () => {
            const rb = new RingBuffer(3);
            rb.pushMany([1, 2, 3]);
            rb.push(4);
            rb.push(5);
            expect(rb.readLast(3)).toEqual(new Float32Array([3, 4, 5]));
        });
    });

    describe('clear', () => {
        it('resets count to zero', () => {
            const rb = new RingBuffer(5);
            rb.pushMany([1, 2, 3]);
            rb.clear();
            expect(rb.count).toBe(0);
            expect(rb.isFull).toBe(false);
            expect(rb.read()).toEqual(new Float32Array(0));
        });
    });

    describe('edge cases', () => {
        it('handles 400-sample history correctly', () => {
            const rb = new RingBuffer(400);
            for (let i = 0; i < 500; i++) {
                rb.push(i / 500);
            }
            expect(rb.count).toBe(400);
            const data = rb.read();
            expect(data.length).toBe(400);
            // Most recent 400 values should start at value 100/500
            expect(data[0]).toBeCloseTo(100 / 500, 5);
            expect(data[399]).toBeCloseTo(499 / 500, 5);
        });

        it('pushMany across wrap boundary', () => {
            const rb = new RingBuffer(5);
            rb.pushMany([1, 2, 3, 4]);
            rb.pushMany([5, 6, 7]);
            expect(rb.count).toBe(5);
            expect(rb.read()).toEqual(new Float32Array([3, 4, 5, 6, 7]));
        });
    });
});
