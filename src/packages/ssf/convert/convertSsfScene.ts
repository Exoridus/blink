import type {
    BlinkFxAsset,
    BlinkFxControl,
    BlinkFxFeature,
    BlinkFxInput,
    BlinkFxManifest,
    BlinkFxPass,
    BlinkFxPassInput,
    BlinkFxRenderTarget,
    BlinkFxSampling,
} from '../../blinkfx/manifest';
import type { ConversionIssue, ConversionStatus, ConvertedPackage } from '../../convert/report';
import type { HelperBlock } from '../profile/helperLibrary';
import { SSF_CORE_PRELUDE, SSF_HELPER_BLOCKS, SSF_RESERVED_NAMES } from '../profile/helperLibrary';
import type { SsfControlSource } from './controls';
import { mapControls } from './controls';
import {
    adaptSsfDesktopGlsl,
    collectUniformDeclarations,
    floatifyIntegerLiterals,
    hoistGlobalInitializers,
    removeFragmentOutputs,
    removeUniformDeclarations,
    renameReservedWords,
    rewriteOneDimensionalSamplers,
    stripPreambleTokens,
    swizzleControl,
} from './glslAdapt';
import type { Token } from './glslText';
import { detokenize, findFunctions, identifiersUsed, replaceIdentifier, tokenize } from './glslText';
import { stripKodelifeBranches } from './hostConditionals';
import type { ScriptUniformType } from './scriptUniforms';
import { scanScriptUniforms } from './scriptUniforms';

