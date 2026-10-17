import type { BlinkFxControl } from '../../blinkfx/manifest';
import type { ConversionIssue } from '../../convert/report';

/** What the `ssf/1` profile needs to reproduce a control's behavior beyond its raw value. */
export interface SsfControlSource {
    readonly format: 'ssf';
    readonly type: string;
    readonly modifiers: readonly string[];
    readonly params?: number;
    readonly labels?: readonly string[];
    readonly values?: readonly number[];
    readonly meta?: boolean;
}

export interface MappedControls {
    readonly controls: BlinkFxControl[];
    /** Per-control source metadata, keyed by control name. */
    readonly sources: Record<string, SsfControlSource>;
    /** Names of `color` controls: an SSF color is a `vec3`, the native one a `vec4`. */
    readonly colorNames: string[];
    readonly issues: ConversionIssue[];
}

const GLSL_IDENTIFIER = /^[A-Za-z_]\w*$/;
const KNOWN_TYPES = new Set([
    'slider',
    'slider smooth',
    'slider speed',
    'slider traveler',
    'knob',
    'knob smooth',
    'knob speed',
    'knob traveler',
    'toggle',
    'toggle smooth',
    'bang',
    'bang smooth',
    'bang counter',
    'bang counter smooth',
    'xy',
    'xy smooth',
    'xy speed',
    'xy traveler',
    'color',
    'color smooth',
    'dropdown',
    'dropdown smooth',
]);
const KNOWN_MODIFIERS = new Set(['smooth', 'speed', 'traveler', 'counter']);

type Json = Record<string, unknown>;
interface Common {
    readonly name: string;
    readonly label: string;
    readonly description?: string;
    readonly group?: string;
}

