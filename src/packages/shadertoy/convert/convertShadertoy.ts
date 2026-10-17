import type {
    BlinkFxAsset,
    BlinkFxInput,
    BlinkFxManifest,
    BlinkFxPass,
    BlinkFxRenderTarget,
    BlinkFxSampling,
} from '../../blinkfx/manifest';
import type { ConversionIssue, ConversionStatus, ConvertedPackage } from '../../convert/report';
import { renameReservedWords } from '../../ssf/convert/glslAdapt';
import { detokenize, identifiersUsed, replaceIdentifier, tokenize } from '../../ssf/convert/glslText';
import { SHADERTOY_PROFILE_ID } from '../profile/ShadertoyProfile';
import type { ShadertoyInfo, ShadertoyInput, ShadertoyRenderPass } from './model';
import { normalizeShadertoy } from './model';

export interface ShadertoySceneSource {
    /** Directory or file name without extension. */
    readonly slug: string;
    /** The API JSON; leave out when only `imageCode` is available. */
    readonly json?: unknown;
    /** A pasted Image source, for a shader with no API metadata. */
    readonly imageCode?: string;
    /** Texture files an input may point at, by `src` path or by file name. */
    readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface ShadertoyConvertOptions {
    readonly idPrefix?: string;
    readonly converterVersion?: string;
    /** Shadertoy's API carries no license; supplying one clears the warning. */
    readonly license?: string;
}

const CHANNELS = [0, 1, 2, 3] as const;

const PRELUDE = `#define iResolution vec3(bl_resolution, 1.0)
#define iTime bl_time
#define iTimeDelta bl_deltaTime
#define iFrame bl_frame
#define iFrameRate (1.0 / max(bl_deltaTime, 0.0001))
#define iSampleRate 44100.0

vec4 iMouse;
float iChannelTime[4];
vec3 iChannelResolution[4];
`;

const PRESENT_NAME = 'image';

interface ChannelBinding {
    readonly source: string;
    readonly uniform: string;
}

interface Collector {
    readonly issues: ConversionIssue[];
    readonly features: Set<string>;
}

interface Resources {
    readonly assets: BlinkFxAsset[];
    readonly hostInputs: Map<string, BlinkFxInput>;
    readonly files: Map<string, string | Uint8Array>;
}

interface BufferPass {
    readonly key: string;
    readonly pass: ShadertoyRenderPass;
}

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '_')
        .replaceAll(/^_+|_+$/g, '');
    return slug === '' ? 'shader' : slug;
}

function samplingOf(input: ShadertoyInput): BlinkFxSampling {
    const { filter, wrap } = input.sampler ?? {};
    return {
        filter: filter === 'nearest' || filter === 'mipmap' ? filter : 'linear',
        wrap: wrap === 'repeat' ? 'repeat' : 'clamp',
    };
}

/** Buffers run in the order A, B, C, D; the output id links a buffer channel to its pass. */
function orderBuffers(passes: readonly ShadertoyRenderPass[]): BufferPass[] {
    const buffers = passes.filter(pass => pass.type === 'buffer');
    const letter = (pass: ShadertoyRenderPass, index: number): string =>
        /buffer\s*([a-d])/i.exec(pass.name ?? '')?.[1]?.toLowerCase() ?? String.fromCodePoint(97 + index);
    return buffers
        .map((pass, index) => ({ key: `buffer_${letter(pass, index)}`, pass }))
        .sort((a, b) => a.key.localeCompare(b.key));
}

function assetFor(input: ShadertoyInput, resources: Resources, collector: Collector): string | null {
    const src = input.src ?? '';
    const bytes = resources.files.get(src) ?? resources.files.get(src.split('/').pop() ?? src);
    const sampling = samplingOf(input);
    const existing = resources.assets.find(
        asset =>
            asset.path.endsWith(src.split('/').pop() ?? '') &&
            JSON.stringify(asset.sampling) === JSON.stringify(sampling)
    );
    if (existing !== undefined) return existing.name;
    if (bytes === undefined) {
        collector.issues.push({
            severity: 'error',
            code: 'asset-unresolved',
            message: `channel ${input.channel} reads "${src}", which is not among the supplied files`,
        });
        return null;
    }
    const name = `tex${resources.assets.length}`;
    const path = `assets/${src.split('/').pop() ?? name}`;
    resources.files.set(path, bytes);
    resources.assets.push({ name, type: 'texture2d', path, sampling });
    collector.features.add('textures');
    return name;
}

function requireHostInput(resources: Resources, input: BlinkFxInput): string {
    if (!resources.hostInputs.has(input.name)) resources.hostInputs.set(input.name, input);
    return `input.${input.name}`;
}

