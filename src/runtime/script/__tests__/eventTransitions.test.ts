import { describe, expect, it } from 'vitest';

import { matchesEventTransition } from '../eventTransitions';

describe('matchesEventTransition', () => {
    it('change: fires when the value differs from the previous frame', () => {
        expect(matchesEventTransition('change', 1, 2)).toBe(true);
        expect(matchesEventTransition('change', 1, 1)).toBe(false);
    });

    it('change: compares array-valued controls element-wise', () => {
        const a = new Float32Array([1, 0, 0, 1]);
        const b = new Float32Array([1, 0, 0, 1]);
        const c = new Float32Array([1, 0, 0, 0]);
        expect(matchesEventTransition('change', a, b)).toBe(false);
        expect(matchesEventTransition('change', a, c)).toBe(true);
    });

    it('offToOn: fires only on the rising edge across the 0.5 threshold', () => {
        expect(matchesEventTransition('offToOn', 0, 1)).toBe(true);
        expect(matchesEventTransition('offToOn', 1, 1)).toBe(false);
        expect(matchesEventTransition('offToOn', 0, 0)).toBe(false);
        expect(matchesEventTransition('offToOn', 1, 0)).toBe(false);
    });

    it('onToOff: fires only on the falling edge across the 0.5 threshold', () => {
        expect(matchesEventTransition('onToOff', 1, 0)).toBe(true);
        expect(matchesEventTransition('onToOff', 0, 0)).toBe(false);
        expect(matchesEventTransition('onToOff', 1, 1)).toBe(false);
        expect(matchesEventTransition('onToOff', 0, 1)).toBe(false);
    });

    it('whileOn: fires every frame the current value is on, regardless of the previous value', () => {
        expect(matchesEventTransition('whileOn', 1, 1)).toBe(true);
        expect(matchesEventTransition('whileOn', 0, 1)).toBe(true);
        expect(matchesEventTransition('whileOn', 1, 0)).toBe(false);
    });

    it('whileOff: fires every frame the current value is off, regardless of the previous value', () => {
        expect(matchesEventTransition('whileOff', 0, 0)).toBe(true);
        expect(matchesEventTransition('whileOff', 1, 0)).toBe(true);
        expect(matchesEventTransition('whileOff', 0, 1)).toBe(false);
    });

    it('treats an array-valued control as on when any component crosses the threshold', () => {
        const allLow = new Float32Array([0, 0.2, 0.4]);
        const oneHigh = new Float32Array([0, 0.2, 0.6]);
        expect(matchesEventTransition('whileOn', allLow, oneHigh)).toBe(true);
        expect(matchesEventTransition('whileOff', allLow, allLow)).toBe(true);
    });
});
