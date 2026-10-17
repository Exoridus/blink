import { describe, expect, it } from 'vitest';

import { pixelDifference } from '../pixelDifference';

describe('masked presentation comparison', () => {
    it('excludes overlays from RGB metrics and the heatmap', () => {
        const a = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
        const b = new Uint8ClampedArray([255, 255, 255, 255, 3, 0, 0, 255]);
        const diff = pixelDifference(a, b, 2, 1, [{ x: 0, y: 0, width: 1, height: 1 }]);
        expect(diff.metrics).toMatchObject({
            comparedPixels: 1,
            maskedPixels: 1,
            maxAbs: 3,
            meanAbs: 1,
            rms: Math.sqrt(3),
        });
        expect(Array.from(diff.heatmap.slice(0, 4))).toEqual([0, 0, 0, 255]);
    });
    it('rejects mismatched dimensions and malformed masks', () => {
        expect(() => pixelDifference(new Uint8ClampedArray(4), new Uint8ClampedArray(8), 1, 1, [])).toThrow();
        expect(() =>
            pixelDifference(new Uint8ClampedArray(4), new Uint8ClampedArray(4), 1, 1, [
                { x: NaN, y: 0, width: 1, height: 1 },
            ])
        ).toThrow();
    });
});
