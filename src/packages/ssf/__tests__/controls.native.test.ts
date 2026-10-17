import { describe, expect, it } from 'vitest';

import { mapControls } from '../convert/controls';

const convert = (control: Record<string, unknown>): ReturnType<typeof mapControls> =>
    mapControls([{ NAME: 'value', ...control }], new Set());

describe('SSF native control defaults', () => {
    it('defaults scalar values to one and clamps to manifest bounds', () => {
        expect(convert({ TYPE: 'slider' }).controls[0]).toMatchObject({ default: 1, min: 0, max: 1 });
        expect(convert({ TYPE: 'knob', MIN: 2, MAX: 3 }).controls[0]).toMatchObject({ default: 2 });
    });

    it('defaults vector components independently', () => {
        expect(convert({ TYPE: 'xy', DEFAULT: [0.7], MIN: [-1], MAX: [2] }).controls[0]).toMatchObject({
            default: [0.7, 0],
            min: [-1, 0],
            max: [2, 1],
        });
        expect(convert({ TYPE: 'xy', MIN: [-1, -1] }).controls[0]).toMatchObject({ default: [0, 0] });
    });

    it('supplies native PARAMS defaults only to smooth and traveler types', () => {
        expect(convert({ TYPE: 'slider smooth' }).sources.value.params).toBe(0.01);
        expect(convert({ TYPE: 'xy traveler' }).sources.value.params).toBe(0.01);
        expect(convert({ TYPE: 'slider speed' }).sources.value.params).toBeUndefined();
        expect(convert({ TYPE: 'slider smooth', PARAMS: 0.2 }).sources.value.params).toBe(0.2);
    });

    it('omits nonstring labels and nonnumeric values without coercion', () => {
        expect(
            convert({ TYPE: 'dropdown', LABELS: ['a', 3, null], VALUES: [2, '4', null, false, 6] }).sources.value
        ).toMatchObject({ labels: ['a'], values: [2, 6] });
    });

    it('keeps dropdown defaults and bounds in option-index space', () => {
        expect(
            convert({ TYPE: 'dropdown', DEFAULT: 2, LABELS: ['Cold', 'Neutral', 'Warm'], VALUES: [0, 0.5, 1] })
                .controls[0]
        ).toMatchObject({ type: 'float', default: 2, min: 0, max: 2, step: 1 });
        expect(convert({ TYPE: 'dropdown', DEFAULT: 3, VALUES: [0, 0.3, 0.6, 1] }).controls[0]).toMatchObject({
            default: 3,
            min: 0,
            max: 3,
        });
        expect(
            convert({ TYPE: 'dropdown', DEFAULT: 0, LABELS: ['Low', 'High'], VALUES: [10, 100] }).controls[0]
        ).toMatchObject({ default: 0, min: 0, max: 1 });
    });

    it('uses the available option count for labels-only and mismatched dropdown lists', () => {
        expect(
            convert({ TYPE: 'dropdown', DEFAULT: 9, LABELS: ['First', 'Second', 'Third'] }).controls[0]
        ).toMatchObject({ default: 2, min: 0, max: 2 });
        expect(
            convert({ TYPE: 'dropdown', DEFAULT: 0, LABELS: ['First'], VALUES: [10, 20, 30] }).controls[0]
        ).toMatchObject({ default: 0, min: 0, max: 2 });
    });

    it('falls back invalid type combinations to slider while retaining original type metadata', () => {
        const result = convert({ TYPE: 'xy counter', DEFAULT: 0.5 });
        expect(result.controls[0]).toMatchObject({ type: 'float', default: 0.5 });
        expect(result.sources.value).toMatchObject({ type: 'xy counter', modifiers: [] });
        expect(result.issues.map(issue => issue.code)).toContain('control-type-unknown');
    });

    it('preserves proven color precedence and declares unverified picker defaults', () => {
        expect(convert({ TYPE: 'color', DEFAULT: [0, 0, 0], DEF_COLOR: [0.2, 0.4, 0.6] }).controls[0]).toMatchObject({
            default: [0.2, 0.4, 0.6, 1],
        });
        expect(convert({ TYPE: 'color' }).issues.map(issue => issue.code)).toContain(
            'control-color-default-unverified'
        );
    });
});
