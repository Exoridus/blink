import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SsfJuiced, ssfRawSpectrum, SsfSmooth, SsfTimeSeries, ssfWaveform } from '../arrays';
import { MAIN_BANDS } from '../bands';
import { ssfBandIntegrate, SsfFrontend } from '../frontend';
import { floatWords } from '../math';
import { SsfScalarBank } from '../scalars';
import arrayFixture from './fixtures/native-arrays.json';
import frontendFixture from './fixtures/native-frontend.json';
import scalarFixture from './fixtures/native-scalars.json';

function relativeError(actual: Float32Array, expected: Float32Array, referenceScale?: number): number {
    let scale = 1e-30;
    let max = 0;
    for (const value of expected) if (Number.isFinite(value)) scale = Math.max(scale, Math.abs(value));
    actual.forEach((value, index) => {
        if (Number.isNaN(expected[index])) expect(Number.isNaN(value)).toBe(true);
        else {
            expect(Number.isFinite(value)).toBe(true);
            max = Math.max(max, Math.abs(value - expected[index]));
        }
    });
    return max / (referenceScale ?? scale);
}

describe('BlinkFX against fresh original x86 execution, Unicorn p8/PC53', () => {
    for (const scenario of arrayFixture.cases) {
        it(`compares eight native array outputs with native input vectors at r=${scenario.r}`, () => {
            const bytes = readFileSync(new URL('./fixtures/native-arrays.bin', import.meta.url));
            const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
            const vector = (slice: { offset: number; length: number }): Float32Array =>
                data.subarray(slice.offset, slice.offset + slice.length);
            const juiced = new SsfJuiced();
            const smooth = new SsfSmooth();
            const trails = Array.from({ length: 4 }, () => new SsfTimeSeries());
            for (const frame of scenario.frames) {
                const output = {
                    'syn_Spectrum (Raw)': ssfRawSpectrum(vector(frame.inputs['13']), scenario.r),
                    syn_SpectrumJuiced: juiced.update(vector(frame.inputs['13']), scenario.r),
                    syn_SpectrumSmooth: smooth.update(vector(frame.inputs['14']), scenario.r),
                    syn_Waveform: ssfWaveform(vector(frame.inputs['15']), scenario.r),
                    syn_TimeSeries: trails[0].update(frame.bands[0]),
                    syn_BassTimeSeries: trails[1].update(frame.bands[1]),
                    syn_MidTimeSeries: trails[2].update(frame.bands[2]),
                    syn_HighTimeSeries: trails[3].update(frame.bands[3]),
                };
                for (const [name, actual] of Object.entries(output)) {
                    const expected = vector(frame.outputs[name as keyof typeof frame.outputs]);
                    expect(actual.length, name).toBe(expected.length);
                    expect(relativeError(actual, expected), name).toBeLessThan(3e-6);
                }
            }
        });
    }
    for (const scenario of scalarFixture.cases) {
        it(`compares 43 native generator words on 90 updates at r=${scenario.r}, q=${scenario.q}, dt=${scenario.frames[0].dt}`, () => {
            const bank = new SsfScalarBank();
            for (const frame of scenario.frames) {
                const actual = bank.update(
                    {
                        band: floatWords(frame.band),
                        z: floatWords(frame.z),
                        mean: floatWords(frame.mean),
                        raw: frame.raw,
                        bpm: frame.bpm,
                        confidence: frame.confidence,
                    },
                    scenario.r,
                    scenario.q,
                    frame.dt
                );
                for (const [name, word] of Object.entries(frame.output))
                    expect(new Uint32Array(new Float32Array([actual[name]]).buffer)[0], name).toBe(word);
            }
        });
    }
    for (const scenario of frontendFixture.cases) {
        it(`measures portable frontend vs native ${scenario.name} using original gate limits`, () => {
            const frontend = new SsfFrontend();
            frontend.process(new Float32Array(2048));
            frontend.process(floatWords(scenario.pcm));
            const real = floatWords(scenario.real);
            const imag = floatWords(scenario.imag);
            const complexScale = Math.max(...real.map((value, index) => Math.hypot(value, imag[index])));
            expect(relativeError(frontend.real, real, complexScale)).toBeLessThan(1e-5);
            expect(relativeError(frontend.imag, imag, complexScale)).toBeLessThan(1e-5);
            expect(relativeError(frontend.power, floatWords(scenario.power))).toBeLessThan(1e-5);
            expect(relativeError(frontend.bands, floatWords(scenario.bands))).toBeLessThan(1e-4);
            expect(relativeError(frontend.features, floatWords(scenario.features))).toBeLessThan(2e-4);
            MAIN_BANDS.forEach(([low, high], index) => {
                const result = ssfBandIntegrate(floatWords(scenario.power), low, high);
                expect(new Uint32Array(new Float32Array([result]).buffer)[0]).toBe(scenario.bands[index]);
            });
        });
    }
});
