import { describe, expect, it } from 'vitest';

import { SsfBandState } from '../bandState';
import { floatWords } from '../math';
import fixture from './fixtures/native-bandstates.json';

function word(value: number): number {
    return new Uint32Array(new Float32Array([value]).buffer)[0];
}

describe('original analysis band state', () => {
    it('preserves native nonfinite getter behavior without claiming NaN payload equality', () => {
        let state = new SsfBandState();
        fixture.edgeRows.forEach((row, index) => {
            if (index % 3 === 0) state = new SsfBandState();
            state.push(floatWords([row.input])[0]);
            for (const name of ['raw', 'mean', 'z', 'band'] as const) {
                const expected = floatWords([row[name]])[0];
                if (Number.isNaN(expected)) expect(Number.isNaN(state[name]), `${index}: ${name}`).toBe(true);
                else expect(word(state[name]), `${index}: ${name}`).toBe(row[name]);
            }
        });
    });
    it('matches four native getters through startup and three 173-sample ring wraps', () => {
        const state = new SsfBandState();
        fixture.rows.forEach((row, index) => {
            state.push(row.input);
            for (const name of ['raw', 'mean', 'z', 'band'] as const)
                expect(word(state[name]), `${index}: ${name}`).toBe(word(row[name]));
        });
    });
});