/** One scene directory, read into memory. */
export interface SsfSceneSource {
    /** Directory name without the `.synScene` suffix. */
    readonly slug: string;
    readonly sceneJson: unknown;
    readonly mainGlsl: string;
    readonly scriptJs?: string;
    /** Every other file in the scene, by scene-relative path with forward slashes. */
    readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface ConvertOptions {
    /** Reverse-DNS prefix for the package id; the scene slug is appended. */
    readonly idPrefix?: string;
    readonly converterVersion?: string;
    /** Leaves the scene's script out, for checking the visual side of a scripted scene on its own. */
    readonly skipScript?: boolean;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const SPECTRUM_SAMPLERS = new Set(['syn_Spectrum', 'syn_LevelTrail']);
const POINTER_NAMES = ['_mouse', '_click', '_muv', '_muvc'];
const FINAL_BUFFER = 'syn_FinalBuffer';

const PRESENT_SHADER = `void main() {
  fragColor = texture(present_source, gl_FragCoord.xy / bl_resolution);
}
`;

/**
 * HARD/SMOOTH_TRANSITIONS name uniforms the host drives on song changes. Blink has no song
 * changes, so they become plain float controls at the value a scene starts with: the first of a
 * hard transition's values, and the first uniform of a smooth family switched on.
 */
function transitionControls(sceneJson: Json, taken: ReadonlySet<string>): BlinkFxControl[] {
    const controls: BlinkFxControl[] = [];
    const seen = new Set(taken);
    const add = (name: unknown, value: number): void => {
        if (typeof name !== 'string' || seen.has(name) || !/^[A-Za-z_]\w*$/.test(name)) return;
        seen.add(name);
        controls.push({ name, label: name.replaceAll('_', ' '), type: 'float', default: value, group: 'Transitions' });
    };
    for (const entry of Array.isArray(sceneJson.HARD_TRANSITIONS) ? sceneJson.HARD_TRANSITIONS : []) {
        if (!isRecord(entry)) continue;
        const values = Array.isArray(entry.VALUES) ? entry.VALUES : [];
        add(entry.UNIFORM, typeof values[0] === 'number' ? values[0] : 0);
    }
    for (const entry of Array.isArray(sceneJson.SMOOTH_TRANSITIONS) ? sceneJson.SMOOTH_TRANSITIONS : []) {
        if (!isRecord(entry) || !Array.isArray(entry.UNIFORMS)) continue;
        entry.UNIFORMS.forEach((name: unknown, index: number) => add(name, index === 0 ? 1 : 0));
    }
    return controls;
}

function slugify(text: string): string {
    const slug = text
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '_')
        .replaceAll(/^_+|_+$/g, '');
    return slug.length > 0 ? slug : 'scene';
}

function samplingOf(entry: Json, defaultFilter: 'linear' | 'mipmap' = 'linear'): BlinkFxSampling {
    const filter = typeof entry.FILTER === 'string' ? entry.FILTER.toLowerCase() : undefined;
    const wrap = typeof entry.WRAP === 'string' ? entry.WRAP.toLowerCase() : undefined;
    return {
        filter: filter === 'nearest' || filter === 'linear' || filter === 'mipmap' ? filter : defaultFilter,
        wrap: wrap === 'clamp' || wrap === 'mirror' ? wrap : 'repeat',
    };
}

function inlineIncludes(
    source: string,
    files: ReadonlyMap<string, Uint8Array>,
    issues: ConversionIssue[],
    seen: Set<string>,
    depth = 0
): string {
    return source.replaceAll(/^[ \t]*#include\s+["<]([^">]+)[">][^\n]*$/gm, (line, path: string) => {
        const normalized = path.replace(/^\.\//, '');
        const bytes = files.get(normalized);
        if (bytes === undefined) {
            issues.push({
                severity: 'error',
                code: 'include-unresolved',
                message: `#include "${path}" is not part of the scene (a Synesthesia built-in library)`,
            });
            return `// ${line.trim()}  (unresolved)`;
        }
        if (seen.has(normalized) || depth > 16) {
            return '';
        }
        seen.add(normalized);
        return inlineIncludes(new TextDecoder().decode(bytes), files, issues, seen, depth + 1);
    });
}

/** Picks the library blocks a scene needs, dependencies first. */
function selectHelpers(
    used: ReadonlySet<string>,
    defined: ReadonlySet<string>,
    issues: ConversionIssue[]
): { code: string; samplers: Set<string> } {
    const byName = new Map<string, HelperBlock>();
    for (const block of SSF_HELPER_BLOCKS) {
        for (const name of block.provides) byName.set(name, block);
    }

    const emitted = new Set<HelperBlock>();
    const ordered: HelperBlock[] = [];
    const visit = (block: HelperBlock): void => {
        if (emitted.has(block)) return;
        emitted.add(block);
        for (const required of block.requires ?? []) {
            const dependency = byName.get(required);
            if (dependency !== undefined) visit(dependency);
        }
        ordered.push(block);
    };

    for (const name of used) {
        const block = byName.get(name);
        if (block === undefined) continue;
        if (block.provides.some(provided => defined.has(provided))) {
            issues.push({
                severity: 'info',
                code: 'helper-overridden',
                message: `the scene defines ${block.provides.filter(provided => defined.has(provided)).join(', ')} itself; the library version is not injected`,
            });
            continue;
        }
        visit(block);
    }

    const unqualified = ordered.filter(block => block.nativeArithmetic !== true);
    if (unqualified.length > 0)
        issues.push({
            severity: 'warning',
            code: 'helper-native-parity-unverified',
            message: `Injected helpers ${unqualified.flatMap(block => block.provides).join(', ')} have no qualified native template arithmetic`,
        });
    const samplers = new Set<string>();
    for (const block of ordered) {
        for (const sampler of block.samplers ?? []) samplers.add(sampler);
    }
    return { code: ordered.map(block => block.code).join('\n\n'), samplers };
}

interface Collector {
    readonly issues: ConversionIssue[];
    readonly features: Set<string>;
}

interface PreparedShader {
    readonly body: string;
    readonly helperCode: string;
    readonly globalAssignments: readonly string[];
    readonly used: ReadonlySet<string>;
    readonly helperSamplers: ReadonlySet<string>;
    /** Uniforms a script writes, by name, whether the shader declares them or the converter does. */
    readonly scriptUniforms: ReadonlyMap<string, string>;
}

interface Resources {
    readonly usesFinalPass: boolean;
    readonly usesSpectrum: boolean;
    readonly usesLevelTrail: boolean;
    readonly usesMedia: boolean;
    readonly usesUserImage: boolean;
    readonly usesPointer: boolean;
}

interface ControlStage {
    readonly controls: BlinkFxControl[];
    readonly sources: Record<string, SsfControlSource>;
    readonly colorNames: readonly string[];
}

function convertControls(sceneJson: Json, collector: Collector): ControlStage {
    const reserved = new Set<string>([
        ...SSF_RESERVED_NAMES,
        'bl_time',
        'bl_deltaTime',
        'bl_frame',
        'bl_resolution',
        'bl_pass',
    ]);
    const mapped = mapControls(sceneJson.CONTROLS, reserved);
    collector.issues.push(...mapped.issues);
    const controls = [
        ...mapped.controls,
        ...transitionControls(sceneJson, new Set(mapped.controls.map(control => control.name))),
    ];
    if (controls.length > 0) collector.features.add('controls');

    for (const [name, source] of Object.entries(mapped.sources)) {
        for (const modifier of source.modifiers) collector.features.add(`control-${modifier}`);
        if (source.type.startsWith('bang')) collector.features.add('control-bang');
        if (source.modifiers.includes('traveler')) {
            collector.issues.push({
                severity: 'warning',
                code: 'control-traveler',
                message: `control "${name}" uses the undocumented "traveler" modifier; it is treated as plain`,
            });
        }
    }
    return { controls, sources: mapped.sources, colorNames: mapped.colorNames };
}

/** Adapts the scene's GLSL for ES 3.00 and picks the library helpers it needs. */
function prepareShader(
    scene: SsfSceneSource,
    ownSamplers: ReadonlySet<string>,
    controlNames: ReadonlySet<string>,
    colorNames: readonly string[],
    collector: Collector,
    skipScript: boolean
): PreparedShader {
    const resolvedSource = inlineIncludes(scene.mainGlsl, scene.files, collector.issues, new Set());
    if (resolvedSource !== scene.mainGlsl) collector.features.add('include');

    const tokens: Token[] = stripPreambleTokens(tokenize(stripKodelifeBranches(resolvedSource)));
    removeUniformDeclarations(tokens, ownSamplers);
    renameReservedWords(tokens);
    replaceIdentifier(tokens, 'gl_FragColor', 'fragColor');
    replaceIdentifier(tokens, 'texture2D', 'texture');
    rewriteOneDimensionalSamplers(tokens, SPECTRUM_SAMPLERS);
    for (const name of colorNames) swizzleControl(tokens, name, '.rgb');
    removeFragmentOutputs(tokens);
    if (adaptSsfDesktopGlsl(tokens) > 0) collector.features.add('desktop-glsl-adaptation');
    if (floatifyIntegerLiterals(tokens) > 0) collector.features.add('literal-adaptation');
    const used = identifiersUsed(tokens);
    const globalAssignments = hoistGlobalInitializers(tokens);
    const defined = new Set(
        findFunctions(tokens)
            .filter(fn => fn.bodyStart !== -1)
            .map(fn => fn.name)
    );
    if (!defined.has('renderMain')) {
        collector.issues.push({
            severity: 'error',
            code: 'entry-missing',
            message: 'the shader defines no renderMain()',
        });
    }
    const helpers = selectHelpers(used, defined, collector.issues);

    // Uniforms the scene declares itself keep their declaration; the ones only its script writes
    // get one here, typed from how the script writes them.
    const scriptUniforms = new Map<string, string>(collectUniformDeclarations(tokens));
    for (const name of controlNames) scriptUniforms.delete(name);
    const declarations: string[] = [];
    if (scene.scriptJs !== undefined && !skipScript) {
        const scan = scanScriptUniforms(scene.scriptJs);
        const missing = (name: string): boolean =>
            used.has(name) && !defined.has(name) && !controlNames.has(name) && !scriptUniforms.has(name);
        const declare = (name: string, type: ScriptUniformType): void => {
            scriptUniforms.set(name, type);
            declarations.push(`uniform ${type} ${name};`);
        };
        for (const name of scan.unresolved) {
            if (missing(name))
                collector.issues.push({
                    severity: 'warning',
                    code: 'script-uniform-type-unresolved',
                    message: `script output "${name}" has an unresolved shape; its inferred scalar declaration may require an explicit shader uniform type`,
                });
        }
        for (const [name, type] of scan.named) {
            if (missing(name)) declare(name, type);
        }
        for (const prefix of scan.prefixes) {
            for (const name of used) {
                if (name.startsWith(prefix) && missing(name)) declare(name, 'float');
            }
        }
    }
    const helperCode = [...declarations, helpers.code].join('\n');
    return {
        body: detokenize(tokens),
        helperCode,
        globalAssignments,
        used,
        helperSamplers: helpers.samplers,
        scriptUniforms,
    };
}

function detectResources(shader: PreparedShader, collector: Collector): Resources {
    const { used, helperSamplers } = shader;
    const resources: Resources = {
        usesFinalPass: used.has('syn_FinalPass'),
        usesSpectrum: used.has('syn_Spectrum'),
        usesLevelTrail: used.has('syn_LevelTrail'),
        usesMedia: used.has('syn_Media') || helperSamplers.has('syn_Media'),
        usesUserImage: used.has('syn_UserImage') || helperSamplers.has('syn_UserImage'),
        usesPointer: POINTER_NAMES.some(name => used.has(name)),
    };
    if (resources.usesFinalPass) collector.features.add('final-pass-feedback');
    if (resources.usesSpectrum || resources.usesLevelTrail) collector.features.add('audio-textures');
    if (resources.usesMedia || resources.usesUserImage) collector.features.add('media');
    if (resources.usesMedia)
        collector.issues.push({
            severity: 'warning',
            code: 'media-processing-unavailable',
            message:
                'syn_Media requires a host-provided processed media view; the native media transform and color producer are not implemented',
        });
    if (resources.usesPointer) collector.features.add('pointer');
    return resources;
}

function mediaSettingsOf(sceneJson: Json): Json {
    if (Array.isArray(sceneJson.MEDIA)) return sceneJson.MEDIA.find(isRecord) ?? {};
    return isRecord(sceneJson.MEDIA) ? sceneJson.MEDIA : {};
}

function hostInputsFor(resources: Resources, sceneJson: Json): BlinkFxInput[] {
    const sampling = samplingOf(mediaSettingsOf(sceneJson));
    const inputs: BlinkFxInput[] = [];
    if (resources.usesMedia) inputs.push({ name: 'syn_Media', type: 'image', required: false, sampling });
    if (resources.usesUserImage) inputs.push({ name: 'syn_UserImage', type: 'image', required: false, sampling });
    if (resources.usesPointer) inputs.push({ name: 'pointer', type: 'pointer' });
    return inputs;
}

function collectAssets(
    images: readonly Json[],
    scene: SsfSceneSource,
    files: Map<string, string | Uint8Array>,
    collector: Collector
): BlinkFxAsset[] {
    const assets: BlinkFxAsset[] = [];
    for (const image of images) {
        const name = image.NAME as string;
        const rawPath = (image.PATH as string).replace(/^\.\//, '');
        const bytes = scene.files.get(rawPath) ?? scene.files.get(`images/${rawPath}`);
        if (bytes === undefined) {
            collector.issues.push({
                severity: 'error',
                code: 'image-missing',
                message: `image "${name}" (${rawPath}) is not in the scene`,
            });
            continue;
        }
        const target = `assets/${rawPath.split('/').pop() ?? rawPath}`;
        files.set(target, bytes);
        assets.push({ name, type: 'texture2d', path: target, sampling: samplingOf(image, 'mipmap') });
    }
    if (images.length > 0) collector.features.add('images');
    return assets;
}

function renderTargetOf(target: Json, name: string, collector: Collector): BlinkFxRenderTarget {
    const width = typeof target.WIDTH === 'number' && target.WIDTH >= 2 ? target.WIDTH : undefined;
    const height = typeof target.HEIGHT === 'number' && target.HEIGHT >= 2 ? target.HEIGHT : undefined;
    const format: 'rgba8' | 'rgba32f' = target.FLOAT === false ? 'rgba8' : 'rgba32f';
    if (format === 'rgba32f') collector.features.add('float-targets');
    collector.features.add('target-sampling');
    if (target.DOUBLE_BUFFER !== true) {
        collector.issues.push({
            severity: 'warning',
            code: 'native-single-buffer-adapted',
            message: `buffer "${name}" uses safe pingpong instead of native single-buffer storage; native same-target sampling is undefined feedback`,
        });
    }
    return {
        name,
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
        format,
        sampling: samplingOf(target),
        persistent: true,
    };
}

interface PassStage {
    readonly passes: BlinkFxPass[];
    readonly shaders: Record<string, string>;
    readonly extraFiles: ReadonlyMap<string, string>;
}

function buildPasses(
    targets: readonly Json[],
    targetNames: readonly string[],
    assets: readonly BlinkFxAsset[],
    shader: PreparedShader,
    resources: Resources,
    collector: Collector
): PassStage {
    const renderTargets = targets.map((target, index) => renderTargetOf(target, targetNames[index], collector));
    if (targets.length > 0) collector.features.add('passes');

    const inputsFor = (passIndex: number, finalName: string | null): BlinkFxPassInput[] => {
        const inputs: BlinkFxPassInput[] = [];
        targetNames.forEach((name, index) => {
            if (!shader.used.has(name)) return;
            // A buffer earlier in the chain is this frame's result; itself or a later one is what the
            // previous frame left behind, which is what a feedback read of it means.
            inputs.push({ source: index < passIndex ? `target.${name}` : `target.${name}.previous`, uniform: name });
        });
        for (const asset of assets) {
            if (shader.used.has(asset.name)) inputs.push({ source: `asset.${asset.name}`, uniform: asset.name });
        }
        if (resources.usesSpectrum) inputs.push({ source: 'blink.audio.spectrum', uniform: 'syn_Spectrum' });
        if (resources.usesLevelTrail) inputs.push({ source: 'blink.audio.levelTrail', uniform: 'syn_LevelTrail' });
        if (resources.usesMedia) inputs.push({ source: 'input.syn_Media', uniform: 'syn_Media' });
        if (resources.usesUserImage) inputs.push({ source: 'input.syn_UserImage', uniform: 'syn_UserImage' });
        if (finalName !== null) inputs.push({ source: `target.${finalName}.previous`, uniform: 'syn_FinalPass' });
        return inputs;
    };

    const finalName = resources.usesFinalPass ? FINAL_BUFFER : null;
    const passes: BlinkFxPass[] = renderTargets.map((target, index) => ({
        name: targetNames[index],
        shader: 'main',
        inputs: inputsFor(index, finalName),
        target,
        clear: false,
    }));
    const shaders: Record<string, string> = { main: 'shaders/main.frag.glsl' };
    const extraFiles = new Map<string, string>();

    if (resources.usesFinalPass) {
        collector.issues.push({
            severity: 'warning',
            code: 'native-final-pass-feedback-adapted',
            message:
                'syn_FinalPass uses safe previous-frame history instead of native same-target binding; sampling during the native final draw is undefined feedback',
        });
        // The final pass feeds `syn_FinalPass` next frame, so it renders into a persistent buffer
        // and a plain copy puts that on screen.
        const finalTarget: BlinkFxRenderTarget = { name: FINAL_BUFFER, format: 'rgba8', persistent: true };
        passes.push({
            name: 'main',
            shader: 'main',
            inputs: inputsFor(targets.length, FINAL_BUFFER),
            target: finalTarget,
            clear: true,
        });
        passes.push({
            name: 'present',
            shader: 'present',
            inputs: [{ source: `target.${FINAL_BUFFER}`, uniform: 'present_source' }],
            target: 'screen',
            clear: true,
        });
        shaders.present = 'shaders/present.frag.glsl';
        extraFiles.set('shaders/present.frag.glsl', PRESENT_SHADER);
    } else {
        passes.push({
            name: targets.length > 0 ? 'final' : 'main',
            shader: 'main',
            inputs: inputsFor(targets.length, null),
            target: 'screen',
            clear: true,
        });
    }
    return { passes, shaders, extraFiles };
}

function assembleShader(shader: PreparedShader, usesPointer: boolean): string {
    const pointerSetup = usesPointer
        ? `
  vec2 pointerPosition = bl_pointerPosition;
  _mouse = vec4(bl_pointerDown > 0.5 ? pointerPosition : vec2(0.0), bl_pointerDown > 0.5 ? bl_pointerPressOrigin : -bl_pointerPressOrigin);
  _click = bl_pointerButtons;
  _muv = pointerPosition / RENDERSIZE;
  _muvc = (_muv - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);`
        : '';
    const mainWrapper = `
void main(void) {
  _xy = gl_FragCoord.xy;
  _uv = _xy / RENDERSIZE;
  _uvc = _xy / RENDERSIZE.y - vec2(RENDERSIZE.x / RENDERSIZE.y / 2.0, 0.5);${pointerSetup}
${shader.globalAssignments.map(assignment => `  ${assignment}`).join('\n')}
  fragColor = renderMain();
}
`;
    return [
        '// Generated by the BlinkFX SSF converter (profile ssf/1). Scene source follows the helper block.',
        'precision highp int;',
        SSF_CORE_PRELUDE,
        shader.helperCode,
        '// ---- scene main.glsl ----',
        shader.body,
        mainWrapper,
    ].join('\n');
}

function thumbnailOf(
    sceneJson: Json,
    scene: SsfSceneSource,
    files: Map<string, string | Uint8Array>
): string | undefined {
    const path = typeof sceneJson.IMAGE_PATH === 'string' ? sceneJson.IMAGE_PATH : undefined;
    const bytes = path === undefined ? undefined : scene.files.get(path);
    if (path === undefined || bytes === undefined) return undefined;
    const name = `thumbnail.${path.split('.').pop()?.toLowerCase() ?? 'png'}`;
    files.set(name, bytes);
    return name;
}

function noteSourceFeatures(sceneJson: Json, shader: PreparedShader, collector: Collector): void {
    const sampledResources: ReadonlyArray<readonly [string, readonly Json[]]> = [
        ['MEDIA', [mediaSettingsOf(sceneJson)]],
        ['IMAGES', Array.isArray(sceneJson.IMAGES) ? sceneJson.IMAGES.filter(isRecord) : []],
        ['PASSES', Array.isArray(sceneJson.PASSES) ? sceneJson.PASSES.filter(isRecord) : []],
    ];
    for (const [group, entries] of sampledResources) {
        for (const [index, entry] of entries.entries()) {
            if (typeof entry.WRAP === 'string' && entry.WRAP.toLowerCase() === 'border') {
                collector.issues.push({
                    severity: 'error',
                    code: 'texture-wrap-unsupported',
                    message: `${group}[${index}] requests border sampling, which BlinkFX v1 does not support`,
                });
            }
        }
    }
    if (Array.isArray(sceneJson.CUBEMAPS) && sceneJson.CUBEMAPS.length > 0)
        collector.issues.push({
            severity: 'error',
            code: 'native-cubemaps-unmapped',
            message: 'Native CUBEMAPS bindings require cubemap resources, which BlinkFX v1 does not support',
        });
    if (Array.isArray(sceneJson.HARD_TRANSITIONS) || Array.isArray(sceneJson.SMOOTH_TRANSITIONS)) {
        collector.features.add('transitions');
        collector.issues.push({
            severity: 'info',
            code: 'transitions-ignored',
            message: 'HARD/SMOOTH_TRANSITIONS fire on song changes, which Blink has no equivalent of',
        });
    }
    if ([...shader.used].some(name => name.startsWith('syn_'))) {
        collector.issues.push({
            severity: 'info',
            code: 'audio-original-qualified-profile',
            message:
                'syn_* audio uses the original PCM reconstruction with scoped native numeric fixtures; portable FFT and full scene pixel parity remain qualified',
        });
    }
}

function statusOf(collector: Collector, shader: PreparedShader): ConversionStatus {
    if (collector.issues.some(issue => issue.severity === 'error')) return 'failed';
    const approximate =
        collector.issues.some(issue => issue.severity === 'warning') ||
        collector.features.has('script') ||
        [...shader.used].some(name => name.startsWith('syn_'));
    return approximate ? 'approximate' : 'complete';
}

function optionalText(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

interface ManifestParts {
    readonly scene: SsfSceneSource;
    readonly sceneJson: Json;
    readonly options: ConvertOptions;
    readonly controlStage: ControlStage;
    readonly passStage: PassStage;
    readonly assets: readonly BlinkFxAsset[];
    readonly inputs: readonly BlinkFxInput[];
    readonly script: BlinkFxManifest['script'];
    readonly thumbnail: string | undefined;
    readonly scriptUniforms: ReadonlyMap<string, string>;
}

function buildManifest(parts: ManifestParts): BlinkFxManifest {
    const { scene, sceneJson, options, controlStage, passStage, assets, inputs, script, thumbnail, scriptUniforms } =
        parts;
    const requiredFeatures: BlinkFxFeature[] = script === undefined ? [] : ['script:ssf/1'];
    // The script reads the last final output synchronously, which this runtime cannot do yet.
    if (script !== undefined && (scene.scriptJs ?? '').includes('textureFinalPass'))
        requiredFeatures.push('sync-final-pass-readback');
    const author = optionalText(sceneJson.CREDIT);
    const description = optionalText(sceneJson.DESCRIPTION);
    return {
        format: 'blinkfx/1',
        id: `${options.idPrefix ?? 'com.codexo.ssf'}.${slugify(scene.slug)}`,
        title: optionalText(sceneJson.TITLE) ?? scene.slug,
        ...(author === undefined ? {} : { author }),
        ...(description === undefined ? {} : { description }),
        ...(thumbnail === undefined ? {} : { thumbnail }),
        tags: Array.isArray(sceneJson.TAGS)
            ? sceneJson.TAGS.filter((tag): tag is string => typeof tag === 'string')
            : [],
        kind: 'generator',
        ...(controlStage.controls.length > 0 ? { controls: controlStage.controls } : {}),
        ...(inputs.length > 0 ? { inputs: [...inputs] } : {}),
        ...(assets.length > 0 ? { assets: [...assets] } : {}),
        passes: passStage.passes,
        shaders: { glsl: passStage.shaders },
        ...(script === undefined ? {} : { script }),
        ...(requiredFeatures.length > 0 ? { requirements: { features: requiredFeatures } } : {}),
        compatibility: {
            source: { format: 'ssf', version: '2.0' },
            profile: 'ssf/1',
            mode: 'preserve',
            converter: `blinkfx-ssf-converter/${options.converterVersion ?? '1'}`,
            ...(Object.keys(controlStage.sources).length > 0 ? { controls: controlStage.sources } : {}),
            ...(scriptUniforms.size > 0 ? { scriptUniforms: Object.fromEntries(scriptUniforms) } : {}),
        },
    };
}

/**
 * Converts one Synesthesia scene into a self-contained BlinkFX package that keeps the scene's
 * own shader and script and declares the `ssf/1` compatibility profile.
 *
 * The converter never needs Synesthesia at runtime: everything the scene relies on is either in
 * the package (images, includes, the helper functions it uses) or provided by the profile.
 */
export function convertSsfScene(scene: SsfSceneSource, options: ConvertOptions = {}): ConvertedPackage {
    const collector: Collector = { issues: [], features: new Set<string>() };
    const sceneJson: Json = isRecord(scene.sceneJson) ? scene.sceneJson : {};
    if (!isRecord(scene.sceneJson)) {
        collector.issues.push({
            severity: 'error',
            code: 'scene-json-invalid',
            message: 'scene.json is not an object',
        });
    }

    const controlStage = convertControls(sceneJson, collector);

    const targets = Array.isArray(sceneJson.PASSES) ? sceneJson.PASSES.filter(isRecord) : [];
    const targetNames = targets.map((target, index) => optionalText(target.TARGET) ?? `pass${index}`);
    const images = (Array.isArray(sceneJson.IMAGES) ? sceneJson.IMAGES : [])
        .filter(isRecord)
        .filter(entry => typeof entry.NAME === 'string' && typeof entry.PATH === 'string');

    // Samplers the package declares itself; a scene that re-declares one would collide.
    const ownSamplers = new Set<string>([
        ...targetNames,
        ...images.map(image => image.NAME as string),
        'syn_FinalPass',
        'syn_Media',
        'syn_UserImage',
        'syn_Spectrum',
        'syn_LevelTrail',
    ]);
    const shader = prepareShader(
        scene,
        ownSamplers,
        new Set(controlStage.controls.map(control => control.name)),
        controlStage.colorNames,
        collector,
        options.skipScript === true
    );
    const resources = detectResources(shader, collector);

    const files = new Map<string, string | Uint8Array>();
    const assets = collectAssets(images, scene, files, collector);
    const passStage = buildPasses(targets, targetNames, assets, shader, resources, collector);
    for (const [path, content] of passStage.extraFiles) files.set(path, content);
    files.set('shaders/main.frag.glsl', assembleShader(shader, resources.usesPointer));
    files.set('source/main.glsl', scene.mainGlsl);
    files.set(
        'source/scene.json',
        [...scene.files].find(([path]) => path.toLowerCase() === 'scene.json')?.[1] ??
            `${JSON.stringify(scene.sceneJson, null, 2)}\n`
    );

    let script: BlinkFxManifest['script'];
    if (scene.scriptJs !== undefined && scene.scriptJs.trim().length > 0 && options.skipScript !== true) {
        files.set('script.js', scene.scriptJs);
        script = { entry: 'script.js', abi: 'ssf/1' };
        collector.features.add('script');
    }
    const thumbnail = thumbnailOf(sceneJson, scene, files);
    noteSourceFeatures(sceneJson, shader, collector);

    const manifest = buildManifest({
        scene,
        sceneJson,
        options,
        controlStage,
        passStage,
        assets,
        inputs: hostInputsFor(resources, sceneJson),
        script,
        thumbnail,
        scriptUniforms: shader.scriptUniforms,
    });
    files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

    return {
        manifest,
        files,
        report: {
            slug: scene.slug,
            status: statusOf(collector, shader),
            issues: collector.issues,
            features: [...collector.features].sort(),
        },
    };
}
