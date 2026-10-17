/**
 * The Shadertoy export model the converter reads: the JSON of `https://www.shadertoy.com/api`
 * (`{ "Shader": { "info": ..., "renderpass": [...] } }`), or a bare pasted Image source.
 */

export type ChannelType =
    | 'texture'
    | 'buffer'
    | 'keyboard'
    | 'music'
    | 'musicstream'
    | 'mic'
    | 'webcam'
    | 'video'
    | 'cubemap'
    | 'volume'
    | 'misc';

export interface ShadertoySampler {
    readonly filter?: 'nearest' | 'linear' | 'mipmap';
    readonly wrap?: 'clamp' | 'repeat';
    readonly vflip?: string | boolean;
}

export interface ShadertoyInput {
    readonly channel: number;
    readonly ctype: ChannelType | string;
    readonly src?: string;
    /** For a buffer channel, the output id of the buffer pass it reads. */
    readonly id?: number | string;
    readonly sampler?: ShadertoySampler;
}

export interface ShadertoyOutput {
    readonly channel: number;
    readonly id: number | string;
}

export type PassType = 'image' | 'buffer' | 'common' | 'sound' | 'cubemap';

export interface ShadertoyRenderPass {
    readonly type: PassType | string;
    readonly name?: string;
    readonly code: string;
    readonly inputs?: readonly ShadertoyInput[];
    readonly outputs?: readonly ShadertoyOutput[];
}

export interface ShadertoyInfo {
    readonly id?: string;
    readonly name?: string;
    readonly username?: string;
    readonly description?: string;
    readonly tags?: readonly string[];
    readonly license?: string;
}

export interface ShadertoyShader {
    readonly info?: ShadertoyInfo;
    readonly renderpass: readonly ShadertoyRenderPass[];
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accepts the API's wrapper, the shader object itself, or a one-element array of either. */
export function normalizeShadertoy(raw: unknown): ShadertoyShader | null {
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    if (!isRecord(candidate)) return null;
    const shader = isRecord(candidate.Shader) ? candidate.Shader : candidate;
    if (!Array.isArray(shader.renderpass)) return null;
    const passes = shader.renderpass.filter(isRecord).filter(pass => typeof pass.code === 'string');
    return {
        info: isRecord(shader.info) ? (shader.info as ShadertoyInfo) : undefined,
        renderpass: passes as unknown as ShadertoyRenderPass[],
    };
}
