export interface BlinkFxManifest {
    readonly format: 'blinkfx/1';
    readonly id: string;
    readonly title: string;
    readonly version?: string;
    readonly kind?: BlinkFxKind;
    readonly author?: string;
    readonly description?: string;
    readonly license?: string;
    readonly thumbnail?: string;
    readonly tags?: readonly string[];
    readonly controls?: readonly BlinkFxControl[];
    readonly inputs?: readonly BlinkFxInput[];
    readonly assets?: readonly BlinkFxAsset[];
    readonly passes?: readonly BlinkFxPass[];
    readonly shaders: BlinkFxShaderSet;
    readonly presets?: readonly BlinkFxPreset[];
    readonly script?: BlinkFxScript;
    readonly outputs?: BlinkFxOutputs;
    readonly requirements?: BlinkFxRequirements;
    readonly fallbacks?: BlinkFxFallbacks;
    readonly compatibility?: BlinkFxCompatibility;
    readonly diagnostics?: Record<string, unknown>;
}

/**
 * Visual role of the effect in a host graph.
 *
 * Metadata only: it never introduces uniforms and never changes rendering.
 * The values an effect actually consumes stay explicit in `inputs`/`controls`.
 */
export type BlinkFxKind = 'generator' | 'filter' | 'transition';

/**
 * Provenance of a converted package, for diagnostics, auditing and
 * re-conversion. Runtime behavior follows the referenced compatibility
 * profile and the actual package contents, never this block alone.
 */
export interface BlinkFxCompatibility {
    readonly source?: BlinkFxCompatibilitySource;
    readonly profile?: string;
    readonly mode?: 'preserve' | 'native';
    readonly converter?: string;
    /**
     * Per-control source metadata keyed by control name, for compatibility profiles that reproduce
     * behavior the native control type cannot carry (smoothing, accumulation, dropdown values).
     */
    readonly controls?: Readonly<Record<string, object>>;
    /**
     * Uniforms a compatibility script writes, by name and GLSL type, so a host can declare them
     * before the script first runs. Scalar and vector floats only.
     */
    readonly scriptUniforms?: Readonly<Record<string, string>>;
}

export interface BlinkFxCompatibilitySource {
    readonly format: string;
    readonly version?: string;
}

export type BlinkFxControl =
    | BlinkFxFloatControl
    | BlinkFxIntControl
    | BlinkFxBoolControl
    | BlinkFxColorControl
    | BlinkFxEnumControl
    | BlinkFxPoint2DControl
    | BlinkFxBangControl;

export interface BlinkFxControlBase {
    readonly name: string;
    readonly label?: string;
    readonly description?: string;
    readonly group?: string;
}

export interface BlinkFxFloatControl extends BlinkFxControlBase {
    readonly type: 'float';
    readonly default: number;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
}

export interface BlinkFxIntControl extends BlinkFxControlBase {
    readonly type: 'int';
    readonly default: number;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
}

export interface BlinkFxBoolControl extends BlinkFxControlBase {
    readonly type: 'bool';
    readonly default: boolean;
}

export interface BlinkFxColorControl extends BlinkFxControlBase {
    readonly type: 'color';
    readonly default: readonly [number, number, number, number];
}

export interface BlinkFxEnumControl extends BlinkFxControlBase {
    readonly type: 'enum';
    readonly default: string;
    readonly options: readonly string[];
}

export interface BlinkFxPoint2DControl extends BlinkFxControlBase {
    readonly type: 'point2d';
    readonly default: readonly [number, number];
    readonly min?: readonly [number, number];
    readonly max?: readonly [number, number];
}

export interface BlinkFxBangControl extends BlinkFxControlBase {
    readonly type: 'bang';
}

export type BlinkFxInputType = 'image' | 'audio' | 'audioFFT' | 'audioTexture' | 'pointer' | 'keyboard';

export interface BlinkFxInput {
    readonly name: string;
    readonly type: BlinkFxInputType;
    readonly required?: boolean;
    readonly samples?: number;
    readonly representation?: 'spectrum-waveform';
    /** Sampling for an image input; absent preserves the host texture's settings. */
    readonly sampling?: BlinkFxSampling;
}

export interface BlinkFxAsset {
    readonly name: string;
    readonly type: 'texture2d';
    readonly path: string;
    readonly sampling?: BlinkFxSampling;
}