/** The pass source a channel reads, or null (with an issue) when the channel cannot be represented. */
function sourceFor(
    input: ShadertoyInput,
    passOrder: number,
    buffers: readonly BufferPass[],
    resources: Resources,
    collector: Collector
): string | null {
    switch (input.ctype) {
        case 'texture':
        case 'misc': {
            const name = assetFor(input, resources, collector);
            return name === null ? null : `asset.${name}`;
        }
        case 'buffer': {
            const index = buffers.findIndex(buffer =>
                (buffer.pass.outputs ?? []).some(output => String(output.id) === String(input.id))
            );
            if (index === -1) {
                collector.issues.push({
                    severity: 'error',
                    code: 'buffer-unresolved',
                    message: `channel ${input.channel} reads a buffer (${String(input.id)}) that no pass produces`,
                });
                return null;
            }
            // An earlier buffer is this frame's result; the pass's own and later ones are the previous frame's.
            return index < passOrder ? `target.${buffers[index].key}` : `target.${buffers[index].key}.previous`;
        }
        case 'keyboard':
            collector.features.add('keyboard');
            return requireHostInput(resources, { name: 'keyboard', type: 'keyboard' });
        case 'music':
        case 'musicstream':
        case 'mic':
            collector.features.add('audio-texture');
            return requireHostInput(resources, {
                name: 'audio',
                type: 'audioTexture',
                samples: 512,
                representation: 'spectrum-waveform',
            });
        case 'webcam':
        case 'video':
            collector.features.add('image-input');
            return requireHostInput(resources, { name: String(input.ctype), type: 'image', required: false });
        default:
            collector.issues.push({
                severity: 'error',
                code: `channel-${String(input.ctype)}-unsupported`,
                message: `channel ${input.channel} is a ${String(input.ctype)}, which BlinkFX has no resource type for`,
            });
            return null;
    }
}

function channelInputs(
    pass: ShadertoyRenderPass,
    passOrder: number,
    buffers: readonly BufferPass[],
    resources: Resources,
    collector: Collector
): ChannelBinding[] {
    const inputs: ChannelBinding[] = [];
    for (const input of pass.inputs ?? []) {
        const source = sourceFor(input, passOrder, buffers, resources, collector);
        if (source !== null) inputs.push({ source, uniform: `iChannel${input.channel}` });
    }
    return inputs;
}

function adaptSource(code: string): string {
    const tokens = tokenize(code);
    renameReservedWords(tokens);
    replaceIdentifier(tokens, 'texture2D', 'texture');
    replaceIdentifier(tokens, 'textureLod2D', 'textureLod');
    return detokenize(tokens);
}

interface ImageShader {
    readonly text: string;
    readonly usesMouse: boolean;
}

function assembleVisualShader(
    common: string,
    code: string,
    boundChannels: ReadonlySet<number>,
    declaredElsewhere: ReadonlySet<string>
): ImageShader {
    const body = adaptSource(code);
    const used = identifiersUsed(tokenize(`${common}\n${body}`));
    const usesMouse = used.has('iMouse');

    // A channel the shader reads but this pass does not bind still has to exist to compile; one
    // another pass binds is already declared for every pass.
    const orphanDeclarations = CHANNELS.filter(
        channel =>
            used.has(`iChannel${channel}`) &&
            !boundChannels.has(channel) &&
            !declaredElsewhere.has(`iChannel${channel}`)
    ).map(channel => `uniform sampler2D iChannel${channel};`);

    const mouse = usesMouse
        ? `  bool pressed = any(notEqual(bl_pointerPressOrigin, vec2(0.0)));
  iMouse = vec4(pressed ? bl_pointerPosition : vec2(0.0), bl_pointerDown > 0.5 ? bl_pointerPressOrigin : -bl_pointerPressOrigin);`
        : '';
    const resolutions = CHANNELS.filter(
        channel =>
            boundChannels.has(channel) || declaredElsewhere.has(`iChannel${channel}`) || used.has(`iChannel${channel}`)
    )
        .map(channel => `  iChannelResolution[${channel}] = vec3(textureSize(iChannel${channel}, 0), 1.0);`)
        .join('\n');

    const text = [
        '// Generated by the BlinkFX Shadertoy converter (profile shadertoy/1).',
        PRELUDE,
        ...orphanDeclarations,
        adaptSource(common),
        body,
        `void main() {
  vec4 shadertoyColor = vec4(0.0, 0.0, 0.0, 1.0);
${mouse}
${resolutions}
  mainImage(shadertoyColor, gl_FragCoord.xy);
  fragColor = shadertoyColor;
}
`,
    ].join('\n');
    return { text, usesMouse };
}

