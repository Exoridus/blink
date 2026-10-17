import type { UniformValue } from '@codexo/exojs';

import type { BlinkControlSpec, BlinkPresetRef } from '../../runtime/ir/types';

/** Fetches a preset file's raw JSON body; the caller resolves `path` against the package base. */
export type PresetFetch = (path: string) => Promise<Response>;

export interface LoadedPreset {
    readonly name: string;
    readonly values: Readonly<Record<string, UniformValue>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isNumberPair(value: unknown): value is readonly [number, number] {
    return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

function isNumberQuad(value: unknown): value is readonly [number, number, number, number] {
    return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

function fail(path: string, message: string): never {
    throw new Error(`Invalid preset "${path}": ${message}`);
}

function convertValue(control: BlinkControlSpec, value: unknown, path: string): UniformValue {
    switch (control.type) {
        case 'float':
            if (!isFiniteNumber(value)) {
                fail(path, `control "${control.name}" expects a number for "float", got ${JSON.stringify(value)}`);
            }
            return value;
        case 'int':
            if (!isFiniteNumber(value) || !Number.isInteger(value)) {
                fail(path, `control "${control.name}" expects an integer for "int", got ${JSON.stringify(value)}`);
            }
            return value;
        case 'bool':
            if (typeof value !== 'boolean') {
                fail(path, `control "${control.name}" expects a boolean for "bool", got ${JSON.stringify(value)}`);
            }
            return value ? 1 : 0;
        case 'color':
            if (!isNumberQuad(value)) {
                fail(path, `control "${control.name}" expects [r, g, b, a] for "color", got ${JSON.stringify(value)}`);
            }
            return new Float32Array(value);
        case 'enum':
            if (typeof value !== 'string' || !control.options.includes(value)) {
                fail(
                    path,
                    `control "${control.name}" expects one of ${JSON.stringify(control.options)} for "enum", got ${JSON.stringify(value)}`
                );
            }
            return control.options.indexOf(value);
        case 'point2d':
            if (!isNumberPair(value)) {
                fail(path, `control "${control.name}" expects [x, y] for "point2d", got ${JSON.stringify(value)}`);
            }
            return new Float32Array(value);
        case 'bang':
            // A bang carries no durable shader state (spec section 6) and ControlValueStore holds no
            // entry for one, so there is no value slot a preset could ever apply into.
            fail(
                path,
                `control "${control.name}" does not accept a preset value (bang controls hold no durable state)`
            );
    }
}

function parsePresetValues(
    raw: Record<string, unknown>,
    controls: readonly BlinkControlSpec[],
    path: string
): Record<string, UniformValue> {
    const rawValues = raw.values;
    if (!isRecord(rawValues)) {
        fail(path, '"values" must be an object');
    }

    const byName = new Map(controls.map(c => [c.name, c]));
    const values: Record<string, UniformValue> = {};
    for (const [name, value] of Object.entries(rawValues)) {
        const control = byName.get(name);
        if (control === undefined) {
            fail(path, `unknown control "${name}"`);
        }
        values[name] = convertValue(control, value, path);
    }
    return values;
}

function parsePreset(raw: unknown, controls: readonly BlinkControlSpec[], ref: BlinkPresetRef): LoadedPreset {
    if (!isRecord(raw)) {
        fail(ref.path, 'expected an object');
    }
    if (!('values' in raw)) {
        fail(ref.path, 'missing "values"');
    }

    const values = parsePresetValues(raw, controls, ref.path);
    const name = typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : ref.name;
    return { name, values };
}

/**
 * Fetches, validates and converts one preset file into values ready for
 * `ControlValueStore.applyValues`. Every value is checked against the effect's declared
 * controls: a name the effect does not declare, or a value that does not match the declared
 * control's type, is a load error rather than a silently dropped or coerced value.
 */
export async function loadBlinkPreset(
    ref: BlinkPresetRef,
    controls: readonly BlinkControlSpec[],
    fetchImpl: PresetFetch
): Promise<LoadedPreset> {
    const response = await fetchImpl(ref.path);
    if (!response.ok) {
        throw new Error(`Failed to load preset: ${ref.path} (${response.status})`);
    }
    const raw = (await response.json()) as unknown;
    return parsePreset(raw, controls, ref);
}

/** Loads every preset in `refs`, in order, against the same set of declared controls. */
export async function loadBlinkPresets(
    refs: readonly BlinkPresetRef[],
    controls: readonly BlinkControlSpec[],
    fetchImpl: PresetFetch
): Promise<LoadedPreset[]> {
    return Promise.all(refs.map(ref => loadBlinkPreset(ref, controls, fetchImpl)));
}
