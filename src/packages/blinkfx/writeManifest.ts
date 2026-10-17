import { formatSizeExpression } from '../../runtime/ir/sizeExpression';
import { formatSourceRef } from '../../runtime/ir/sourceRef';
import type {
    BlinkAssetSpec,
    BlinkCompatibilityInfo,
    BlinkControlSpec,
    BlinkDimension,
    BlinkEffectIR,
    BlinkEffectMetadata,
    BlinkHostInputSpec,
    BlinkPassSpec,
    BlinkRenderTargetSpec,
    BlinkShaderEntry,
} from '../../runtime/ir/types';
import type {
    BlinkFxAsset,
    BlinkFxCompatibility,
    BlinkFxControl,
    BlinkFxGlslShader,
    BlinkFxInput,
    BlinkFxManifest,
    BlinkFxPass,
    BlinkFxRenderTarget,
} from './manifest';

export class ManifestWriteError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'ManifestWriteError';
    }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Strips the package root the loader prefixed onto a path; the manifest stores package-relative paths. */
function makeRelativizer(root: string | undefined): (path: string, what: string) => string {
    return (path, what) => {
        if (root === undefined) {
            throw new ManifestWriteError(`${what}: the effect has no package root to make "${path}" relative to`);
        }
        const prefix = root.endsWith('/') ? root : `${root}/`;
        if (!path.startsWith(prefix)) {
            throw new ManifestWriteError(`${what}: "${path}" is not inside the package root "${root}"`);
        }
        return path.slice(prefix.length);
    };
}

type Relativize = ReturnType<typeof makeRelativizer>;

function writeShader(entry: BlinkShaderEntry, name: string, relative: Relativize): BlinkFxGlslShader {
    const where = `shader "${name}"`;
    if (entry.path === null) {
        throw new ManifestWriteError(`${where}: inline shader source has no package path`);
    }
    const fragment = relative(entry.path, where);
    if (entry.stage === 'audio') {
        return { audio: fragment };
    }
    if (entry.vertex === null) {
        return fragment;
    }
    if (entry.vertex.path === null) {
        throw new ManifestWriteError(`${where}: inline vertex source has no package path`);
    }
    return { fragment, vertex: relative(entry.vertex.path, `${where} vertex`) };
}

function writeShaderSet(
    entries: Readonly<Record<string, BlinkShaderEntry>>,
    relative: Relativize
): Record<string, BlinkFxGlslShader> | undefined {
    const names = Object.keys(entries);
    if (names.length === 0) {
        return undefined;
    }
    const set: Record<string, BlinkFxGlslShader> = {};
    for (const name of names) {
        set[name] = writeShader(entries[name], name, relative);
    }
    return set;
}

function writeControl(c: BlinkControlSpec): BlinkFxControl {
    const base: { name: string; label?: string; description?: string; group?: string } = { name: c.name };
    if (c.label !== null) base.label = c.label;
    if (c.description !== null) base.description = c.description;
    if (c.group !== null) base.group = c.group;

    switch (c.type) {
        case 'float':
        case 'int': {
            const control: Mutable<Extract<BlinkFxControl, { type: 'float' | 'int' }>> = {
                ...base,
                type: c.type,
                default: c.default,
            };
            if (c.min !== null) control.min = c.min;
            if (c.max !== null) control.max = c.max;
            if (c.step !== null) control.step = c.step;
            return control;
        }
        case 'bool':
            return { ...base, type: 'bool', default: c.default };
        case 'color':
            return { ...base, type: 'color', default: c.default };
        case 'enum':
            return { ...base, type: 'enum', default: c.default, options: c.options };
        case 'point2d': {
            const control: Mutable<Extract<BlinkFxControl, { type: 'point2d' }>> = {
                ...base,
                type: 'point2d',
                default: c.default,
            };
            if (c.min !== null) control.min = c.min;
            if (c.max !== null) control.max = c.max;
            return control;
        }
        case 'bang':
            return { ...base, type: 'bang' };
    }
}

function writeHostInput(i: BlinkHostInputSpec): BlinkFxInput {
    const input: Mutable<BlinkFxInput> = { name: i.name, type: i.type, required: i.required };
    if (i.samples !== null) input.samples = i.samples;
    if (i.representation !== null) input.representation = i.representation;
    return input;
}

function writeAsset(a: BlinkAssetSpec, relative: Relativize): BlinkFxAsset {
    return {
        name: a.name,
        type: a.type,
        path: relative(a.path, `asset "${a.name}"`),
        sampling: { filter: a.sampling.filter, wrap: a.sampling.wrap },
    };
}

function writeDimension(value: BlinkDimension): number | string {
    return typeof value === 'number' ? value : formatSizeExpression(value);
}

function writeRenderTarget(target: BlinkRenderTargetSpec): BlinkFxRenderTarget {
    const out: Mutable<BlinkFxRenderTarget> = { name: target.name };
    if (target.width !== null) out.width = writeDimension(target.width);
    if (target.height !== null) out.height = writeDimension(target.height);
    if (target.scale !== null) out.scale = target.scale;
    out.format = target.format;
    out.persistent = target.persistent;
    return out;
}

