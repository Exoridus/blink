import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SsfOriginalProvider } from '../provider';
import fixture from './fixtures/native-pipeline.json';

describe('fresh native PCM-to-publication comparison', () => {
    for (const scenario of fixture.cases) {
        it(`traces 60 complete frames at r=${scenario.r}, q=${scenario.q}`, () => {
            const bytes = readFileSync(new URL('./fixtures/native-pipeline.bin', import.meta.url));
            const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
            const pcm = data.subarray(fixture.pcm.offset, fixture.pcm.offset + fixture.pcm.length);
            const provider = new SsfOriginalProvider();
            scenario.frames.forEach((frame, index) => {
                provider.process({
                    samples: pcm.subarray(index * 512, (index + 1) * 512),
                    sampleRate: 44100,
                    firstSample: index * 512,
                    sourceEpoch: 0,
                });
                const snapshot = provider.snapshot(1 / 60, scenario.r, scenario.q);
                for (const [name, value] of Object.entries(frame.scalars)) {
                    const actual = snapshot.signals.get(name)?.value as number;
                    const difference = Math.abs(actual - value);
                    const limit = name === 'syn_BPM' ? 0.01 : 1e-4 * Math.max(1, Math.abs(value));
                    expect(difference, `frame ${index}, scalar ${name}`).toBeLessThanOrEqual(limit);
                }
                for (const [name, slice] of Object.entries(frame.arrays)) {
                    const target = name === 'syn_Spectrum (Raw)' ? 'syn_Spectrum' : name;
                    const actual = snapshot.signals.get(target)?.value as Float32Array;
                    const expected = data.subarray(slice.offset, slice.offset + slice.length);
                    expect(actual.length, target).toBe(expected.length);
                    let difference = 0;
                    for (let i = 0; i < actual.length; i++)
                        difference = Math.max(difference, Math.abs(actual[i] - expected[i]));
                    expect(difference, `frame ${index}, array ${target}`).toBeLessThanOrEqual(1e-4);
                }
            });
            provider.destroy();
        });
    }
});
