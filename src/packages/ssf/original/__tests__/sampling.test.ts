import { describe, expect, it } from 'vitest';

import { sampleSsf1D } from '../sampling';

describe('portable SSF LINEAR/REPEAT sampler', () => {
    const packed = new Float32Array([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    it('preserves texel centers and blends both ends at the repeat seam', () => {
        expect(sampleSsf1D(packed, 0.125)).toEqual([0, 0, 0, 0]);
        expect(sampleSsf1D(packed, 0.375)).toEqual([1, 1, 1, 1]);
        expect(sampleSsf1D(packed, 0)).toEqual([1.5, 1.5, 1.5, 1.5]);
        expect(sampleSsf1D(packed, 1)).toEqual([1.5, 1.5, 1.5, 1.5]);
    });
    it('repeats at negative and greater-than-one coordinates', () => {
        expect(sampleSsf1D(packed, -0.625)).toEqual(sampleSsf1D(packed, 0.375));
        expect(sampleSsf1D(packed, 1.375)).toEqual(sampleSsf1D(packed, 0.375));
    });
});
