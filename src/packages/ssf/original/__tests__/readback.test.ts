import { describe, expect, it } from 'vitest';

import { floatWords } from '../math';
import { ssfReadbackCoordinate, ssfReadbackRgb } from '../readback';
import fixture from './fixtures/native-readback.json';

describe('native final-pass coordinate and byte conversion boundaries', () => {
    it('matches recorded original readback calls including nonfinite and small-dimension coordinates', () => {
        for (const row of fixture.rows) {
            expect(ssfReadbackCoordinate(floatWords([row.x])[0], row.width)).toBe(row.pixel[0]);
            expect(ssfReadbackCoordinate(floatWords([row.y])[0], row.height)).toBe(row.pixel[1]);
            const actual = new Float32Array(ssfReadbackRgb(new Uint8Array(row.rgbBytes)));
            expect([...new Uint32Array(actual.buffer)]).toEqual(row.rgbWords);
        }
    });
});
