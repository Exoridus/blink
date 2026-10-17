import { describe, expect, it } from 'vitest';

import { SsfControlProcessor } from '../../../packages/ssf/profile/SsfControlProcessor';
import type { BlinkControlSpec } from '../../ir/types';
import { mapControlSpecs } from '../controlUniformMapper';
import { ControlValueStore } from '../ControlValueStore';

const controls: BlinkControlSpec[] = [
    { name: 'native', label: null, description: null, group: null, type: 'bang' },
    {
        name: 'counter',
        label: null,
        description: null,
        group: null,
        type: 'float',
        default: 0,
        min: 0,
        max: 64,
        step: 1,
    },
    {
        name: 'slider',
        label: null,
        description: null,
        group: null,
        type: 'float',
        default: 0.5,
        min: 0,
        max: 1,
        step: null,
    },
];
const sources = { counter: { type: 'bang counter' } };

describe('frame-scoped control triggers', () => {
    it('makes a native event visible for exactly one frame without declaring a shader uniform', () => {
        const store = new ControlValueStore();
        store.loadDefaults(controls, sources);
        expect(store.values.native).toBe(0);
        expect(mapControlSpecs(controls).map(control => control.name)).not.toContain('native');
        expect(store.queueBang('native')).toBe(true);
        expect(store.values.native).toBe(0);
        store.beginFrame();
        expect(store.values.native).toBe(1);
        store.endFrame();
        expect(store.values.native).toBe(0);
        store.beginFrame();
        expect(store.values.native).toBe(0);
        store.endFrame();
    });

    it('injects a unit source bang pulse instead of the counter maximum', () => {
        const store = new ControlValueStore();
        store.loadDefaults(controls, sources);
        store.queueBang('counter');
        store.beginFrame();
        expect(store.values.counter).toBe(1);
        store.endFrame();
        expect(store.values.counter).toBe(0);
    });

    it('preserves repeated queued clicks with zero frames between their rising edges', () => {
        const store = new ControlValueStore();
        store.loadDefaults(controls, sources);
        store.queueBang('counter');
        store.queueBang('counter');
        const sequence: number[] = [];
        for (let frame = 0; frame < 4; frame++) {
            store.beginFrame();
            sequence.push(store.values.counter as number);
            if (frame === 0) store.queueBang('counter');
            store.endFrame();
        }
        store.beginFrame();
        sequence.push(store.values.counter as number);
        store.endFrame();
        expect(sequence).toEqual([1, 0, 1, 0, 1]);
    });

    it('drops pending triggers and cooldown when a different effect is loaded', () => {
        const store = new ControlValueStore();
        store.loadDefaults(controls, sources);
        store.queueBang('native');
        store.queueBang('counter');
        store.beginFrame();
        store.endFrame();
        store.queueBang('counter');
        store.loadDefaults([controls[2]]);
        expect(store.queueBang('native')).toBe(false);
        store.beginFrame();
        expect(store.values).toEqual({ slider: 0.5 });
        store.endFrame();
    });

    it('does not turn ordinary controls or unknown names into trigger controls', () => {
        const store = new ControlValueStore();
        store.loadDefaults(controls, sources);
        expect(store.queueBang('slider')).toBe(false);
        expect(store.queueBang('gone')).toBe(false);
        store.beginFrame();
        store.endFrame();
        expect(store.values.slider).toBe(0.5);
    });

    it('cancels published and queued events and clears the gap before a fresh click', () => {
        const store = new ControlValueStore();
        store.loadDefaults(controls, sources);
        store.queueBang('native');
        store.queueBang('native');
        store.beginFrame();
        store.cancelBang('native');
        expect(store.values.native).toBe(0);
        store.endFrame();
        store.beginFrame();
        expect(store.values.native).toBe(0);
        store.endFrame();
        store.queueBang('native');
        store.beginFrame();
        expect(store.values.native).toBe(1);
        store.endFrame();
    });

    it('delivers every queued source event to the rising-edge counter processor', () => {
        const store = new ControlValueStore();
        store.loadDefaults(controls, sources);
        const processor = new SsfControlProcessor(controls, sources);
        processor.process(store.values, 0);
        store.queueBang('counter');
        store.queueBang('counter');
        store.queueBang('counter');
        const outputs: number[] = [];
        for (let frame = 0; frame < 5; frame++) {
            store.beginFrame();
            outputs.push(processor.process(store.values, 1 / 60).counter as number);
            store.endFrame();
        }
        expect(outputs).toEqual([1, 1, 2, 2, 3]);
    });

    it('holds queued events and the gap while an asynchronous script is still busy', () => {
        const store = new ControlValueStore();
        store.loadDefaults(controls, sources);
        store.queueBang('native');
        store.queueBang('native');
        store.beginFrame();
        store.endFrame();
        for (let frame = 0; frame < 3; frame++) {
            store.beginFrame(false);
            expect(store.values.native).toBe(0);
            store.endFrame();
        }
        store.beginFrame();
        expect(store.values.native).toBe(0);
        store.endFrame();
        store.beginFrame();
        expect(store.values.native).toBe(1);
        store.endFrame();
    });

    it('returns a copied snapshot of all trigger inputs for asynchronous frame contexts', () => {
        const store = new ControlValueStore();
        store.loadDefaults(controls, sources);
        store.queueBang('native');
        store.queueBang('counter');
        store.beginFrame();
        const snapshot = store.snapshotBangs();
        store.endFrame();
        expect(snapshot).toEqual({ native: 1, counter: 1 });
        expect(store.snapshotBangs()).toEqual({ native: 0, counter: 0 });
    });
});
