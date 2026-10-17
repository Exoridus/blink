import { parseSizeExpression } from '../../runtime/ir/sizeExpression';
import {
    type BlinkSourceRef,
    type KnownSourceNames,
    parseSourceRef,
    resolveLegacySourceName,
    sourceRefResourceName,
} from '../../runtime/ir/sourceRef';
import type {
    BlinkAssetSpec,
    BlinkCompatibilityInfo,
    BlinkControlSpec,
    BlinkDimension,
    BlinkEffectIR,
    BlinkHostInputSpec,
    BlinkOutputSpec,
    BlinkPassInputSpec,
    BlinkPassSpec,
    BlinkPresetRef,
    BlinkRenderTargetSpec,
    BlinkRequirements,
    BlinkShaderEntry,
    BlinkShaderMap,
    BlinkShaderSource,
    Diagnostic,
} from '../../runtime/ir/types';
import type {
    BlinkFxAsset,
    BlinkFxCompatibility,
    BlinkFxControl,
    BlinkFxGlslShader,
    BlinkFxInput,
    BlinkFxManifest,
    BlinkFxPass,
    BlinkFxPassInput,
    BlinkFxPreset,
    BlinkFxRenderTarget,
} from './manifest';

function resolvePath(basePath: string, relativePath: string): string {
    if (basePath.endsWith('/')) {
        return `${basePath}${relativePath}`;
    }
    return `${basePath}/${relativePath}`;
}

function shaderSource(basePath: string, path: string): BlinkShaderSource {
    return { path: resolvePath(basePath, path), source: null };
}

function normalizeShader(raw: BlinkFxGlslShader, basePath: string): BlinkShaderEntry {
    if (typeof raw === 'string') {
        return { ...shaderSource(basePath, raw), vertex: null, stage: 'visual' };
    }
    if ('audio' in raw) {
        return { ...shaderSource(basePath, raw.audio), vertex: null, stage: 'audio' };
    }
    return {
        ...shaderSource(basePath, raw.fragment),
        vertex: raw.vertex === undefined ? null : shaderSource(basePath, raw.vertex),
        stage: 'visual',
    };
}

function normalizeShaderSet(
    raw: string | Readonly<Record<string, BlinkFxGlslShader>>,
    basePath: string
): Readonly<Record<string, BlinkShaderEntry>> {
    if (typeof raw === 'string') {
        return { main: normalizeShader(raw, basePath) };
    }

    const entries: Record<string, BlinkShaderEntry> = {};
    for (const [name, shader] of Object.entries(raw)) {
        entries[name] = normalizeShader(shader, basePath);
    }
    return entries;
}

function mapControl(c: BlinkFxControl): BlinkControlSpec {
    const base = {
        name: c.name,
        label: c.label ?? null,
        description: c.description ?? null,
        group: c.group ?? null,
    };

    switch (c.type) {
        case 'float': {
            const f = c;
            return {
                ...base,
                type: 'float',
                default: f.default,
                min: f.min ?? null,
                max: f.max ?? null,
                step: f.step ?? null,
            };
        }
        case 'int': {
            const i = c;
            return {
                ...base,
                type: 'int',
                default: i.default,
                min: i.min ?? null,
                max: i.max ?? null,
                step: i.step ?? null,
            };
        }
        case 'bool': {
            const b = c;
            return { ...base, type: 'bool', default: b.default };
        }
        case 'color': {
            const cl = c;
            return { ...base, type: 'color', default: cl.default };
        }
        case 'enum': {
            const e = c;
            return { ...base, type: 'enum', default: e.default, options: e.options };
        }
        case 'point2d': {
            const p = c;
            return {
                ...base,
                type: 'point2d',
                default: p.default,
                min: p.min ?? null,
                max: p.max ?? null,
            };
        }
        case 'bang': {
            return { ...base, type: 'bang' };
        }
    }
}

function mapAsset(a: BlinkFxAsset, basePath: string): BlinkAssetSpec {
    return {
        name: a.name,
        type: 'texture2d',
        path: resolvePath(basePath, a.path),
        sampling: {
            filter: a.sampling?.filter ?? 'linear',
            wrap: a.sampling?.wrap ?? 'clamp',
        },
    };
}

