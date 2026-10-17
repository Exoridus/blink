import type { BlinkBackend, BlinkDimension, BlinkEffectIR, BlinkFallbackStrategy, BlinkFeature } from '../ir/types';
import type { BlinkColorFormat } from '../render/textureFormat';

/** What the running backend can actually do, as probed by the host. */
export interface BackendCapabilities {
    readonly backend: BlinkBackend;
    readonly features: ReadonlySet<BlinkFeature>;
}

export type CapabilityStatus = 'available' | 'disabled' | 'downgraded' | 'failed';

/**
 * `backend` is not a feature but the whole-backend requirement: a package may demand webgpu, and
 * that failure has no single feature to hang off.
 */
export type CapabilityRequirement = BlinkFeature | 'backend';

export interface CapabilityOutcome {
    readonly feature: CapabilityRequirement;
    readonly status: CapabilityStatus;
    /** Why the feature was required: declared in the manifest, or inferred from what it uses. */
    readonly source: 'declared' | 'inferred';
    /** The permitted degradation that produced a `disabled` or `downgraded` status. */
    readonly strategy: BlinkFallbackStrategy | null;
    /** Set for `failed`; a sentence naming the feature and why nothing rescued it. */
    readonly reason: string | null;
}

export interface CapabilityResolution {
    readonly outcomes: readonly CapabilityOutcome[];
    readonly failures: readonly CapabilityOutcome[];
    /** Features the package allowed to be switched off; the runtime must not act on them. */
    readonly disabled: ReadonlySet<BlinkFeature>;
    /** Whether an unsupported float render target may fall back to rgba8. */
    readonly allowFloatDowngrade: boolean;
}

const FLOAT_FORMATS: ReadonlySet<BlinkColorFormat> = new Set<BlinkColorFormat>(['rgba16f', 'rgba32f']);

const HOST_INPUT_FEATURES = new Map<string, BlinkFeature>([
    ['image', 'external-image-inputs'],
    ['audio', 'audio-waveform-input'],
    ['audioFFT', 'audio-fft-input'],
    ['audioTexture', 'audio-texture-input'],
    ['pointer', 'pointer-input'],
    ['keyboard', 'keyboard-input'],
]);

function hasSizeExpression(dimension: BlinkDimension | null): boolean {
    return dimension !== null && typeof dimension !== 'number';
}

/**
 * Which features the package needs without having said so.
 *
 * An absent `requirements` block does not mean "nothing required": the spec's strict inferred set
 * is what the manifest actually uses. A package that never declares `float-targets` but asks for
 * an rgba32f target still needs float targets, and must fail on a backend without them rather
 * than render at eight bits.
 */
function inferFeatures(effect: BlinkEffectIR): Map<BlinkFeature, 'inferred'> {
    const inferred = new Map<BlinkFeature, 'inferred'>();

    for (const target of effect.renderTargets) {
        if (FLOAT_FORMATS.has(target.format)) {
            inferred.set('float-targets', 'inferred');
        }
        if (target.persistent) {
            inferred.set('persistent-feedback', 'inferred');
        }
        if (hasSizeExpression(target.width) || hasSizeExpression(target.height)) {
            inferred.set('dynamic-target-size', 'inferred');
        }
    }

    for (const pass of effect.passes) {
        for (const input of pass.inputs) {
            if (input.source.kind !== 'blinkAudio') {
                continue;
            }
            inferred.set(input.source.surface === 'spectrum' ? 'audio-spectrum' : 'audio-level-trail', 'inferred');
        }
    }

    for (const input of effect.hostInputs) {
        const feature = HOST_INPUT_FEATURES.get(input.type);
        if (feature !== undefined) {
            inferred.set(feature, 'inferred');
        }
    }

    if (effect.script !== null) {
        inferred.set(scriptFeature(effect.script.abi), 'inferred');
    }

    if (effect.outputs.audio !== null) {
        inferred.set('audio-generation', 'inferred');
    }

    return inferred;
}

/**
 * A script ABI maps onto its own feature, so a package needing `ssf/1` fails on a runtime that
 * only has `blink/1` instead of loading and then not running its script. An ABI outside the
 * spec's vocabulary is reported under the identifier it asked for, which no runtime can satisfy.
 */
function scriptFeature(abi: string): BlinkFeature {
    return `script:${abi}` as BlinkFeature;
}

/**
 * The fallback that applies to a feature: its own entry, or - for the two script ABIs - the
 * `script` entry the spec allows as a shorthand for both.
 */
function strategyFor(
    feature: BlinkFeature,
    fallbacks: Readonly<Record<string, BlinkFallbackStrategy>>
): BlinkFallbackStrategy {
    return fallbacks[feature] ?? (feature.startsWith('script:') ? fallbacks.script : undefined) ?? 'fail';
}

