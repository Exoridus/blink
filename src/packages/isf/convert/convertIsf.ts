import type {
    BlinkFxAsset,
    BlinkFxControl,
    BlinkFxInput,
    BlinkFxKind,
    BlinkFxManifest,
    BlinkFxPass,
    BlinkFxPassInput,
    BlinkFxRenderTarget,
} from '../../blinkfx/manifest';
import type { ConversionIssue, ConversionStatus, ConvertedPackage } from '../../convert/report';
import {
    floatifyIntegerLiterals,
    hoistGlobalInitializers,
    insertAtFunctionStart,
    removeFragmentOutputs,
    renameReservedWords,
    stripPreambleTokens,
} from '../../ssf/convert/glslAdapt';
import type { Token } from '../../ssf/convert/glslText';
import { detokenize, identifiersUsed, replaceIdentifier, tokenize } from '../../ssf/convert/glslText';
import { ISF_PRELUDE, ISF_PROFILE_ID } from '../profile/IsfProfile';
import { splitIsf } from './parseIsf';
import { translateSizeExpression } from './sizeExpression';

export interface IsfSource {
    /** File name without the `.fs` suffix. */
    readonly slug: string;
    readonly text: string;
    /** A companion `.vs`, which is reported but not run. */
    readonly vertexText?: string;
    /** Files an `IMPORTED` entry may point at, by path relative to the shader. */
    readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface IsfConvertOptions {
    readonly idPrefix?: string;
    readonly converterVersion?: string;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

const IDENTIFIER = /^[A-Za-z_]\w*$/;
const RESERVED = new Set(['PASSINDEX', 'RENDERSIZE', 'TIME', 'TIMEDELTA', 'DATE', 'FRAMEINDEX', 'isf_FragNormCoord']);

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '_')
        .replaceAll(/^_+|_+$/g, '');
    return slug === '' ? 'effect' : slug;
}

interface Collector {
    readonly issues: ConversionIssue[];
    readonly features: Set<string>;
}

interface Inputs {
    readonly controls: BlinkFxControl[];
    readonly hostInputs: BlinkFxInput[];
    /** Image-valued inputs by name: they become samplers bound from host inputs. */
    readonly samplers: Map<string, { source: string }>;
    readonly meta: Record<string, object>;
}

function numberPair(value: unknown, fallback: readonly [number, number]): [number, number] {
    if (Array.isArray(value)) return [finite(value[0]) ?? fallback[0], finite(value[1]) ?? fallback[1]];
    return [fallback[0], fallback[1]];
}

function controlFor(entry: Json, name: string, type: string, collector: Collector): BlinkFxControl | null {
    const common = {
        name,
        label: text(entry.LABEL) ?? name,
    };
    switch (type) {
        case 'float': {
            const min = finite(entry.MIN) ?? 0;
            const max = Math.max(finite(entry.MAX) ?? 1, min);
            const initial = Math.min(Math.max(finite(entry.DEFAULT) ?? min, min), max);
            return { ...common, type: 'float', default: initial, min, max };
        }
        case 'long': {
            const values = Array.isArray(entry.VALUES) ? entry.VALUES.map(Number).filter(Number.isFinite) : [];
            const min = finite(entry.MIN) ?? (values.length > 0 ? Math.min(...values) : 0);
            const max = Math.max(finite(entry.MAX) ?? (values.length > 0 ? Math.max(...values) : 1), min);
            const initial = Math.min(Math.max(Math.round(finite(entry.DEFAULT) ?? min), min), max);
            return { ...common, type: 'int', default: initial, min, max, step: 1 };
        }
        case 'bool':
        case 'event':
            return { ...common, type: 'bool', default: entry.DEFAULT === true || entry.DEFAULT === 1 };
        case 'point2D': {
            const min = numberPair(entry.MIN, [0, 0]);
            const max = numberPair(entry.MAX, [1, 1]);
            const initial = numberPair(entry.DEFAULT, min);
            return { ...common, type: 'point2d', default: initial, min, max };
        }
        case 'color': {
            const raw = Array.isArray(entry.DEFAULT) ? entry.DEFAULT : [1, 1, 1, 1];
            const [r, g, b, a] = [0, 1, 2, 3].map(index => finite(raw[index]) ?? 1);
            return { ...common, type: 'color', default: [r, g, b, a] };
        }
        default:
            collector.issues.push({
                severity: 'warning',
                code: 'input-type-unknown',
                message: `input "${name}" has unknown TYPE "${type}" and was skipped`,
            });
            return null;
    }
}