function mapHostInput(i: BlinkFxInput): BlinkHostInputSpec {
    return {
        name: i.name,
        type: i.type,
        required: i.required ?? false,
        samples: i.samples ?? null,
        representation: i.representation ?? null,
        ...(i.sampling === undefined
            ? {}
            : { sampling: { filter: i.sampling.filter ?? 'linear', wrap: i.sampling.wrap ?? 'clamp' } }),
    };
}

function mapCompatibility(c: BlinkFxCompatibility): BlinkCompatibilityInfo {
    return {
        source: c.source ? { format: c.source.format, version: c.source.version ?? null } : null,
        profile: c.profile ?? null,
        mode: c.mode ?? null,
        converter: c.converter ?? null,
        controls: c.controls ?? {},
        scriptUniforms: c.scriptUniforms ?? {},
    };
}

function mapDiagnostics(raw: Record<string, unknown> | undefined): Diagnostic[] {
    if (raw === undefined) {
        return [];
    }
    return Object.entries(raw).map(([key, value]) => ({ key, value }));
}

function mapPassInput(raw: BlinkFxPassInput, known: KnownSourceNames, where: string): BlinkPassInputSpec {
    if (typeof raw === 'string') {
        const source = resolveLegacySourceName(raw, known);
        if (source === null) {
            throw new Error(`${where}: "${raw}" does not name a declared render target or asset`);
        }
        return { source, uniform: sourceRefResourceName(source) };
    }
    const source: BlinkSourceRef | null = parseSourceRef(raw.source);
    if (source === null) {
        throw new Error(`${where}: "${raw.source}" is not a canonical source reference`);
    }
    return { source, uniform: raw.uniform };
}

function mapPass(p: BlinkFxPass, known: KnownSourceNames, index: number): BlinkPassSpec {
    const target: BlinkPassSpec['target'] =
        p.target === undefined || p.target === 'screen'
            ? { kind: 'screen' }
            : { kind: 'renderTarget', name: p.target.name };

    return {
        name: p.name,
        shader: p.shader,
        inputs: (p.inputs ?? []).map((raw, i) => mapPassInput(raw, known, `passes[${index}].inputs[${i}]`)),
        target,
        clear: p.clear ?? true,
    };
}

function mapDimension(value: number | string | undefined): BlinkDimension | null {
    if (value === undefined) {
        return null;
    }
    return typeof value === 'string' ? parseSizeExpression(value) : value;
}

function extractRenderTarget(target: BlinkFxRenderTarget): BlinkRenderTargetSpec {
    return {
        name: target.name,
        width: mapDimension(target.width),
        height: mapDimension(target.height),
        scale: target.scale ?? null,
        format: target.format ?? 'rgba8',
        persistent: target.persistent ?? false,
        ...(target.sampling === undefined
            ? {}
            : { sampling: { filter: target.sampling.filter ?? 'linear', wrap: target.sampling.wrap ?? 'clamp' } }),
    };
}

function mapRequirements(requirements: BlinkFxManifest['requirements']): BlinkRequirements {
    return {
        features: requirements?.features ?? [],
        backends: requirements?.backends ?? [],
    };
}

/**
 * A package without passes gets the implicit main pass only if it claims a visual output: an
 * audio-only package must not acquire a screen pass it never declared.
 */
function buildPassGraph(
    passes: BlinkFxManifest['passes'],
    assetSpecs: readonly BlinkAssetSpec[],
    outputs: BlinkOutputSpec
): { passes: BlinkPassSpec[]; renderTargets: BlinkRenderTargetSpec[] } {
    if (passes !== undefined && passes.length > 0) {
        return buildPassesAndTargets(passes, assetSpecs);
    }
    return { passes: outputs.visual ? [buildImplicitPass()] : [], renderTargets: [] };
}