interface Plan {
    readonly passes: BlinkFxPass[];
    readonly shaders: Record<string, string>;
    readonly files: Map<string, string | Uint8Array>;
    readonly usesPointer: boolean;
}

function buildVisualPlan(
    buffers: readonly BufferPass[],
    image: ShadertoyRenderPass | undefined,
    common: string,
    resources: Resources,
    collector: Collector
): Plan {
    const bufferTarget = (key: string): BlinkFxRenderTarget => ({ name: key, format: 'rgba32f', persistent: true });
    const entries: Array<{ key: string; pass: ShadertoyRenderPass; target: BlinkFxRenderTarget | 'screen' }> = [
        ...buffers.map(buffer => ({ key: buffer.key, pass: buffer.pass, target: bufferTarget(buffer.key) })),
        ...(image === undefined ? [] : [{ key: PRESENT_NAME, pass: image, target: 'screen' as const }]),
    ];
    if (buffers.length > 0) collector.features.add('buffers');
    if (buffers.length > 0) collector.features.add('float-targets');

    const passInputs = entries.map((entry, order) => channelInputs(entry.pass, order, buffers, resources, collector));
    const declaredElsewhere = new Set(passInputs.flat().map(input => input.uniform));

    const shaders: Record<string, string> = {};
    const files = new Map<string, string | Uint8Array>();
    let usesPointer = false;
    const passes: BlinkFxPass[] = entries.map((entry, order) => {
        const bound = new Set(passInputs[order].map(input => Number(input.uniform.replace('iChannel', ''))));
        const shader = assembleVisualShader(common, entry.pass.code, bound, declaredElsewhere);
        usesPointer ||= shader.usesMouse;
        shaders[entry.key] = `shaders/${entry.key}.frag.glsl`;
        files.set(`shaders/${entry.key}.frag.glsl`, shader.text);
        return {
            name: entry.key,
            shader: entry.key,
            inputs: passInputs[order],
            target: entry.target,
            clear: entry.target === 'screen',
        };
    });
    return { passes, shaders, files, usesPointer };
}

function soundShader(common: string, code: string): string {
    return [
        '// Generated by the BlinkFX Shadertoy converter (profile shadertoy/1).',
        '#define iSampleRate bl_audioSampleRate',
        adaptSource(common),
        adaptSource(code),
        '',
    ].join('\n');
}

function statusOf(issues: readonly ConversionIssue[]): ConversionStatus {
    if (issues.some(issue => issue.severity === 'error')) return 'failed';
    return issues.some(issue => issue.severity === 'warning') ? 'approximate' : 'complete';
}

interface Parts {
    readonly passes: readonly ShadertoyRenderPass[];
    readonly info: ShadertoyInfo | undefined;
    readonly common: string;
    readonly image: ShadertoyRenderPass | undefined;
    readonly sound: ShadertoyRenderPass | undefined;
}

/** Reads the model and checks it has something to run; problems become issues, never exceptions. */
function readParts(scene: ShadertoySceneSource, collector: Collector): Parts {
    const model =
        scene.json === undefined
            ? {
                  info: undefined,
                  renderpass: scene.imageCode === undefined ? [] : [{ type: 'image', code: scene.imageCode }],
              }
            : normalizeShadertoy(scene.json);
    if (model === null || model.renderpass.length === 0) {
        collector.issues.push({
            severity: 'error',
            code: 'model-invalid',
            message: 'no render passes were found in the shader',
        });
    }
    const passes = model?.renderpass ?? [];

    for (const pass of passes.filter(candidate => candidate.type === 'cubemap')) {
        collector.issues.push({
            severity: 'error',
            code: 'cubemap-pass-unsupported',
            message: `pass "${pass.name ?? 'cubemap'}" renders a cube map, which BlinkFX has no resource type for`,
        });
    }
    const image = passes.find(pass => pass.type === 'image');
    const sound = passes.find(pass => pass.type === 'sound');
    if (image === undefined && sound === undefined && collector.issues.length === 0) {
        collector.issues.push({
            severity: 'error',
            code: 'no-output-pass',
            message: 'the shader has neither an Image nor a Sound pass',
        });
    }
    return {
        passes,
        info: model?.info,
        common: passes
            .filter(pass => pass.type === 'common')
            .map(pass => pass.code)
            .join('\n'),
        image,
        sound,
    };
}

interface SoundOutput {
    readonly shaderEntry: { audio: string };
    readonly outputs: NonNullable<BlinkFxManifest['outputs']>;
    readonly requirements: NonNullable<BlinkFxManifest['requirements']>;
}