export interface BlinkFxSampling {
    readonly filter?: 'nearest' | 'linear' | 'mipmap';
    readonly wrap?: 'clamp' | 'repeat' | 'mirror';
}

export type BlinkFxPassTarget = 'screen' | BlinkFxRenderTarget;

export type BlinkFxPassInput =
    | string
    | {
          readonly source: string;
          readonly uniform: string;
      };

export interface BlinkFxPass {
    readonly name: string;
    readonly shader: string;
    readonly inputs?: readonly BlinkFxPassInput[];
    readonly target?: BlinkFxPassTarget;
    readonly clear?: boolean;
}

export interface BlinkFxRenderTarget {
    readonly name: string;
    /** Pixels, or a size expression such as `"$WIDTH / 2"`. */
    readonly width?: number | string;
    readonly height?: number | string;
    readonly scale?: number;
    readonly format?: 'rgba8' | 'rgba16f' | 'rgba32f';
    readonly persistent?: boolean;
    /** Absent preserves the backend's render-texture sampling defaults. */
    readonly sampling?: BlinkFxSampling;
}

/**
 * A named GLSL program: a bare path is a fragment stage with the runtime's fullscreen vertex
 * stage, `fragment` plus `vertex` supplies both, and `audio` marks a program for the
 * audio-output path rather than a visual pass.
 */
export type BlinkFxGlslShader =
    string | { readonly fragment: string; readonly vertex?: string } | { readonly audio: string };

export interface BlinkFxShaderSet {
    readonly glsl?: string | Readonly<Record<string, BlinkFxGlslShader>>;
    readonly wgsl?: string | Readonly<Record<string, string>>;
}

export interface BlinkFxPreset {
    readonly name: string;
    readonly path: string;
}

/**
 * What the package produces. Absent means a visual-only effect.
 *
 * `visual: false` suppresses the implicit main pass an otherwise pass-less package would get, so
 * an audio-only package does not silently acquire a screen pass it never declared.
 */
export interface BlinkFxOutputs {
    readonly visual?: boolean;
    readonly audio?: BlinkFxAudioOutput;
}

export interface BlinkFxAudioOutput {
    readonly shader: string;
    readonly abi?: string;
    readonly channels?: number;
    /** Sample rate in Hz, or `"device"` to follow the output device. */
    readonly sampleRate?: number | 'device';
}

/**
 * What the package needs from the runtime.
 *
 * An absent block does not mean "nothing": the runtime still infers requirements from what the
 * manifest actually uses. Declaring them makes the check explicit and lets a package fail on a
 * capability it needs but never visibly exercises until a specific frame.
 */
export interface BlinkFxRequirements {
    readonly features?: readonly BlinkFxFeature[];
    readonly backends?: readonly BlinkFxBackend[];
}

export type BlinkFxFeature =
    | 'float-targets'
    | 'persistent-feedback'
    | 'dynamic-target-size'
    | 'external-image-inputs'
    | 'pointer-input'
    | 'keyboard-input'
    | 'audio-waveform-input'
    | 'audio-fft-input'
    | 'audio-texture-input'
    | 'audio-generation'
    | 'audio-spectrum'
    | 'audio-level-trail'
    | 'script:blink/1'
    | 'script:ssf/1'
    | 'sync-final-pass-readback';

export type BlinkFxBackend = 'webgl2' | 'webgpu';

/**
 * What the package permits the runtime to do when a requirement is missing, keyed by feature.
 *
 * The absence of an entry is `fail`: a degradation the package did not ask for never happens
 * silently, because the package author is the only one who knows whether the effect still means
 * anything without the feature.
 */
export type BlinkFxFallbacks = Readonly<Record<string, BlinkFxFallbackStrategy>>;

export type BlinkFxFallbackStrategy = 'fail' | 'disable' | 'rgba8' | 'approximate';

export interface BlinkFxScript {
    readonly entry: string;
    /** Script ABI identifier, versioned independently of the package format. */
    readonly abi?: string;
    readonly events?: readonly BlinkFxScriptEventBinding[];
}

export interface BlinkFxScriptEventBinding {
    readonly input: string;
    readonly on: 'change' | 'offToOn' | 'onToOff' | 'whileOn' | 'whileOff';
    readonly handler: string;
}
