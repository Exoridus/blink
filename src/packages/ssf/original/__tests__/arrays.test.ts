import { describe, expect, it } from 'vitest';

import { packSsfAudio, SsfJuiced, ssfRawSpectrum, SsfSmooth, SsfTimeSeries, ssfWaveform } from '../arrays';
import fixture from './fixtures/arrays.json';

function floats(words: number[]): Float32Array {
    return new Float32Array(new Uint32Array(words).buffer);
}

function words(values: Float32Array): number[] {
    return [...new Uint32Array(values.buffer, values.byteOffset, values.length)];
}

describe('SSF Original arrays (independent Python oracle, PC53/Zen2)', () => {
    for (const scenario of fixture.cases) {
        it(`matches raw, juiced, smooth, waveform and history at r=${scenario.r}`, () => {
            const juiced = new SsfJuiced();
            const smooth = new SsfSmooth();
            const trail = new SsfTimeSeries();
            scenario.frames.forEach((frame, index) => {
                expect(words(ssfRawSpectrum(floats(frame.power), scenario.r))).toEqual(frame.raw);
                expect(words(juiced.update(floats(frame.power), scenario.r))).toEqual(frame.juiced);
                expect(words(smooth.update(floats(frame.bands), scenario.r))).toEqual(frame.smooth);
                expect(words(ssfWaveform(floats(frame.wave), scenario.r))).toEqual(frame.waveform);
                expect(words(trail.update(index / 4))).toEqual(frame.trail);
            });
        });
    }
    it('keeps short waveform inputs unchanged and returns independent storage', () => {
        const input = new Float32Array([-1, 0, 1]);
        const result = ssfWaveform(input, 1);
        expect(result).toEqual(input);
        expect(result).not.toBe(input);
    });
    it('packs already mapped waveform and chronological history without reinterpretation', () => {
        const a = new Float32Array([-1, 0.25, 3]);
        expect([...packSsfAudio([a, a, a, a])]).toEqual([0, 0, 0, 0, 0.25, 0.25, 0.25, 0.25, 2, 2, 2, 2]);
    });
    it('publishes zero prehistory and newest at 399 through ring wrap', () => {
        const trail = new SsfTimeSeries();
        const first = trail.update(0.5);
        expect(first[0]).toBe(0);
        expect(first[399]).toBe(Math.fround(0.6));
        for (let index = 0; index < 400; index++) trail.update(0);
        expect(trail.update(0)[0]).toBeLessThan(first[399]);
        expect(first[399]).toBe(Math.fround(0.6));
    });
    it('uses native MINSS/MAXSS packing for NaN, infinities and negative zero', () => {
        const a = new Float32Array([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0]);
        const packed = packSsfAudio([a, a, a, a]);
        expect([...packed]).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
        expect(Object.is(packed[12], -0)).toBe(false);
    });
});
