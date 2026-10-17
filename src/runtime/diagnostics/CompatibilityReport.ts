import type { CapabilityOutcome, CapabilityResolution } from '../capability/resolveCapabilities';
import type { BlinkEffectIR } from '../ir/types';

/** How the running effect relates to what its source format promised. */
export type CompatibilityLevel =
    /** Authored for Blink: no source format involved. */
    | 'native'
    /** Converted, and every capability it asked for is present as asked. */
    | 'compatible'
    /** Converted, and at least one capability is switched off or downgraded. */
    | 'degraded';

export interface CompatibilityFeatureLine {
    readonly feature: string;
    readonly status: CapabilityOutcome['status'];
    readonly declared: boolean;
    /** The permitted degradation that applied, or null. */
    readonly strategy: string | null;
}

/**
 * What a user or a CLI needs to know about a running effect's provenance and fidelity: where it
 * came from, which profile supplies its vocabulary, how each capability it needs was resolved,
 * and what is approximate about the profile itself. Plain data, so a panel, the CLI and a test
 * all read the same thing.
 */
export interface CompatibilityReport {
    readonly effectId: string;
    readonly level: CompatibilityLevel;
    readonly source: { readonly format: string; readonly version: string | null } | null;
    readonly profile: string | null;
    readonly mode: 'preserve' | 'native' | null;
    readonly converter: string | null;
    readonly features: readonly CompatibilityFeatureLine[];
    /** Standing caveats of the profile, and the source-format diagnostics the package carries. */
    readonly notes: readonly string[];
}

const PROFILE_NOTES: ReadonlyMap<string, readonly string[]> = new Map([
    [
        'ssf/1',
        [
            'The syn_* audio values have API and semantic compatibility; numerical parity with Synesthesia is not claimed.',
            'Scripts run on the main thread and are untrusted content.',
        ],
    ],
    ['isf/2', ['Image inputs are optional: with no source bound they read transparent black.']],
    [
        'shadertoy/1',
        [
            'The audio texture is packed as 512x2 (spectrum, waveform); its normalization is not verified against Shadertoy.',
            'Sound is generated at the output device rate.',
        ],
    ],
]);

function describeDiagnostic(key: string, value: unknown): string {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return `${key}: ${text}`;
}

export function buildCompatibilityReport(
    effect: BlinkEffectIR,
    resolution: CapabilityResolution | null
): CompatibilityReport {
    const compatibility = effect.compatibility;
    const features: CompatibilityFeatureLine[] = (resolution?.outcomes ?? []).map(outcome => ({
        feature: outcome.feature,
        status: outcome.status,
        declared: outcome.source === 'declared',
        strategy: outcome.strategy,
    }));

    const degraded = features.some(line => line.status === 'disabled' || line.status === 'downgraded');
    const level: CompatibilityLevel = compatibility === null ? 'native' : degraded ? 'degraded' : 'compatible';

    const notes = [
        ...(compatibility?.profile === null || compatibility === null
            ? []
            : (PROFILE_NOTES.get(compatibility.profile ?? '') ?? [])),
        ...effect.diagnostics.map(entry => describeDiagnostic(entry.key, entry.value)),
    ];

    return {
        effectId: effect.metadata.id,
        level,
        source:
            compatibility?.source === undefined || compatibility.source === null ? null : { ...compatibility.source },
        profile: compatibility?.profile ?? null,
        mode: compatibility?.mode ?? null,
        converter: compatibility?.converter ?? null,
        features,
        notes,
    };
}
