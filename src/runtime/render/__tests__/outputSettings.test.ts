// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_OUTPUT, fitRectangle, mapPreviewPoint, validateOutput } from '../outputSettings';

describe('output presentation', () => {
    it('letterboxes 1080p in a square without changing output dimensions', () => {
        expect(DEFAULT_OUTPUT.width).toBe(1920);
        expect(fitRectangle(1920, 1080, 600, 600, 'contain')).toEqual({ x: 0, y: 131.25, width: 600, height: 337.5 });
        expect(mapPreviewPoint(300, 300, 600, 600, DEFAULT_OUTPUT)).toEqual([960, 540]);
        expect(mapPreviewPoint(300, 50, 600, 600, DEFAULT_OUTPUT)).toBeNull();
    });
    it('maps crop offsets and stretch independently', () => {
        const cropped = mapPreviewPoint(0, 300, 600, 600, { ...DEFAULT_OUTPUT, fitting: 'cover' });
        expect(cropped?.[0]).toBeCloseTo(420, 10);
        expect(cropped?.[1]).toBe(540);
        expect(mapPreviewPoint(300, 300, 600, 600, { ...DEFAULT_OUTPUT, fitting: 'fill' })).toEqual([960, 540]);
    });
    it('rejects invalid settings before any resize', () => {
        for (const width of [0, -1, 1.5, NaN, 9000])
            expect(() => validateOutput({ ...DEFAULT_OUTPUT, width })).toThrow();
        expect(() => validateOutput({ ...DEFAULT_OUTPUT, uiScale: 2 })).toThrow();
        expect(() => validateOutput({ ...DEFAULT_OUTPUT, fpsCap: 0 })).toThrow();
    });
});
