import type { SizeExpr } from './sizeExpression';
import type { BlinkSourceRef } from './sourceRef';

/**
 * Internal, backend-neutral effect representation.
 *
 * All effect loaders (BlinkFX, ISF, SSF) normalise into this shape so the
 * runtime sees one structure regardless of source format. The IR carries
 * no engine-specific types and no ExoJS imports; it is pure data.
 *
 * Shader payloads can be expressed either as a relative `path` (loaded
 * lazily by the runtime) or as inline `source` (when the loader already
 * has the source string in memory — e.g. the legacy scene adapter). Both
 * fields may be null on the unused side; at least one must be non-null
 * for the entry to be usable at activation time.
 */
export interface BlinkEffectIR {
    readonly format: 'blinkfx-ir/1';
    readonly metadata: BlinkEffectMetadata;
    readonly kind: BlinkEffectKind;
    readonly controls: readonly BlinkControlSpec[];
    readonly hostInputs: readonly BlinkHostInputSpec[];
    readonly assets: readonly BlinkAssetSpec[];
    readonly renderTargets: readonly BlinkRenderTargetSpec[];
    readonly passes: readonly BlinkPassSpec[];
    readonly shaders: BlinkShaderMap;
    readonly presets: readonly BlinkPresetRef[];
    readonly script: BlinkScriptSpec | null;
    readonly outputs: BlinkOutputSpec;
    readonly requirements: BlinkRequirements;
    /** Per-feature permission to degrade. A feature absent here may not be degraded at all. */
    readonly fallbacks: Readonly<Record<string, BlinkFallbackStrategy>>;
    readonly compatibility: BlinkCompatibilityInfo | null;
    readonly diagnostics: readonly Diagnostic[];
    /**
     * Root every package-relative path stays inside. Shader `#include` resolution is confined to
     * it; absent for effects that carry only inline shader source.
     */
    readonly packageRoot?: string;
}

/**
 * Visual role of the effect in a host graph.
 *
 * Metadata only: it never introduces uniforms and never changes rendering.
 */
export type BlinkEffectKind = 'generator' | 'filter' | 'transition';

/** Host-provided data or resource an effect declares it wants bound. */
export interface BlinkHostInputSpec {
    readonly name: string;
    readonly type: BlinkHostInputType;
    readonly required: boolean;
    /** Bin/sample count for audio inputs; null lets the host choose. */
    readonly samples: number | null;
    readonly representation: BlinkHostInputRepresentation | null;
    readonly sampling?: BlinkSampling;
}

export type BlinkHostInputType = 'image' | 'audio' | 'audioFFT' | 'audioTexture' | 'pointer' | 'keyboard';

export type BlinkHostInputRepresentation = 'spectrum-waveform';

/**
 * Provenance of a converted package, for diagnostics and auditing.
 *
 * Never consulted to decide runtime behavior: that follows the compatibility
 * profile and the actual package contents.
 */
export interface BlinkCompatibilityInfo {
    readonly source: BlinkCompatibilitySource | null;
    readonly profile: string | null;
    readonly mode: 'preserve' | 'native' | null;
    readonly converter: string | null;
    /** Per-control source metadata keyed by control name; empty when the source format has none. */
    readonly controls: Readonly<Record<string, object>>;
    /** Uniforms a compatibility script writes, by name and GLSL type; empty when there are none. */
    readonly scriptUniforms: Readonly<Record<string, string>>;
}

export interface BlinkCompatibilitySource {
    readonly format: string;
    readonly version: string | null;
}

/**
 * One entry of a package's tooling-only diagnostics block.
 *
 * The value is deliberately opaque: the manifest block is a free-form object
 * whose keys converters and test harnesses agree on among themselves, and
 * nothing in the render path may depend on it. Keeping entries as key/value
 * pairs preserves the block losslessly without freezing a taxonomy the spec
 * does not define.
 */
export interface Diagnostic {
    readonly key: string;
    readonly value: unknown;
}

export interface BlinkEffectMetadata {
    readonly id: string;
    readonly title: string;
    readonly version: string | null;
    readonly author: string | null;
    readonly description: string | null;
    readonly license: string | null;
    readonly thumbnail: string | null;
    readonly tags: readonly string[];
}

export type BlinkControlSpec =
    | BlinkFloatControl
    | BlinkIntControl
    | BlinkBoolControl
    | BlinkColorControl
    | BlinkEnumControl
    | BlinkPoint2DControl
    | BlinkBangControl;

