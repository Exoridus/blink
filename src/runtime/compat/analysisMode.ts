/**
 * Which analysis feeds the `syn_*` values of an SSF-family effect.
 *
 * - `current`: Blink's own audio frame, mapped onto the `syn_*` names.
 * - `enhanced`: the SSF reconstruction with the ExoJS tempo estimate substituted for its BPM family.
 * - `original`: the SSF reconstruction alone.
 */
export type AnalysisMode = 'current' | 'enhanced' | 'original';

export const ANALYSIS_MODES: readonly AnalysisMode[] = ['current', 'enhanced', 'original'];

const PROFILE_BY_MODE: Readonly<Record<AnalysisMode, string>> = {
    current: 'ssf-semantic/1',
    enhanced: 'ssf-enhanced/1',
    original: 'ssf-original/1',
};

const SWITCHABLE_PROFILES: ReadonlySet<string> = new Set(['ssf/1', ...Object.values(PROFILE_BY_MODE)]);

export function isAnalysisMode(value: unknown): value is AnalysisMode {
    return typeof value === 'string' && (ANALYSIS_MODES as readonly string[]).includes(value);
}

/** Whether a package declaring this profile follows the analysis mode; native effects do not. */
export function isSwitchableProfile(profileId: string | null | undefined): boolean {
    return profileId !== null && profileId !== undefined && SWITCHABLE_PROFILES.has(profileId);
}

/** The substitution a profile registry applies for the given mode. */
export function substituteProfile(mode: AnalysisMode): (declared: string) => string {
    return declared => (SWITCHABLE_PROFILES.has(declared) ? PROFILE_BY_MODE[mode] : declared);
}
