import { describe, expect, it } from 'vitest';

import type { BlinkControlSpec } from '../../ir/types';
import { mapControlSpec, mapControlSpecs } from '../controlUniformMapper';

describe('mapControlSpec', () => {
    it('maps float control to GLSL float uniform', () => {
        const control: BlinkControlSpec = {
            name: 'speed',
            label: 'Speed',
            description: null,
            group: null,
            type: 'float',
            default: 1.5,
            min: 0,
            max: 5,
            step: 0.1,
        };
        const result = mapControlSpec(control);
        expect(result).not.toBeNull();
        expect(result!.name).toBe('speed');
        expect(result!.glslDeclaration).toBe('uniform float speed;');
        expect(result!.defaultValue).toBe(1.5);
    });

    it('maps int control to GLSL int uniform', () => {
        const control: BlinkControlSpec = {
            name: 'iterations',
            label: null,
            description: null,
            group: null,
            type: 'int',
            default: 4,
            min: 1,
            max: 10,
            step: null,
        };
        const result = mapControlSpec(control);
        expect(result).not.toBeNull();
        expect(result!.glslDeclaration).toBe('uniform int iterations;');
        expect(result!.defaultValue).toBe(4);
    });

    it('maps bool control to GLSL bool uniform with numeric default', () => {
        const control: BlinkControlSpec = {
            name: 'enabled',
            label: null,
            description: null,
            group: null,
            type: 'bool',
            default: true,
        };
        const result = mapControlSpec(control);
        expect(result!.glslDeclaration).toBe('uniform bool enabled;');
        expect(result!.defaultValue).toBe(1);
    });

    it('maps false bool to 0', () => {
        const control: BlinkControlSpec = {
            name: 'disabled',
            label: null,
            description: null,
            group: null,
            type: 'bool',
            default: false,
        };
        const result = mapControlSpec(control);
        expect(result!.defaultValue).toBe(0);
    });

    it('maps color control to GLSL vec4 uniform', () => {
        const control: BlinkControlSpec = {
            name: 'tint',
            label: null,
            description: null,
            group: null,
            type: 'color',
            default: [1, 0.5, 0.25, 1],
        };
        const result = mapControlSpec(control);
        expect(result!.glslDeclaration).toBe('uniform vec4 tint;');
        expect(result!.defaultValue).toEqual(new Float32Array([1, 0.5, 0.25, 1]));
    });

    it('maps enum control to GLSL int uniform by index', () => {
        const control: BlinkControlSpec = {
            name: 'mode',
            label: null,
            description: null,
            group: null,
            type: 'enum',
            default: 'bounce',
            options: ['linear', 'bounce', 'smooth'],
        };
        const result = mapControlSpec(control);
        expect(result!.glslDeclaration).toBe('uniform int mode;');
        expect(result!.defaultValue).toBe(1);
    });

    it('maps point2d control to GLSL vec2 uniform', () => {
        const control: BlinkControlSpec = {
            name: 'center',
            label: null,
            description: null,
            group: null,
            type: 'point2d',
            default: [0.5, 0.3],
            min: null,
            max: null,
        };
        const result = mapControlSpec(control);
        expect(result!.glslDeclaration).toBe('uniform vec2 center;');
        expect(result!.defaultValue).toEqual(new Float32Array([0.5, 0.3]));
    });

    it('returns null for bang control (no shader uniform)', () => {
        const control: BlinkControlSpec = {
            name: 'trigger',
            label: null,
            description: null,
            group: null,
            type: 'bang',
        };
        const result = mapControlSpec(control);
        expect(result).toBeNull();
    });
});

