import { describe, expect, it } from 'vitest';

import type { BlinkControlSpec } from '../../ir/types';
import { ControlValueStore } from '../ControlValueStore';

const CONTROLS: BlinkControlSpec[] = [
    {
        name: 'speed',
        label: null,
        description: null,
        group: null,
        type: 'float',
        default: 1,
        min: null,
        max: null,
        step: null,
    },
    { name: 'tint', label: null, description: null, group: null, type: 'color', default: [1, 0, 0, 1] },
];

describe('ControlValueStore', () => {
    it('has no values before loadDefaults is called', () => {
        const store = new ControlValueStore();
        expect(store.values).toEqual({});
    });

    it('loadDefaults seeds values from the effect defaults', () => {
        const store = new ControlValueStore();
        store.loadDefaults(CONTROLS);
        expect(store.values.speed).toBe(1);
        expect(store.values.tint).toEqual(new Float32Array([1, 0, 0, 1]));
    });

    it('set overwrites a declared control value', () => {
        const store = new ControlValueStore();
        store.loadDefaults(CONTROLS);
        store.set('speed', 2.5);
        expect(store.values.speed).toBe(2.5);
    });

    it('set throws on an unknown control name', () => {
        const store = new ControlValueStore();
        store.loadDefaults(CONTROLS);
        expect(() => store.set('nope', 1)).toThrow(/unknown control "nope"/);
    });

    it('set throws before any effect is loaded', () => {
        const store = new ControlValueStore();
        expect(() => store.set('speed', 1)).toThrow(/unknown control "speed"/);
    });

    it('loadDefaults discards a prior write for a control the new effect no longer declares', () => {
        const store = new ControlValueStore();
        store.loadDefaults(CONTROLS);
        store.set('speed', 9);
        store.loadDefaults([
            {
                name: 'speed',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 1,
                min: null,
                max: null,
                step: null,
            },
        ]);
        expect(store.values.speed).toBe(1);
        expect(store.values.tint).toBeUndefined();
    });

    describe('applyValues', () => {
        it('overwrites every declared control passed in the map', () => {
            const store = new ControlValueStore();
            store.loadDefaults(CONTROLS);
            store.applyValues({ speed: 3, tint: new Float32Array([0, 1, 0, 1]) });
            expect(store.values.speed).toBe(3);
            expect(store.values.tint).toEqual(new Float32Array([0, 1, 0, 1]));
        });

        it('leaves values not present in the map untouched', () => {
            const store = new ControlValueStore();
            store.loadDefaults(CONTROLS);
            store.applyValues({ speed: 3 });
            expect(store.values.tint).toEqual(new Float32Array([1, 0, 0, 1]));
        });

        it('does nothing for an empty map', () => {
            const store = new ControlValueStore();
            store.loadDefaults(CONTROLS);
            store.applyValues({});
            expect(store.values.speed).toBe(1);
        });

        it('throws on an unknown control name and writes nothing', () => {
            const store = new ControlValueStore();
            store.loadDefaults(CONTROLS);
            expect(() => store.applyValues({ speed: 3, nope: 1 })).toThrow(/unknown control "nope"/);
            expect(store.values.speed).toBe(1);
        });

        it('throws before any effect is loaded', () => {
            const store = new ControlValueStore();
            expect(() => store.applyValues({ speed: 1 })).toThrow(/unknown control "speed"/);
        });
    });
});