function convertInputs(header: Json, collector: Collector): Inputs {
    const result: Inputs = { controls: [], hostInputs: [], samplers: new Map(), meta: {} };
    const entries = Array.isArray(header.INPUTS) ? header.INPUTS.filter(isRecord) : [];
    const seen = new Set<string>();

    for (const entry of entries) {
        const name = text(entry.NAME);
        const type = text(entry.TYPE);
        if (
            name === undefined ||
            type === undefined ||
            !IDENTIFIER.test(name) ||
            RESERVED.has(name) ||
            seen.has(name)
        ) {
            collector.issues.push({
                severity: 'warning',
                code: 'input-unusable',
                message: `an input (${String(name)}) has no usable NAME or TYPE and was skipped`,
            });
            continue;
        }
        seen.add(name);

        if (type === 'image') {
            result.hostInputs.push({ name, type: 'image', required: false });
            result.samplers.set(name, { source: `input.${name}` });
            collector.features.add('image-input');
        } else if (type === 'audio' || type === 'audioFFT') {
            const samples = finite(entry.MAX);
            result.hostInputs.push({
                name,
                type,
                ...(samples !== null && samples > 0 ? { samples: Math.round(samples) } : {}),
            });
            result.samplers.set(name, { source: `input.${name}` });
            collector.features.add(type === 'audio' ? 'audio-input' : 'audio-fft-input');
        } else {
            const control = controlFor(entry, name, type, collector);
            if (control === null) continue;
            result.controls.push(control);
            result.meta[name] = {
                format: 'isf',
                type,
                ...(Array.isArray(entry.LABELS) ? { labels: entry.LABELS.map(String) } : {}),
                ...(Array.isArray(entry.VALUES) ? { values: entry.VALUES.map(Number) } : {}),
            };
            if (type === 'event') {
                collector.issues.push({
                    severity: 'info',
                    code: 'event-pulse',
                    message: `event "${name}" is a bool control that reads true for one frame after it is raised`,
                });
            }
        }
    }
    if (result.controls.length > 0) collector.features.add('controls');
    return result;
}

