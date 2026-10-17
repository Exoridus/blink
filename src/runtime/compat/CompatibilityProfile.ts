import type { UniformValue } from '@codexo/exojs';

import type { BlinkAudioFrame } from '../audio/BlinkAudioFrame';
import type { BlinkEffectIR } from '../ir/types';

/** What a profile instance is given at the start of every frame. */
export interface ProfileFrame {
    readonly audio: BlinkAudioFrame;
    readonly deltaTime: number;
    /** Whether any image input of the effect currently has a producer bound. */
    readonly mediaActive: boolean;
}

/**
 * One effect's running compatibility layer.
 *
 * A profile is how a converted package keeps the vocabulary of its source format (uniform names,
 * control behavior) without the renderer knowing that format: the package declares the profile
 * id, and this layer supplies the values the source format's shaders expect.
 */
export interface CompatibilityProfileInstance {
    /** Encoding of shader RGB at the final screen pass; intermediate attachments stay untouched. */
    readonly screenColor?: 'linear' | 'encoded';
    /** Whether shader image inputs retain encoded straight samples or use managed color upload. */
    readonly assetColor?: 'managed' | 'raw';
    /** Keeps the generic Blink analyzers running although the profile also consumes PCM. */
    readonly needsGenericAnalysis?: boolean;
    /** Optional continuous mono source at the profile's declared sample rate. */
    processPcm?(block: {
        readonly samples: Float32Array;
        readonly sampleRate: number;
        readonly firstSample: number;
        readonly sourceEpoch: number;
    }): void;
    audioSurface?(name: 'spectrum' | 'levelTrail'): UniformValue;
    dispose?(): void;
    /** GLSL declared ahead of the pass samplers, typically the profile's scalar uniforms. */
    readonly prelude: string;
    /** The profile's uniforms with neutral values, so each material's schema can declare them. */
    neutralUniforms(): Record<string, UniformValue>;
    /** Advances the profile's own state and returns this frame's scalar uniforms. */
    update(frame: ProfileFrame): Record<string, UniformValue>;
    /** Clears processing history for a control after its raw default is restored. */
    resetControl?(name: string): void;
    /**
     * Maps the raw control values to what the shader reads, for source formats whose controls
     * carry behavior (smoothing, accumulation). Raw values stay untouched for scripts and presets.
     */
    processControls(raw: Readonly<Record<string, UniformValue>>, deltaTime: number): Record<string, UniformValue>;
}

export interface CompatibilityProfile {
    readonly id: string;
    create(effect: BlinkEffectIR): CompatibilityProfileInstance;
}

/** Looks a package's declared profile up; an undeclared or unknown one means "native". */
export class CompatibilityRegistry {
    private readonly profiles = new Map<string, CompatibilityProfile>();

    public register(profile: CompatibilityProfile): this {
        this.profiles.set(profile.id, profile);
        return this;
    }

    /** `substitute` may replace the declared profile id, for example to switch the audio analysis. */
    public resolve(
        effect: BlinkEffectIR,
        substitute?: (declared: string) => string
    ): CompatibilityProfileInstance | null {
        const declared = effect.compatibility?.profile;
        const id = declared === null || declared === undefined ? declared : (substitute?.(declared) ?? declared);
        if (id === null || id === undefined) {
            return null;
        }
        return this.profiles.get(id)?.create(effect) ?? null;
    }
}
