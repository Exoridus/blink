import { describe, expect, it } from 'vitest';

import { ssfBandIntegrate, SsfFrontend } from '../frontend';
import { floatWords } from '../math';
import fixture from './fixtures/frontend.json';
import peaks from './fixtures/native-peaks.json';

function error(actual: Float32Array, expectedWords: number[]): number {
    const expected = floatWords(expectedWords);
    let maximum = 0;
    let scale = 1e-30;
    expected.forEach(value => {
        if (Number.isFinite(value)) scale = Math.max(scale, Math.abs(value));
    });
    actual.forEach((value, index) => {
        if (Number.isNaN(expected[index])) expect(Number.isNaN(value)).toBe(true);
        else {
            expect(Number.isFinite(value)).toBe(true);
            maximum = Math.max(maximum, Math.abs(value - expected[index]) / scale);
        }
    });
    return maximum;
}

describe('SSF portable FFT frontend against independent oracle', () => {
    for (const scenario of peaks.cases) {
        it(`matches fresh native positive-only F1 for ${scenario.name}`, () => {
            const frontend = new SsfFrontend();
            frontend.process(floatWords(scenario.pcm));
            expect(frontend.features[0]).toBe(scenario.peak);
        });
    }
    for (const scenario of fixture.cases) {
        it(`preserves history and scaled complex DFT for ${scenario.name}`, () => {
            const frontend = new SsfFrontend();
            for (const frame of scenario.frames) {
                frontend.process(floatWords(frame.pcm));
                expect([...new Uint32Array(frontend.history.buffer)]).toEqual(frame.history);
                expect(error(frontend.real, frame.real)).toBeLessThan(1e-6);
                expect(error(frontend.imag, frame.imag)).toBeLessThan(1e-6);
                expect(error(frontend.power, frame.power)).toBeLessThan(1e-6);
                expect(error(frontend.bands, frame.bands)).toBeLessThan(1e-6);
                expect(error(frontend.features, frame.features)).toBeLessThan(1e-6);
            }
        });
    }
    it('rejects oversized chunks without modifying state', () => {
        const frontend = new SsfFrontend();
        expect(() => frontend.process(new Float32Array(2049))).toThrow(RangeError);
        expect(frontend.history.every(value => value === 0)).toBe(true);
    });
    it('preserves collapsed bands and the native e+1 edge quirk', () => {
        const source = new Float32Array(1024);
        source[0] = 3;
        source[1] = 7;
        source[2] = 11;
        expect(ssfBandIntegrate(source, 0, 16)).toBe(3);
        expect(ssfBandIntegrate(source, 0, 32)).toBe(
            Math.fround(
                3 + Math.fround(Math.fround(Math.fround(32 % 21.533203125) * Math.fround(1 / 21.533203125)) * 11)
            )
        );
    });
});