export interface BlinkControlBase {
    readonly name: string;
    readonly label: string | null;
    readonly description: string | null;
    readonly group: string | null;
}

export interface BlinkFloatControl extends BlinkControlBase {
    readonly type: 'float';
    readonly default: number;
    readonly min: number | null;
    readonly max: number | null;
    readonly step: number | null;
}

export interface BlinkIntControl extends BlinkControlBase {
    readonly type: 'int';
    readonly default: number;
    readonly min: number | null;
    readonly max: number | null;
    readonly step: number | null;
}

export interface BlinkBoolControl extends BlinkControlBase {
    readonly type: 'bool';
    readonly default: boolean;
}

export interface BlinkColorControl extends BlinkControlBase {
    readonly type: 'color';
    readonly default: readonly [number, number, number, number];
}

export interface BlinkEnumControl extends BlinkControlBase {
    readonly type: 'enum';
    readonly default: string;
    readonly options: readonly string[];
}

export interface BlinkPoint2DControl extends BlinkControlBase {
    readonly type: 'point2d';
    readonly default: readonly [number, number];
    readonly min: readonly [number, number] | null;
    readonly max: readonly [number, number] | null;
}

export interface BlinkBangControl extends BlinkControlBase {
    readonly type: 'bang';
}

export interface BlinkAssetSpec {
    readonly name: string;
    readonly type: 'texture2d';
    readonly path: string;
    readonly sampling: BlinkSampling;
}

export interface BlinkSampling {
    readonly filter: 'nearest' | 'linear' | 'mipmap';
    readonly wrap: 'clamp' | 'repeat' | 'mirror';
}

/** A render-target dimension: a fixed pixel count or a parsed size expression. */
export type BlinkDimension = number | SizeExpr;

export interface BlinkRenderTargetSpec {
    readonly name: string;
    readonly width: BlinkDimension | null;
    readonly height: BlinkDimension | null;
    readonly scale: number | null;
    readonly format: 'rgba8' | 'rgba16f' | 'rgba32f';
    readonly persistent: boolean;
    readonly sampling?: BlinkSampling;
}

export interface BlinkPassInputSpec {
    readonly source: BlinkSourceRef;
    readonly uniform: string;
}

export interface BlinkPassSpec {
    readonly name: string;
    readonly shader: string;
    readonly inputs: readonly BlinkPassInputSpec[];
    readonly target: BlinkPassTarget;
    readonly clear: boolean;
}

export type BlinkPassTarget = { readonly kind: 'screen' } | { readonly kind: 'renderTarget'; readonly name: string };

export interface BlinkShaderMap {
    readonly glsl: Readonly<Record<string, BlinkShaderEntry>>;
    readonly wgsl: Readonly<Record<string, BlinkShaderEntry>>;
}

/** Where one shader stage's text comes from: a path fetched lazily, or inline source. */
export interface BlinkShaderSource {
    readonly path: string | null;
    readonly source: string | null;
}

/**
 * A named program. `path`/`source` is the visual fragment stage (or the generator stage of an
 * `audio` entry); `vertex` replaces the runtime's fullscreen vertex stage when present.
 */
export interface BlinkShaderEntry extends BlinkShaderSource {
    readonly vertex: BlinkShaderSource | null;
    readonly stage: 'visual' | 'audio';
}

export interface BlinkPresetRef {
    readonly name: string;
    readonly path: string;
}

export interface BlinkOutputSpec {
    readonly visual: boolean;
    readonly audio: BlinkAudioOutputSpec | null;
}

export interface BlinkAudioOutputSpec {
    readonly shader: string;
    readonly abi: string;
    readonly channels: number;
    readonly sampleRate: number | 'device';
}

export interface BlinkRequirements {
    readonly features: readonly BlinkFeature[];
    readonly backends: readonly BlinkBackend[];
}

export type BlinkFeature =
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

export type BlinkBackend = 'webgl2' | 'webgpu';

export type BlinkFallbackStrategy = 'fail' | 'disable' | 'rgba8' | 'approximate';

export interface BlinkScriptSpec {
    readonly entry: string;
    /** Script ABI identifier; selects the runtime that executes the entry. */
    readonly abi: string;
    readonly events: readonly BlinkScriptEventBinding[];
}

export interface BlinkScriptEventBinding {
    readonly input: string;
    readonly on: BlinkScriptEvent;
    readonly handler: string;
}

export type BlinkScriptEvent = 'change' | 'offToOn' | 'onToOff' | 'whileOn' | 'whileOff';
