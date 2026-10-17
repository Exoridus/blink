import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SsfBpmTracker } from '../bpm';
import fixture from './fixtures/bpm.json';

describe('SSF original BPM native-capture replay', () => {
    it('matches 15 recorded heavy updates using native 22x1024 histories', () => {
        const bytes = readFileSync(new URL('./fixtures/bpm-histories.bin', import.meta.url));
        const values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        const tracker = new SsfBpmTracker();
        fixture.rows.forEach((row, index) => {
            const histories = Array.from({ length: 22 }, (_, band) =>
                values.subarray((index * 22 + band) * 1024, (index * 22 + band + 1) * 1024)
            );
            for (let step = 0; step < 12; step++) tracker.update(histories);
            expect(Math.abs(tracker.bpm - row.bpm)).toBeLessThan(0.01);
            expect(Math.abs(tracker.confidence - row.confidence)).toBeLessThan(1e-6);
            expect(Math.abs(tracker.rawCandidate - row.candidate)).toBeLessThan(0.01);
        });
    });
    it('updates at callback 12 and uses native silence fallback', () => {
        const tracker = new SsfBpmTracker();
        const histories = Array.from({ length: 22 }, () => new Float32Array(1024));
        for (let step = 0; step < 11; step++) tracker.update(histories);
        expect(tracker.bpm).toBe(0);
        tracker.update(histories);
        expect(tracker.bpm).toBe(120);
        expect(Number.isNaN(tracker.rawCandidate)).toBe(true);
        expect(tracker.confidence).toBe(0);
    });
});
