import type { UniformValue } from '@codexo/exojs';

import type { BlinkControlSpec } from '../../../runtime/ir/types';

/** The source-format metadata a converter attaches to a control. */
interface ControlSource {
    readonly type?: unknown;
    readonly modifiers?: unknown;
    readonly params?: unknown;
    readonly labels?: unknown;
    readonly values?: unknown;
}

type Components = Float32Array | number;

/** Per-frame fraction a `smooth` control moves toward its target when PARAMS is absent. */
const DEFAULT_SMOOTHING = 0.01;

function componentCount(value: Components): number {
    return typeof value === 'number' ? 1 : value.length;
}

function read(value: Components, index: number): number {
    return typeof value === 'number' ? value : value[index];
}

interface Behavior {
    readonly name: string;
    readonly kind: 'smooth' | 'speed' | 'bang' | 'bang-smooth' | 'counter' | 'counter-smooth' | 'dropdown';
    readonly smoothing: number;
    readonly min: number;
    readonly max: number;
    readonly optionCount: number | null;
    readonly values: readonly number[];
    readonly triggerInput: boolean;
    state: Float32Array;
    target: Float32Array;
    previous: Float32Array;
    out: Components;
    primed: boolean;
}

function dropdownOptions(source: ControlSource): { count: number; values: readonly number[] } {
    const values = Array.isArray(source.values)
        ? source.values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        : [];
    return { count: Math.max(values.length, Array.isArray(source.labels) ? source.labels.length : 0, 1), values };
}

function behaviorOf(
    control: BlinkControlSpec,
    source: ControlSource
): Omit<Behavior, 'state' | 'target' | 'previous' | 'out' | 'primed'> | null {
    const type = typeof source.type === 'string' ? source.type : '';
    const words = type.split(/\s+/).filter(word => word.length > 0);
    const base = words[0] ?? '';
    const modifiers = Array.isArray(source.modifiers) ? source.modifiers.map(String) : words.slice(1);
    const params =
        typeof source.params === 'number' && source.params > 0 ? Math.min(source.params, 1) : DEFAULT_SMOOTHING;
    const min = control.type === 'float' ? (control.min ?? 0) : 0;
    const max = control.type === 'float' ? (control.max ?? 1) : 1;
    const { count, values } = dropdownOptions(source);
    const optionCount = base === 'dropdown' ? count : null;

    let kind: Behavior['kind'] | null = null;
    if (base === 'bang') {
        if (modifiers.includes('counter')) {
            kind = modifiers.includes('smooth') ? 'counter-smooth' : 'counter';
        } else {
            kind = modifiers.includes('smooth') ? 'bang-smooth' : 'bang';
        }
    } else if (base === 'dropdown') {
        kind = modifiers.includes('smooth') ? 'smooth' : 'dropdown';
    } else if (modifiers.includes('speed')) {
        kind = 'speed';
    } else if (modifiers.includes('smooth')) {
        kind = 'smooth';
    }
    return kind === null
        ? null
        : { name: control.name, kind, smoothing: params, min, max, optionCount, values, triggerInput: base === 'bang' };
}

function shaderValue(behavior: Behavior, value: number): number {
    if (behavior.optionCount === null) return value;
    const index = Math.max(0, Math.min(behavior.optionCount - 1, Math.trunc(Number.isFinite(value) ? value : 0)));
    return behavior.values[index] ?? index;
}

/** Moves one component of a control's state by a frame of its behavior. */
function advance(behavior: Behavior, index: number, current: number, step: number, alpha: number): void {
    const triggered = current > behavior.previous[index] && current > 0;
    switch (behavior.kind) {
        case 'smooth':
            behavior.state[index] += (current - behavior.state[index]) * alpha;
            break;
        case 'speed':
            behavior.state[index] += current * step;
            break;
        case 'bang':
            behavior.state[index] = triggered ? behavior.max : behavior.min;
            break;
        case 'bang-smooth':
            if (triggered) behavior.state[index] = behavior.max;
            else behavior.state[index] += (behavior.min - behavior.state[index]) * alpha;
            break;
        case 'counter':
            if (triggered) behavior.state[index] += 1;
            break;
        case 'counter-smooth':
            if (triggered) behavior.target[index] += 1;
            behavior.state[index] += (behavior.target[index] - behavior.state[index]) * alpha;
            break;
        case 'dropdown':
            behavior.state[index] = current;
            break;
    }
}

/**
 * Reproduces the behavior an SSF control type adds to its raw value: `smooth` eases toward the
 * target, `speed` integrates the value over time, a `bang` is a one-frame pulse and a bang
 * `counter` counts its pulses. Dropdown positions select source VALUES before smoothing.
 *
 * The raw value in the control store is the control's position; the value the shader reads is
 * what this produces from it.
 */
export class SsfControlProcessor {
    private readonly behaviors: Behavior[];

    public constructor(controls: readonly BlinkControlSpec[], sources: Readonly<Partial<Record<string, object>>>) {
        this.behaviors = [];
        for (const control of controls) {
            const source = sources[control.name];
            if (source === undefined) continue;
            const behavior = behaviorOf(control, source);
            if (behavior === null) continue;
            let size = 1;
            if (control.type === 'point2d') size = 2;
            else if (control.type === 'color') size = 4;
            this.behaviors.push({
                ...behavior,
                state: new Float32Array(size),
                target: new Float32Array(size),
                previous: new Float32Array(size),
                out: size === 1 ? 0 : new Float32Array(size),
                primed: false,
            });
        }
    }

    /** Whether any control needs processing at all. */
    public get active(): boolean {
        return this.behaviors.length > 0;
    }

    public process(raw: Readonly<Record<string, UniformValue>>, deltaTime: number): Record<string, UniformValue> {
        const result: Record<string, UniformValue> = { ...raw };
        const step = Math.min(Math.max(deltaTime, 0), 0.25);
        const frames = step * 60;

        for (const behavior of this.behaviors) {
            const value = raw[behavior.name] as Components | undefined;
            if (value === undefined) continue;
            const count = Math.min(componentCount(value), behavior.state.length);

            if (!behavior.primed) {
                for (let i = 0; i < count; i++) {
                    behavior.state[i] =
                        behavior.kind === 'speed' || behavior.kind === 'counter' || behavior.kind === 'counter-smooth'
                            ? 0
                            : shaderValue(behavior, read(value, i));
                    behavior.previous[i] = behavior.triggerInput ? 0 : read(value, i);
                }
                behavior.primed = true;
            }

            const alpha = 1 - Math.pow(1 - behavior.smoothing, frames);
            for (let i = 0; i < count; i++) {
                const current = shaderValue(behavior, read(value, i));
                advance(behavior, i, current, step, alpha);
                behavior.previous[i] = current;
            }

            if (typeof behavior.out === 'number') {
                behavior.out = behavior.state[0];
                result[behavior.name] = behavior.out;
            } else {
                for (let i = 0; i < behavior.out.length; i++) behavior.out[i] = behavior.state[i];
                result[behavior.name] = behavior.out;
            }
        }
        return result;
    }

    /** Discards the processed history; the next frame primes from the caller's restored raw default. */
    public reset(name: string): void {
        const behavior = this.behaviors.find(current => current.name === name);
        if (behavior === undefined) return;
        behavior.state.fill(0);
        behavior.target.fill(0);
        behavior.previous.fill(0);
        if (typeof behavior.out === 'number') behavior.out = 0;
        else behavior.out.fill(0);
        behavior.primed = false;
    }
}
