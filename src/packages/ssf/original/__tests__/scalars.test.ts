import { describe, expect, it } from 'vitest';

import { floatWords } from '../math';
import { SsfScalarBank } from '../scalars';
import fixture from './fixtures/scalars.json';

describe('43 SSF scalar generators against independent Python oracle', () => {
    for (const scenario of fixture.cases) {
        it(`matches all binary32 outputs over 150 frames at r=${scenario.r}, q=${scenario.q}`, () => {
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
                expect(Object.keys(actual)).toHaveLength(43);
                for (const [name, word] of Object.entries(frame.output)) {
                    expect(new Uint32Array(new Float32Array([actual[name]]).buffer)[0], name).toBe(word);
                }
            }
        });
    }
});