describe('mapControlSpecs', () => {
    it('returns empty array for empty input', () => {
        expect(mapControlSpecs([])).toEqual([]);
    });

    it('maps multiple controls', () => {
        const controls: BlinkControlSpec[] = [
            {
                name: 'a',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 1,
                min: null,
                max: null,
                step: null,
            },
            {
                name: 'b',
                label: null,
                description: null,
                group: null,
                type: 'int',
                default: 3,
                min: null,
                max: null,
                step: null,
            },
            { name: 'c', label: null, description: null, group: null, type: 'color', default: [0, 0, 0, 1] },
        ];
        const result = mapControlSpecs(controls);
        expect(result).toHaveLength(3);
        expect(result[0].name).toBe('a');
        expect(result[1].name).toBe('b');
        expect(result[2].name).toBe('c');
    });

    it('excludes bang controls', () => {
        const controls: BlinkControlSpec[] = [
            {
                name: 'x',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 0,
                min: null,
                max: null,
                step: null,
            },
            { name: 'bang', label: null, description: null, group: null, type: 'bang' },
            {
                name: 'y',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 1,
                min: null,
                max: null,
                step: null,
            },
        ];
        const result = mapControlSpecs(controls);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('x');
        expect(result[1].name).toBe('y');
    });

    it('every result has a non-empty glslDeclaration', () => {
        const controls: BlinkControlSpec[] = [
            {
                name: 'test',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 0,
                min: null,
                max: null,
                step: null,
            },
        ];
        const result = mapControlSpecs(controls);
        for (const entry of result) {
            expect(entry.glslDeclaration.length).toBeGreaterThan(0);
            expect(entry.glslDeclaration).toContain('uniform');
            expect(entry.glslDeclaration).toContain(';');
        }
    });

    it('all names are valid GLSL identifiers', () => {
        const controls: BlinkControlSpec[] = [
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
            { name: 'my_color', label: null, description: null, group: null, type: 'color', default: [0, 0, 0, 1] },
            { name: 'enabled', label: null, description: null, group: null, type: 'bool', default: false },
        ];
        const result = mapControlSpecs(controls);
        for (const entry of result) {
            expect(entry.glslDeclaration).toMatch(/\buniform\s+\w+\s+\w+\s*;/);
        }
    });
});

describe('control uniform value types', () => {
    it('float default is a plain number', () => {
        const ctrl: BlinkControlSpec = {
            name: 'f',
            label: null,
            description: null,
            group: null,
            type: 'float',
            default: 3.14,
            min: null,
            max: null,
            step: null,
        };
        const result = mapControlSpec(ctrl)!;
        expect(typeof result.defaultValue).toBe('number');
    });

    it('int default is a plain number', () => {
        const ctrl: BlinkControlSpec = {
            name: 'i',
            label: null,
            description: null,
            group: null,
            type: 'int',
            default: 7,
            min: null,
            max: null,
            step: null,
        };
        const result = mapControlSpec(ctrl)!;
        expect(typeof result.defaultValue).toBe('number');
    });

    it('color default is a Float32Array', () => {
        const ctrl: BlinkControlSpec = {
            name: 'c',
            label: null,
            description: null,
            group: null,
            type: 'color',
            default: [0.1, 0.2, 0.3, 0.4],
        };
        const result = mapControlSpec(ctrl)!;
        expect(result.defaultValue).toBeInstanceOf(Float32Array);
    });

    it('point2d default is a Float32Array', () => {
        const ctrl: BlinkControlSpec = {
            name: 'p',
            label: null,
            description: null,
            group: null,
            type: 'point2d',
            default: [0.5, 0.5],
            min: null,
            max: null,
        };
        const result = mapControlSpec(ctrl)!;
        expect(result.defaultValue).toBeInstanceOf(Float32Array);
    });

    it('enum default is a numeric index', () => {
        const ctrl: BlinkControlSpec = {
            name: 'e',
            label: null,
            description: null,
            group: null,
            type: 'enum',
            default: 'third',
            options: ['first', 'second', 'third'],
        };
        const result = mapControlSpec(ctrl)!;
        expect(result.defaultValue).toBe(2);
    });

    it('bool default is numeric (0 or 1)', () => {
        const ctrlTrue: BlinkControlSpec = {
            name: 'bt',
            label: null,
            description: null,
            group: null,
            type: 'bool',
            default: true,
        };
        const ctrlFalse: BlinkControlSpec = {
            name: 'bf',
            label: null,
            description: null,
            group: null,
            type: 'bool',
            default: false,
        };
        expect(mapControlSpec(ctrlTrue)!.defaultValue).toBe(1);
        expect(mapControlSpec(ctrlFalse)!.defaultValue).toBe(0);
    });
});
