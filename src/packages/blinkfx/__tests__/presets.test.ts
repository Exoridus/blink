import { describe, expect, it } from 'vitest';

import type { BlinkControlSpec, BlinkPresetRef } from '../../../runtime/ir/types';
import { loadBlinkPreset, loadBlinkPresets, type PresetFetch } from '../presets';

const CONTROLS: BlinkControlSpec[] = [
    {
        name: 'intensity',
        label: null,
        description: null,
        group: null,
        type: 'float',
        default: 0.5,
        min: null,
        max: null,
        step: null,
    },
    {
        name: 'count',
        label: null,
        description: null,
        group: null,
        type: 'int',
        default: 1,
        min: null,
        max: null,
        step: null,
    },
    { name: 'active', label: null, description: null, group: null, type: 'bool', default: true },
    { name: 'tint', label: null, description: null, group: null, type: 'color', default: [1, 1, 1, 1] },
    {
        name: 'palette',
        label: null,
        description: null,
        group: null,
        type: 'enum',
        default: 'aurora',
        options: ['aurora', 'ember'],
    },
    {
        name: 'offset',
        label: null,
        description: null,
        group: null,
        type: 'point2d',
        default: [0, 0],
        min: null,
        max: null,
    },
    { name: 'trigger', label: null, description: null, group: null, type: 'bang' },
];

const REF: BlinkPresetRef = { name: 'default', path: 'effects/test.blinkfx/presets/default.json' };

function fetchJson(payload: unknown, ok = true, status = 200): PresetFetch {
    return async () => ({ ok, status, json: async () => payload }) as Response;
}

function fetchRejecting(error: Error): PresetFetch {
    return async () => {
        throw error;
    };
}

describe('loadBlinkPreset', () => {
    it('applies every value from a valid preset, converted to its control type', async () => {
        const fetchImpl = fetchJson({
            name: 'Default',
            values: {
                intensity: 0.7,
                count: 3,
                active: false,
                tint: [0, 1, 0, 1],
                palette: 'ember',
                offset: [0.25, 0.75],
            },
        });

        const preset = await loadBlinkPreset(REF, CONTROLS, fetchImpl);

        expect(preset.name).toBe('Default');
        expect(preset.values.intensity).toBe(0.7);
        expect(preset.values.count).toBe(3);
        expect(preset.values.active).toBe(0);
        expect(preset.values.tint).toEqual(new Float32Array([0, 1, 0, 1]));
        expect(preset.values.palette).toBe(1);
        expect(preset.values.offset).toEqual(new Float32Array([0.25, 0.75]));
    });

    it('falls back to the manifest preset name when the file has none', async () => {
        const fetchImpl = fetchJson({ values: { intensity: 0.1 } });
        const preset = await loadBlinkPreset(REF, CONTROLS, fetchImpl);
        expect(preset.name).toBe('default');
    });

    it('rejects a preset naming a control the effect does not declare', async () => {
        const fetchImpl = fetchJson({ values: { nope: 1 } });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/unknown control "nope"/);
    });

    it('rejects a preset naming a bang control', async () => {
        const fetchImpl = fetchJson({ values: { trigger: 1 } });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/"trigger"/);
    });

    it('rejects a preset file that is not an object', async () => {
        const fetchImpl = fetchJson('not an object');
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/expected an object/);
    });

    it('rejects a preset file missing "values"', async () => {
        const fetchImpl = fetchJson({ name: 'Default' });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/"values"/);
    });

    it('rejects a preset file whose "values" is not an object', async () => {
        const fetchImpl = fetchJson({ values: [1, 2, 3] });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/"values"/);
    });

    it('surfaces an HTTP failure fetching the preset file', async () => {
        const fetchImpl = fetchJson({}, false, 404);
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(new RegExp(`${REF.path}.*404`));
    });

    it('surfaces a fetcher failure', async () => {
        const fetchImpl = fetchRejecting(new Error('network down'));
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow('network down');
    });

    it('rejects a string value for a float control', async () => {
        const fetchImpl = fetchJson({ values: { intensity: 'fast' } });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/"intensity"/);
    });

    it('rejects a non-integer value for an int control', async () => {
        const fetchImpl = fetchJson({ values: { count: 1.5 } });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/"count"/);
    });

    it('rejects a non-boolean value for a bool control', async () => {
        const fetchImpl = fetchJson({ values: { active: 'yes' } });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/"active"/);
    });

    it('rejects an out-of-range enum option', async () => {
        const fetchImpl = fetchJson({ values: { palette: 'nonexistent' } });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/"palette"/);
    });

    it('rejects a wrong-length array for a color control', async () => {
        const fetchImpl = fetchJson({ values: { tint: [1, 2, 3] } });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/"tint"/);
    });

    it('rejects a wrong-length array for a point2d control', async () => {
        const fetchImpl = fetchJson({ values: { offset: [1] } });
        await expect(loadBlinkPreset(REF, CONTROLS, fetchImpl)).rejects.toThrow(/"offset"/);
    });
});

describe('loadBlinkPresets', () => {
    it('loads every preset in the given order', async () => {
        const refs: BlinkPresetRef[] = [
            { name: 'default', path: 'presets/default.json' },
            { name: 'fast', path: 'presets/fast.json' },
        ];
        const fetchImpl: PresetFetch = async path =>
            ({
                ok: true,
                status: 200,
                json: async () =>
                    path.includes('fast')
                        ? { name: 'Fast', values: { intensity: 1 } }
                        : { name: 'Default', values: { intensity: 0.5 } },
            }) as Response;

        const presets = await loadBlinkPresets(refs, CONTROLS, fetchImpl);
        expect(presets).toHaveLength(2);
        expect(presets[0].name).toBe('Default');
        expect(presets[1].name).toBe('Fast');
    });
});