function isRecord(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pair(value: unknown, fallback: readonly [number, number]): [number, number] {
    if (Array.isArray(value)) {
        const x = finite(value[0]);
        const y = finite(value[1]);
        return [x ?? fallback[0], y ?? fallback[1]];
    }
    const scalar = finite(value);
    return scalar === null ? [fallback[0], fallback[1]] : [scalar, scalar];
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

function commonFields(entry: Json, name: string): Common {
    const description = nonEmptyString(entry.DESCRIPTION);
    const group = nonEmptyString(entry.UI_GROUP);
    return {
        name,
        label: nonEmptyString(entry.LABEL) ?? name.replaceAll('_', ' '),
        ...(description === undefined ? {} : { description }),
        ...(group === undefined ? {} : { group }),
    };
}

function sourceOf(entry: Json, typeText: string, modifiers: string[]): SsfControlSource {
    const params = modifiers.some(modifier => modifier === 'smooth' || modifier === 'traveler')
        ? (finite(entry.PARAMS) ?? 0.01)
        : null;
    return {
        format: 'ssf',
        type: typeText === '' ? 'slider' : typeText,
        modifiers,
        ...(params === null ? {} : { params }),
        ...(entry.IS_META === true ? { meta: true } : {}),
        ...(Array.isArray(entry.LABELS)
            ? { labels: entry.LABELS.filter((value): value is string => typeof value === 'string') }
            : {}),
        ...(Array.isArray(entry.VALUES)
            ? {
                  values: entry.VALUES.filter(
                      (value): value is number => typeof value === 'number' && Number.isFinite(value)
                  ),
              }
            : {}),
    };
}

function xyControl(common: Common, entry: Json): BlinkFxControl {
    const min = pair(entry.MIN, [0, 0]);
    const max = pair(entry.MAX, [1, 1]);
    const upper: [number, number] = [Math.max(max[0], min[0]), Math.max(max[1], min[1])];
    const initial = pair(entry.DEFAULT, [0, 0]);
    return {
        ...common,
        type: 'point2d',
        default: [clamp(initial[0], min[0], upper[0]), clamp(initial[1], min[1], upper[1])],
        min,
        max: upper,
    };
}

function hasCompleteColor(value: unknown): boolean {
    return Array.isArray(value) && value.length >= 3 && value.every(component => finite(component) !== null);
}

function colorControl(common: Common, entry: Json): BlinkFxControl {
    const components = Array.isArray(entry.DEF_COLOR)
        ? entry.DEF_COLOR
        : Array.isArray(entry.DEFAULT)
          ? entry.DEFAULT
          : [1, 1, 1];
    const [r, g, b] = [0, 1, 2].map(index => clamp(finite(components[index]) ?? 1, 0, 1));
    return { ...common, type: 'color', default: [r, g, b, 1] };
}

function dropdownControl(common: Common, entry: Json, source: SsfControlSource): BlinkFxControl {
    const optionCount = Math.max(source.labels?.length ?? 0, source.values?.length ?? 0, 1);
    const max = optionCount - 1;
    return { ...common, type: 'float', default: clamp(finite(entry.DEFAULT) ?? 1, 0, max), min: 0, max, step: 1 };
}

function scalarControl(common: Common, entry: Json, base: string): BlinkFxControl {
    const min = finite(entry.MIN) ?? 0;
    const max = Math.max(finite(entry.MAX) ?? 1, min);
    const initial = finite(Array.isArray(entry.DEFAULT) ? entry.DEFAULT[0] : entry.DEFAULT) ?? 1;
    const switchLike = base === 'toggle' || base === 'bang';
    return {
        ...common,
        type: 'float',
        default: clamp(initial, min, max),
        min,
        max,
        ...(switchLike ? { step: max - min || 1 } : {}),
    };
}

function typeIssues(name: string, typeText: string, modifiers: readonly string[]): ConversionIssue[] {
    const issues: ConversionIssue[] = [];
    if (typeText === '') {
        issues.push({
            severity: 'info',
            code: 'control-untyped',
            message: `control "${name}" has no TYPE and is treated as a slider`,
        });
    } else if (!KNOWN_TYPES.has(typeText)) {
        issues.push({
            severity: 'warning',
            code: 'control-type-unknown',
            message: `control "${name}" has unknown TYPE "${typeText}"; treated as a slider`,
        });
    }
    if (KNOWN_TYPES.has(typeText) && (modifiers.length > 0 || typeText === 'bang')) {
        issues.push({
            severity: 'warning',
            code: 'control-native-dynamics-unverified',
            message: `control "${name}" uses portable control dynamics; native class arithmetic and traveler behavior are not qualified`,
        });
    }
    for (const modifier of modifiers.filter(word => !KNOWN_MODIFIERS.has(word))) {
        issues.push({
            severity: 'warning',
            code: 'control-modifier-unknown',
            message: `control "${name}" has unknown modifier "${modifier}"`,
        });
    }
    return issues;
}

function build(common: Common, entry: Json, base: string, source: SsfControlSource): BlinkFxControl {
    if (base === 'xy') return xyControl(common, entry);
    if (base === 'color') return colorControl(common, entry);
    if (base === 'dropdown') return dropdownControl(common, entry, source);
    return scalarControl(common, entry, base);
}

/**
 * Maps SSF `CONTROLS` onto native controls. Every SSF slider-like control is a `float` here,
 * including toggles, bangs and dropdowns: the scene's shader reads them as a plain `float`, and a
 * native `bool` or `int` uniform would not type-check against that source.
 */
export function mapControls(raw: unknown, reserved: ReadonlySet<string>): MappedControls {
    const result: MappedControls = { controls: [], sources: {}, colorNames: [], issues: [] };
    if (raw === undefined) return result;
    if (!Array.isArray(raw)) {
        result.issues.push({
            severity: 'warning',
            code: 'controls-not-array',
            message: 'CONTROLS is not an array and was ignored',
        });
        return result;
    }

    const seen = new Set<string>();
    for (const entry of raw) {
        const name = isRecord(entry) && typeof entry.NAME === 'string' ? entry.NAME : '';
        if (!isRecord(entry) || name === '') {
            result.issues.push({
                severity: 'warning',
                code: 'control-unnamed',
                message: 'a control without a NAME was skipped',
            });
            continue;
        }
        if (!GLSL_IDENTIFIER.test(name) || reserved.has(name) || seen.has(name)) {
            result.issues.push({
                severity: 'warning',
                code: 'control-name-unusable',
                message: `control "${name}" is not a usable uniform name (invalid, reserved or duplicate) and was skipped`,
            });
            continue;
        }
        seen.add(name);

        const typeText = typeof entry.TYPE === 'string' ? entry.TYPE.trim() : '';
        const words = typeText.split(/\s+/).filter(word => word.length > 0);
        const known = typeText === '' || KNOWN_TYPES.has(typeText);
        const base = known ? (words[0] ?? 'slider') : 'slider';
        const source = sourceOf(entry, typeText, known ? words.slice(1) : []);
        result.issues.push(...typeIssues(name, typeText, words.slice(1)));
        if (base === 'color' && !hasCompleteColor(entry.DEF_COLOR)) {
            result.issues.push({
                severity: 'warning',
                code: 'control-color-default-unverified',
                message: `control "${name}" uses the portable color fallback; native missing or incomplete DEF_COLOR picker defaults are unverified`,
            });
        }
        result.controls.push(build(commonFields(entry, name), entry, base, source));
        result.sources[name] = source;
        if (base === 'color') result.colorNames.push(name);
    }
    return result;
}