function writePass(pass: BlinkPassSpec, targets: ReadonlyMap<string, BlinkRenderTargetSpec>): BlinkFxPass {
    let target: BlinkFxPass['target'] = 'screen';
    if (pass.target.kind === 'renderTarget') {
        const spec = targets.get(pass.target.name);
        if (spec === undefined) {
            throw new ManifestWriteError(`pass "${pass.name}": target "${pass.target.name}" is not declared`);
        }
        target = writeRenderTarget(spec);
    }
    return {
        name: pass.name,
        shader: pass.shader,
        inputs: pass.inputs.map(input => ({ source: formatSourceRef(input.source), uniform: input.uniform })),
        target,
        clear: pass.clear,
    };
}

function writeCompatibility(c: BlinkCompatibilityInfo): BlinkFxCompatibility {
    const out: Mutable<BlinkFxCompatibility> = {};
    if (c.source !== null) {
        out.source =
            c.source.version === null
                ? { format: c.source.format }
                : { format: c.source.format, version: c.source.version };
    }
    if (c.profile !== null) out.profile = c.profile;
    if (c.mode !== null) out.mode = c.mode;
    if (c.converter !== null) out.converter = c.converter;
    if (Object.keys(c.controls).length > 0) out.controls = c.controls;
    if (Object.keys(c.scriptUniforms).length > 0) out.scriptUniforms = c.scriptUniforms;
    return out;
}

function writeMetadata(manifest: Mutable<BlinkFxManifest>, metadata: BlinkEffectMetadata): void {
    if (metadata.version !== null) manifest.version = metadata.version;
    if (metadata.author !== null) manifest.author = metadata.author;
    if (metadata.description !== null) manifest.description = metadata.description;
    if (metadata.license !== null) manifest.license = metadata.license;
    if (metadata.thumbnail !== null) manifest.thumbnail = metadata.thumbnail;
    if (metadata.tags.length > 0) manifest.tags = metadata.tags;
}

/**
 * Writes an effect back as a `blinkfx/1` manifest in normalized form: every default the loader
 * fills in is spelled out, the shader and pass-input shorthands are expanded, and optional
 * fields that hold no information are omitted. Loading the result yields an IR equal to `ir`,
 * and writing that IR again yields the same manifest.
 *
 * Throws `ManifestWriteError` for an effect a manifest cannot express: shader source held inline
 * rather than at a package path, or a path outside the package root.
 */
export function writeBlinkFxManifest(ir: BlinkEffectIR): BlinkFxManifest {
    const relative = makeRelativizer(ir.packageRoot);
    const targets = new Map(ir.renderTargets.map(target => [target.name, target]));

    const glsl = writeShaderSet(ir.shaders.glsl, relative);
    const wgsl = writeShaderSet(ir.shaders.wgsl, relative);
    if (wgsl !== undefined) {
        for (const [name, shader] of Object.entries(wgsl)) {
            if (typeof shader !== 'string') {
                throw new ManifestWriteError(`shader "${name}": a wgsl program is a bare fragment path`);
            }
        }
    }

    const manifest: Mutable<BlinkFxManifest> = {
        format: 'blinkfx/1',
        id: ir.metadata.id,
        title: ir.metadata.title,
        kind: ir.kind,
        shaders: {
            ...(glsl === undefined ? {} : { glsl }),
            ...(wgsl === undefined ? {} : { wgsl: wgsl as Record<string, string> }),
        },
    };
    writeMetadata(manifest, ir.metadata);
    if (ir.controls.length > 0) manifest.controls = ir.controls.map(writeControl);
    if (ir.hostInputs.length > 0) manifest.inputs = ir.hostInputs.map(writeHostInput);
    if (ir.assets.length > 0) manifest.assets = ir.assets.map(asset => writeAsset(asset, relative));
    if (ir.passes.length > 0) manifest.passes = ir.passes.map(pass => writePass(pass, targets));
    if (ir.presets.length > 0) {
        manifest.presets = ir.presets.map(preset => ({
            name: preset.name,
            path: relative(preset.path, `preset "${preset.name}"`),
        }));
    }
    if (ir.script !== null) {
        manifest.script = { entry: relative(ir.script.entry, 'script'), abi: ir.script.abi, events: ir.script.events };
    }
    manifest.outputs = {
        visual: ir.outputs.visual,
        ...(ir.outputs.audio === null ? {} : { audio: ir.outputs.audio }),
    };
    if (ir.requirements.features.length > 0 || ir.requirements.backends.length > 0) {
        manifest.requirements = { features: ir.requirements.features, backends: ir.requirements.backends };
    }
    if (Object.keys(ir.fallbacks).length > 0) manifest.fallbacks = ir.fallbacks;
    if (ir.compatibility !== null) manifest.compatibility = writeCompatibility(ir.compatibility);
    if (ir.diagnostics.length > 0) {
        manifest.diagnostics = Object.fromEntries(ir.diagnostics.map(entry => [entry.key, entry.value]));
    }
    return manifest;
}