function outcomeFor(
    feature: BlinkFeature,
    source: 'declared' | 'inferred',
    backend: BackendCapabilities,
    fallbacks: Readonly<Record<string, BlinkFallbackStrategy>>
): CapabilityOutcome {
    if (backend.features.has(feature)) {
        return { feature, status: 'available', source, strategy: null, reason: null };
    }

    const strategy = strategyFor(feature, fallbacks);

    if (strategy === 'fail') {
        return {
            feature,
            status: 'failed',
            source,
            strategy,
            reason: `requires "${feature}", which this backend does not provide, and the package permits no fallback for it`,
        };
    }

    // rgba8 is only ever a render-target answer. Accepting it for anything else would silently
    // grant a package a degradation it never described.
    if (strategy === 'rgba8' && feature !== 'float-targets') {
        return {
            feature,
            status: 'failed',
            source,
            strategy,
            reason: `requires "${feature}", which this backend does not provide; the declared "rgba8" fallback applies to render target formats only`,
        };
    }

    // And the inverse: rgba8 is the only thing a float target can fall back to. Accepting
    // "disable" or "approximate" here would pass the cheap check and then throw inside the render
    // target pool, after the shaders and assets had already been fetched.
    if (feature === 'float-targets' && strategy !== 'rgba8') {
        return {
            feature,
            status: 'failed',
            source,
            strategy,
            reason: `requires "float-targets", which this backend does not provide; "${strategy}" is not a fallback a render target format can take, only "rgba8" is`,
        };
    }

    return {
        feature,
        status: strategy === 'disable' ? 'disabled' : 'downgraded',
        source,
        strategy,
        reason: null,
    };
}

/**
 * Passes the backend cannot run because the package ships no program for them in its shading
 * language. A package may provide a pass for one backend only; it loads on a backend only when
 * every pass has a program there.
 */
function passesWithoutShader(effect: BlinkEffectIR, backend: BlinkBackend): string[] {
    const programs = backend === 'webgpu' ? effect.shaders.wgsl : effect.shaders.glsl;
    return effect.passes
        .filter(pass => (Object.hasOwn(programs, pass.shader) ? programs[pass.shader].stage !== 'visual' : true))
        .map(pass => pass.name);
}

/**
 * Decides, per required feature, whether the effect can run: available as asked, degraded in a
 * way the package explicitly permitted, or - the default whenever no fallback says otherwise -
 * a failure the caller must turn into a rejected load.
 *
 * Silence is never a permission. A package that says nothing about a feature it needs but cannot
 * get fails here; that is the whole point of the check.
 */
export function resolveCapabilities(effect: BlinkEffectIR, backend: BackendCapabilities): CapabilityResolution {
    const required = new Map<BlinkFeature, 'declared' | 'inferred'>(inferFeatures(effect));
    for (const feature of effect.requirements.features) {
        required.set(feature, 'declared');
    }

    const outcomes: CapabilityOutcome[] = [];

    const { backends } = effect.requirements;
    if (backends.length > 0 && !backends.includes(backend.backend)) {
        outcomes.push({
            feature: 'backend',
            status: 'failed',
            source: 'declared',
            strategy: null,
            reason: `requires one of the backends ${backends.join(', ')}, but the active backend is "${backend.backend}"`,
        });
    }

    const missingShaders = passesWithoutShader(effect, backend.backend);
    if (missingShaders.length > 0) {
        const program = backend.backend === 'webgpu' ? 'wgsl' : 'glsl';
        outcomes.push({
            feature: 'backend',
            status: 'failed',
            source: 'inferred',
            strategy: null,
            reason: `passes ${missingShaders.map(name => `"${name}"`).join(', ')} have no ${program} shader, which the active backend "${backend.backend}" needs`,
        });
    }

    for (const [feature, source] of required) {
        outcomes.push(outcomeFor(feature, source, backend, effect.fallbacks));
    }

    // 'backend' never lands here: a backend mismatch has no fallback vocabulary, it only fails.
    const disabled = new Set<BlinkFeature>(
        outcomes
            .filter(
                (o): o is CapabilityOutcome & { feature: BlinkFeature } =>
                    o.status === 'disabled' && o.feature !== 'backend'
            )
            .map(o => o.feature)
    );

    return {
        outcomes,
        failures: outcomes.filter(o => o.status === 'failed'),
        disabled,
        allowFloatDowngrade: outcomes.some(
            o => o.feature === 'float-targets' && o.status === 'downgraded' && o.strategy === 'rgba8'
        ),
    };
}

/** One message listing every unmet requirement, for the error a rejected load carries. */
export function describeCapabilityFailures(resolution: CapabilityResolution, effectId: string): string {
    const lines = resolution.failures.map(f => `- ${f.reason ?? f.feature}`);
    return `Effect "${effectId}" cannot run on this backend:\n${lines.join('\n')}`;
}
