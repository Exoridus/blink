import { describe, expect, it } from 'vitest';

import { SsfPcmResampler } from '../pcm';

describe('explicit portable PCM source adapter', () => {
    it('preserves 44100 Hz binary32 samples without remixing or interpolation', () => {
        const adapter = new SsfPcmResampler(44100);
        const source = new Float32Array([0.1, -0.5, 1, 0]);
        expect(adapter.process(source)).toEqual(source);
    });
    it('gives chunk-independent 48000 to 44100 linear interpolation', () => {
        const input = Float32Array.from({ length: 4800 }, (_, index) => Math.sin(index / 17));
        const a = new SsfPcmResampler(48000);
        const b = new SsfPcmResampler(48000);
        const full = a.process(input);
        const parts: number[] = [];
        for (let i = 0; i < input.length; i += 128) parts.push(...b.process(input.subarray(i, i + 128)));
        expect(new Float32Array(parts)).toEqual(full);
        expect(full.length).toBeGreaterThanOrEqual(4409);
        expect(full.length).toBeLessThanOrEqual(4410);
    });
});
