import type { CompatibilityProfile, CompatibilityProfileInstance } from '../../../runtime/compat/CompatibilityProfile';

export const SHADERTOY_PROFILE_ID = 'shadertoy/1';

/** The profile's own uniform, declared by the runtime ahead of the pass samplers. */
const SHADERTOY_UNIFORMS = `uniform vec4 iDate;
`;

/**
 * Shadertoy's `iDate`: year, month (0-11), day of month and seconds since local midnight.
 * The month is zero-based here, unlike ISF's `DATE`.
 */
export function shadertoyDate(now: Date): Float32Array {
    const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
    return new Float32Array([now.getFullYear(), now.getMonth(), now.getDate(), seconds]);
}

/** The `shadertoy/1` profile. Everything else a Shadertoy shader reads is a macro over the native ABI. */
export const shadertoyProfile: CompatibilityProfile = {
    id: SHADERTOY_PROFILE_ID,
    create(): CompatibilityProfileInstance {
        return {
            prelude: SHADERTOY_UNIFORMS,
            neutralUniforms: () => ({ iDate: new Float32Array(4) }),
            update: () => ({ iDate: shadertoyDate(new Date()) }),
            processControls: raw => ({ ...raw }),
        };
    },
};