function soundOutput(imagePresent: boolean): SoundOutput {
    return {
        shaderEntry: { audio: 'shaders/sound.glsl' },
        outputs: {
            visual: imagePresent,
            audio: { shader: 'sound', abi: 'shadertoy-sound/1', channels: 2, sampleRate: 'device' },
        },
        requirements: { features: ['audio-generation'] },
    };
}

interface ManifestParts {
    readonly scene: ShadertoySceneSource;
    readonly options: ShadertoyConvertOptions;
    readonly info: ShadertoyInfo | undefined;
    readonly license: string | undefined;
    readonly hostInputs: readonly BlinkFxInput[];
    readonly resources: Resources;
    readonly plan: Plan;
    readonly glsl: Record<string, string | { audio: string }>;
    readonly audio: SoundOutput | undefined;
}

function buildManifest(parts: ManifestParts): BlinkFxManifest {
    const { scene, options, info, license, hostInputs, resources, plan, glsl, audio } = parts;
    return {
        format: 'blinkfx/1',
        id: `${options.idPrefix ?? 'com.codexo.shadertoy'}.${slugify(info?.id ?? scene.slug)}`,
        title: info?.name ?? scene.slug,
        ...(info?.username === undefined ? {} : { author: info.username }),
        ...(info?.description === undefined ? {} : { description: info.description }),
        ...(license === undefined ? {} : { license }),
        tags: [...(info?.tags ?? [])],
        kind: 'generator',
        ...(hostInputs.length > 0 ? { inputs: [...hostInputs] } : {}),
        ...(resources.assets.length > 0 ? { assets: resources.assets } : {}),
        ...(plan.passes.length > 0 ? { passes: plan.passes } : {}),
        shaders: { glsl },
        ...(audio === undefined ? {} : { outputs: audio.outputs, requirements: audio.requirements }),
        compatibility: {
            source: { format: 'shadertoy', version: '1' },
            profile: SHADERTOY_PROFILE_ID,
            mode: 'preserve',
            converter: `blinkfx-shadertoy-converter/${options.converterVersion ?? '1'}`,
        },
        ...(info?.id === undefined
            ? {}
            : { diagnostics: { shadertoy: { id: info.id, url: `https://www.shadertoy.com/view/${info.id}` } } }),
    };
}

/**
 * Converts one Shadertoy shader into a self-contained BlinkFX package that keeps its source and
 * declares the `shadertoy/1` profile.
 *
 * Common code is placed ahead of every pass. Each buffer is a persistent float target; a
 * channel that reads a buffer is bound to this frame's result when the buffer runs earlier and to
 * the previous frame's otherwise, which is what Shadertoy's double buffering means. Channels the
 * format cannot represent (cube maps, volumes) fail the conversion instead of being approximated.
 */
export function convertShadertoy(scene: ShadertoySceneSource, options: ShadertoyConvertOptions = {}): ConvertedPackage {
    const collector: Collector = { issues: [], features: new Set<string>() };
    const { passes, info, common, image, sound } = readParts(scene, collector);

    const resources: Resources = { assets: [], hostInputs: new Map(), files: new Map(scene.files) };
    const plan = buildVisualPlan(orderBuffers(passes), image, common, resources, collector);
    const files = new Map<string, string | Uint8Array>(plan.files);
    for (const asset of resources.assets) files.set(asset.path, resources.files.get(asset.path) ?? new Uint8Array());

    const hostInputs = [...resources.hostInputs.values()];
    if (plan.usesPointer) hostInputs.push({ name: 'pointer', type: 'pointer' });

    const glsl: Record<string, string | { audio: string }> = { ...plan.shaders };
    const audio = sound === undefined ? undefined : soundOutput(image !== undefined);
    if (sound !== undefined && audio !== undefined) {
        files.set('shaders/sound.glsl', soundShader(common, sound.code));
        glsl.sound = audio.shaderEntry;
        collector.features.add('sound');
    }

    const license = options.license ?? info?.license;
    if (license === undefined) {
        collector.issues.push({
            severity: 'warning',
            code: 'license-unknown',
            message: 'the shader carries no license information',
        });
    }
    files.set('source/shader.json', JSON.stringify(scene.json ?? { renderpass: passes }, null, 2));

    const manifest = buildManifest({ scene, options, info, license, hostInputs, resources, plan, glsl, audio });
    files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

    return {
        manifest,
        files,
        report: {
            slug: scene.slug,
            status: statusOf(collector.issues),
            issues: collector.issues,
            features: [...collector.features].sort(),
        },
    };
}
