import { describe, expect, it } from 'vitest';

import { ControlValueStore } from '../../../../runtime/render/ControlValueStore';
import { mapControls } from '../../convert/controls';
import { SsfControlProcessor } from '../SsfControlProcessor';

function processor(control: Record<string, unknown>): SsfControlProcessor {
    const mapped = mapControls([{ NAME: 'value', ...control }], new Set());
    return new SsfControlProcessor(
        mapped.controls as ConstructorParameters<typeof SsfControlProcessor>[0],
        mapped.sources
    );
}

describe('SSF source control publication', () => {
    it('maps named dropdown option indices to shader values without modifying raw input', () => {
        const controls = processor({
            TYPE: 'dropdown',
            DEFAULT: 1,
            LABELS: ['Low', 'Medium', 'High'],
            VALUES: [0.1, 0.5, 1],
        });
        const raw = { value: 1 };
        expect(controls.active).toBe(true);
        expect(controls.process(raw, 0).value).toBe(0.5);
        expect(raw.value).toBe(1);
        expect(controls.process({ value: 2 }, 1 / 60).value).toBe(1);
    });

    it('maps values-only dropdowns and preserves labels-only option indices', () => {
        const values = processor({ TYPE: 'dropdown', VALUES: [0, 0.3, 0.6, 1] });
        expect(values.process({ value: 1 }, 0).value).toBeCloseTo(0.3, 6);
        expect(values.process({ value: 3 }, 0).value).toBe(1);
        const labels = processor({ TYPE: 'dropdown', LABELS: ['First', 'Second', 'Third'] });
        expect(labels.process({ value: 2 }, 0).value).toBe(2);
    });

    it('clamps integer dropdown selection in option space', () => {
        const controls = processor({ TYPE: 'dropdown', VALUES: [10, 20, 30] });
        expect(controls.process({ value: -5 }, 0).value).toBe(10);
        expect(controls.process({ value: 1.9 }, 0).value).toBe(20);
        expect(controls.process({ value: 99 }, 0).value).toBe(30);
        expect(controls.process({ value: Number.NaN }, 0).value).toBe(10);
    });

    it('smooths mapped dropdown values rather than the option indices', () => {
        const controls = processor({ TYPE: 'dropdown smooth', VALUES: [0, 0.5, 1], PARAMS: 0.25 });
        expect(controls.process({ value: 2 }, 0).value).toBe(1);
        expect(controls.process({ value: 0 }, 1 / 60).value).toBe(0.75);
        expect(controls.process({ value: 0 }, 1 / 60).value).toBe(0.5625);
    });

    it('counts unit trigger events independently of the counter display range', () => {
        const controls = processor({ TYPE: 'bang counter', MIN: 0, MAX: 64, DEFAULT: 0 });
        expect(controls.process({ value: 0 }, 0).value).toBe(0);
        expect(controls.process({ value: 1 }, 1 / 60).value).toBe(1);
        controls.process({ value: 0 }, 1 / 60);
        expect(controls.process({ value: 1 }, 1 / 60).value).toBe(2);
    });

    it('smooths a counter toward its accumulated click count without decaying that count', () => {
        const controls = processor({ TYPE: 'bang counter smooth', MIN: 0, MAX: 64, DEFAULT: 0, PARAMS: 0.25 });
        expect(controls.process({ value: 0 }, 0).value).toBe(0);
        expect(controls.process({ value: 1 }, 1 / 60).value).toBe(0.25);
        expect(controls.process({ value: 0 }, 1 / 60).value).toBe(0.4375);
        expect(controls.process({ value: 1 }, 1 / 60).value).toBe(0.828125);
    });

    it('resets plain and smooth counter histories before restoring defaults', () => {
        for (const type of ['bang counter', 'bang counter smooth']) {
            const controls = processor({ TYPE: type, DEFAULT: 0, MAX: 64, PARAMS: 0.25 });
            controls.process({ value: 0 }, 0);
            controls.process({ value: 1 }, 1 / 60);
            controls.process({ value: 0 }, 1 / 60);
            controls.process({ value: 1 }, 1 / 60);
            controls.reset('value');
            expect(controls.process({ value: 0 }, 0).value).toBe(0);
            expect(controls.process({ value: 1 }, 1 / 60).value).toBe(type === 'bang counter' ? 1 : 0.25);
        }
    });

    it('clears integrated speed state and re-primes smooth controls from the restored raw default', () => {
        const speed = processor({ TYPE: 'slider speed', DEFAULT: 0.25 });
        expect(speed.process({ value: 0.25 }, 0.25).value).toBe(0.0625);
        speed.reset('value');
        expect(speed.process({ value: 0.25 }, 0).value).toBe(0);
        const smooth = processor({ TYPE: 'dropdown smooth', DEFAULT: 2, VALUES: [0, 0.5, 1], PARAMS: 0.25 });
        smooth.process({ value: 2 }, 0);
        smooth.process({ value: 0 }, 1 / 60);
        smooth.reset('value');
        expect(smooth.process({ value: 2 }, 0).value).toBe(1);
    });

    it('loads synthetic defaults and publishes a queued smooth counter trigger', () => {
        const mapped = mapControls(
            [
                { NAME: 'choice', TYPE: 'dropdown', VALUES: [0.2, 0.6, 1], DEFAULT: 1 },
                { NAME: 'trigger', TYPE: 'bang counter smooth', MIN: 0, MAX: 64, DEFAULT: 0, PARAMS: 0.18 },
            ],
            new Set()
        );
        const controls = mapped.controls as ConstructorParameters<typeof SsfControlProcessor>[0];
        const store = new ControlValueStore();
        store.loadDefaults(controls, mapped.sources);
        const processor = new SsfControlProcessor(controls, mapped.sources);
        const defaults = processor.process(store.values, 0);
        expect(defaults.choice).toBeCloseTo(0.6, 6);
        expect(defaults.trigger).toBe(0);
        store.queueBang('trigger');
        store.beginFrame();
        expect(processor.process(store.values, 1 / 60).trigger).toBeCloseTo(0.18, 6);
        store.endFrame();
    });

    it('accepts a queued trigger immediately after resetting a bang control', () => {
        for (const type of ['bang', 'bang smooth', 'bang counter', 'bang counter smooth']) {
            const controls = processor({ TYPE: type, DEFAULT: 0, MAX: 1, PARAMS: 1 });
            controls.process({ value: 0 }, 0);
            controls.process({ value: 1 }, 1 / 60);
            controls.reset('value');
            expect(controls.process({ value: 1 }, 1 / 60).value, type).toBe(1);
        }
    });
});