function mapOutputs(outputs: BlinkFxManifest['outputs']): BlinkOutputSpec {
    return {
        visual: outputs?.visual ?? true,
        audio: outputs?.audio
            ? {
                  shader: outputs.audio.shader,
                  abi: outputs.audio.abi ?? 'blink-audio/1',
                  channels: outputs.audio.channels ?? 2,
                  sampleRate: outputs.audio.sampleRate ?? 'device',
              }
            : null,
    };
}

function mapPreset(p: BlinkFxPreset, basePath: string): BlinkPresetRef {
    return {
        name: p.name,
        path: resolvePath(basePath, p.path),
    };
}

function buildImplicitPass(): BlinkPassSpec {
    return {
        name: 'main',
        shader: 'main',
        inputs: [],
        target: { kind: 'screen' },
        clear: true,
    };
}

function collectDeclaredTargets(passes: readonly BlinkFxPass[]): Set<string> {
    const declared = new Set<string>();
    for (const p of passes) {
        if (p.target !== undefined && p.target !== 'screen') {
            declared.add(p.target.name);
        }
    }
    return declared;
}

function buildPassesAndTargets(
    manifestPasses: readonly BlinkFxPass[],
    assetSpecs: readonly BlinkAssetSpec[]
): { passes: BlinkPassSpec[]; renderTargets: BlinkRenderTargetSpec[] } {
    const known: KnownSourceNames = {
        targets: collectDeclaredTargets(manifestPasses),
        assets: new Set(assetSpecs.map(a => a.name)),
    };

    const passList: BlinkPassSpec[] = [];
    const rtList: BlinkRenderTargetSpec[] = [];
    const seenTargets = new Set<string>();

    for (const [index, p] of manifestPasses.entries()) {
        passList.push(mapPass(p, known, index));

        if (p.target !== undefined && p.target !== 'screen' && !seenTargets.has(p.target.name)) {
            rtList.push(extractRenderTarget(p.target));
            seenTargets.add(p.target.name);
        }
    }

    return { passes: passList, renderTargets: rtList };
}

export function loadBlinkFx(manifest: BlinkFxManifest, basePath: string): BlinkEffectIR {
    const glsl = manifest.shaders.glsl !== undefined ? normalizeShaderSet(manifest.shaders.glsl, basePath) : {};
    const wgsl = manifest.shaders.wgsl !== undefined ? normalizeShaderSet(manifest.shaders.wgsl, basePath) : {};

    const shaders: BlinkShaderMap = { glsl, wgsl };

    const assetSpecs = (manifest.assets ?? []).map(a => mapAsset(a, basePath));

    const outputs = mapOutputs(manifest.outputs);
    const { passes, renderTargets } = buildPassGraph(manifest.passes, assetSpecs, outputs);

    return {
        format: 'blinkfx-ir/1',
        metadata: {
            id: manifest.id,
            title: manifest.title,
            version: manifest.version ?? null,
            author: manifest.author ?? null,
            description: manifest.description ?? null,
            license: manifest.license ?? null,
            thumbnail: manifest.thumbnail ?? null,
            tags: manifest.tags ?? [],
        },
        kind: manifest.kind ?? 'generator',
        controls: (manifest.controls ?? []).map(mapControl),
        hostInputs: (manifest.inputs ?? []).map(mapHostInput),
        assets: assetSpecs,
        renderTargets,
        passes,
        shaders,
        packageRoot: basePath,
        presets: (manifest.presets ?? []).map(p => mapPreset(p, basePath)),
        script: manifest.script
            ? {
                  // Resolved like every other package file: the runtime fetches this path directly, and a
                  // package-relative one would resolve against the page instead.
                  entry: resolvePath(basePath, manifest.script.entry),
                  abi: manifest.script.abi ?? 'blink/1',
                  events: manifest.script.events ?? [],
              }
            : null,
        outputs,
        requirements: mapRequirements(manifest.requirements),
        fallbacks: manifest.fallbacks ?? {},
        compatibility: manifest.compatibility ? mapCompatibility(manifest.compatibility) : null,
        diagnostics: mapDiagnostics(manifest.diagnostics),
    };
}