function convertAssets(
    header: Json,
    files: ReadonlyMap<string, Uint8Array>,
    out: Map<string, string | Uint8Array>,
    collector: Collector
): BlinkFxAsset[] {
    const assets: BlinkFxAsset[] = [];
    const imported = header.IMPORTED;
    const entries: Array<[string, Json]> = isRecord(imported)
        ? Object.entries(imported).filter((pair): pair is [string, Json] => isRecord(pair[1]))
        : Array.isArray(imported)
          ? imported.filter(isRecord).flatMap((entry): Array<[string, Json]> => {
                const name = text(entry.NAME);
                return name === undefined ? [] : [[name, entry]];
            })
          : [];

    for (const [name, entry] of entries) {
        const path = text(entry.PATH)?.replace(/^\.\//, '');
        if (entry.TYPE === 'cube') {
            collector.issues.push({
                severity: 'error',
                code: 'cubemap-unsupported',
                message: `imported "${name}" is a cube map, which BlinkFX has no resource type for`,
            });
            continue;
        }
        const bytes = path === undefined ? undefined : files.get(path);
        if (path === undefined || bytes === undefined) {
            collector.issues.push({
                severity: 'error',
                code: 'asset-unresolved',
                message: `imported "${name}" (${String(path)}) is not part of the shader's directory`,
            });
            continue;
        }
        const target = `assets/${path.split('/').pop() ?? path}`;
        out.set(target, bytes);
        assets.push({ name, type: 'texture2d', path: target, sampling: { filter: 'linear', wrap: 'clamp' } });
    }
    if (assets.length > 0) collector.features.add('imported-images');
    return assets;
}

interface PassPlan {
    readonly targetName: string | null;
    readonly persistent: boolean;
    readonly float: boolean;
    readonly width: string | number | null;
    readonly height: string | number | null;
}

function planPasses(header: Json, controlNames: ReadonlySet<string>, collector: Collector): PassPlan[] {
    const raw = Array.isArray(header.PASSES) ? header.PASSES.filter(isRecord) : [];
    if (raw.length === 0) return [{ targetName: null, persistent: false, float: false, width: null, height: null }];

    return raw.map((pass, index) => {
        const width = translateSizeExpression(pass.WIDTH, controlNames);
        const height = translateSizeExpression(pass.HEIGHT, controlNames);
        for (const result of [width, height]) {
            if (result.error !== undefined)
                collector.issues.push({
                    severity: 'error',
                    code: 'size-expression-unsupported',
                    message: `pass ${index}: ${result.error}`,
                });
        }
        if (width.dynamic || height.dynamic) collector.features.add('dynamic-target-size');
        return {
            targetName: text(pass.TARGET) ?? null,
            persistent: pass.PERSISTENT === true,
            float: pass.FLOAT === true,
            width: width.value,
            height: height.value,
        };
    });
}

function targetSpec(plan: PassPlan, name: string, collector: Collector): BlinkFxRenderTarget {
    if (plan.float) collector.features.add('float-targets');
    if (plan.persistent) collector.features.add('persistent-feedback');
    return {
        name,
        ...(plan.width === null ? {} : { width: plan.width }),
        ...(plan.height === null ? {} : { height: plan.height }),
        format: plan.float ? 'rgba16f' : 'rgba8',
        persistent: plan.persistent,
    };
}

function kindOf(inputs: Inputs): BlinkFxKind {
    const names = new Set(inputs.hostInputs.map(input => input.name));
    if (names.has('startImage') && names.has('endImage')) return 'transition';
    if (names.has('inputImage')) return 'filter';
    return 'generator';
}

function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

interface PassContext {
    readonly plans: readonly PassPlan[];
    readonly used: ReadonlySet<string>;
    readonly assets: readonly BlinkFxAsset[];
    readonly inputs: Inputs;
}

function buildPasses(context: PassContext, collector: Collector): BlinkFxPass[] {
    const { plans, used, assets, inputs } = context;
    const targetNames = plans.map(
        (plan, index) => plan.targetName ?? (index === plans.length - 1 ? null : `pass${index}`)
    );
    const inputsFor = (passIndex: number): BlinkFxPassInput[] => {
        const list: BlinkFxPassInput[] = [];
        targetNames.forEach((name, index) => {
            if (name === null || !used.has(name)) return;
            const previous = index >= passIndex;
            if (previous && !plans[index].persistent) return;
            list.push({ source: previous ? `target.${name}.previous` : `target.${name}`, uniform: name });
        });
        for (const asset of assets) {
            if (used.has(asset.name)) list.push({ source: `asset.${asset.name}`, uniform: asset.name });
        }
        for (const [name, sampler] of inputs.samplers) {
            if (used.has(name)) list.push({ source: sampler.source, uniform: name });
        }
        return list;
    };

    if (plans.length > 1) collector.features.add('passes');
    return plans.map((plan, index) => {
        const name = targetNames[index];
        const toScreen = name === null && index === plans.length - 1;
        return {
            name: name ?? 'main',
            shader: 'main',
            inputs: inputsFor(index),
            target: toScreen ? 'screen' : targetSpec(plan, name ?? `pass${index}`, collector),
            // A persistent buffer keeps its content between frames; everything else starts clean.
            clear: !plan.persistent,
        };
    });
}

function statusOf(issues: readonly ConversionIssue[]): ConversionStatus {
    if (issues.some(issue => issue.severity === 'error')) return 'failed';
    return issues.some(issue => issue.severity === 'warning') ? 'approximate' : 'complete';
}

/**
 * Converts one ISF shader into a self-contained BlinkFX package that keeps the shader's source
 * and declares the `isf/2` compatibility profile. The ISF built-ins and image helpers are
 * macros over the native ABI, so the shader body stays what its author wrote.
 */
export function convertIsf(source: IsfSource, options: IsfConvertOptions = {}): ConvertedPackage {
    const collector: Collector = { issues: [], features: new Set<string>() };
    const parts = splitIsf(source.text);
    if (parts.headerError !== null)
        collector.issues.push({ severity: 'error', code: 'header-invalid', message: parts.headerError });
    const header: Json = parts.header ?? {};
    if (parts.header === null && parts.headerError === null) {
        collector.issues.push({
            severity: 'info',
            code: 'header-missing',
            message: 'the file has no ISF header; it converts as a plain fragment shader',
        });
    }
    if (source.vertexText !== undefined) {
        collector.issues.push({
            severity: 'warning',
            code: 'vertex-shader-ignored',
            message: 'the companion vertex shader is not run; the runtime fullscreen stage is used',
        });
    }

    const inputs = convertInputs(header, collector);
    const files = new Map<string, string | Uint8Array>();
    const assets = convertAssets(header, source.files, files, collector);
    const plans = planPasses(header, new Set(inputs.controls.map(control => control.name)), collector);

    // ── shader ────────────────────────────────────────────────────────────────
    const tokens: Token[] = stripPreambleTokens(tokenize(parts.body));
    renameReservedWords(tokens);
    replaceIdentifier(tokens, 'gl_FragColor', 'fragColor');
    replaceIdentifier(tokens, 'texture2D', 'texture');
    replaceIdentifier(tokens, 'texture2DRect', 'texture');
    removeFragmentOutputs(tokens);
    const integralControls = inputs.controls.filter(control => control.type === 'int').map(control => control.name);
    if (floatifyIntegerLiterals(tokens, integralControls) > 0) collector.features.add('literal-adaptation');
    const globalAssignments = hoistGlobalInitializers(tokens);
    const used = identifiersUsed(tokens);
    if (
        !insertAtFunctionStart(tokens, 'main', [
            'isf_FragNormCoord = gl_FragCoord.xy / bl_resolution;',
            ...globalAssignments,
        ])
    ) {
        collector.issues.push({ severity: 'error', code: 'entry-missing', message: 'the shader defines no main()' });
    }

    const passes = buildPasses({ plans, used, assets, inputs }, collector);

    const body = detokenize(tokens);
    files.set(
        'shaders/main.frag.glsl',
        [
            '// Generated by the BlinkFX ISF converter (profile isf/2).',
            'precision highp int;',
            ISF_PRELUDE,
            body,
            '',
        ].join('\n')
    );
    files.set('source/main.fs', source.text);

    // ── manifest ──────────────────────────────────────────────────────────────
    const description = text(header.DESCRIPTION);
    const credit = text(header.CREDIT);
    const isfVersion = text(header.ISFVSN) ?? '2.0';
    const manifest: BlinkFxManifest = {
        format: 'blinkfx/1',
        id: `${options.idPrefix ?? 'com.codexo.isf'}.${slugify(source.slug)}`,
        title: text(header.TITLE) ?? source.slug,
        ...(credit === undefined ? {} : { author: credit }),
        ...(description === undefined ? {} : { description }),
        tags: stringList(header.CATEGORIES),
        kind: kindOf(inputs),
        ...(inputs.controls.length > 0 ? { controls: inputs.controls } : {}),
        ...(inputs.hostInputs.length > 0 ? { inputs: inputs.hostInputs } : {}),
        ...(assets.length > 0 ? { assets } : {}),
        passes,
        shaders: { glsl: { main: 'shaders/main.frag.glsl' } },
        compatibility: {
            source: { format: 'isf', version: isfVersion },
            profile: ISF_PROFILE_ID,
            mode: 'preserve',
            converter: `blinkfx-isf-converter/${options.converterVersion ?? '1'}`,
            ...(Object.keys(inputs.meta).length > 0 ? { controls: inputs.meta } : {}),
        },
    };
    files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

    return {
        manifest,
        files,
        report: {
            slug: source.slug,
            status: statusOf(collector.issues),
            issues: collector.issues,
            features: [...collector.features].sort(),
        },
    };
}
