import type { UniformValue } from '@codexo/exojs';

import type {
    CompatibilityProfile,
    CompatibilityProfileInstance,
    ProfileFrame,
} from '../../../runtime/compat/CompatibilityProfile';

export const ISF_PROFILE_ID = 'isf/2';

/** Built-ins a converted ISF shader reads, as aliases of the native ABI plus the helper macros. */
export const ISF_PRELUDE = `#define RENDERSIZE bl_resolution
#define TIME bl_time
#define TIMEDELTA bl_deltaTime
#define PASSINDEX bl_pass
#define FRAMEINDEX bl_frame

#define IMG_SIZE(img) vec2(textureSize(img, 0))
#define IMG_PIXEL(img, coord) texture(img, (coord) / vec2(textureSize(img, 0)))
#define IMG_NORM_PIXEL(img, coord) texture(img, coord)
#define IMG_THIS_PIXEL(img) texture(img, isf_FragNormCoord)
#define IMG_THIS_NORM_PIXEL(img) texture(img, isf_FragNormCoord)

vec2 isf_FragNormCoord;
`;

/** The profile's own uniform, declared by the runtime ahead of the pass samplers. */
const ISF_UNIFORMS = `uniform vec4 DATE;
`;

/** Year, month (1-12), day and seconds since local midnight. */
export function isfDate(now: Date): Float32Array {
    const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
    return new Float32Array([now.getFullYear(), now.getMonth() + 1, now.getDate(), seconds]);
}

/** Control names an `event` input produces, from the converter's source metadata. */
function eventNames(sources: Readonly<Record<string, object>>): string[] {
    return Object.entries(sources)
        .filter(([, source]) => (source as { type?: unknown }).type === 'event')
        .map(([name]) => name);
}

/**
 * The `isf/2` profile: the `DATE` uniform, and the ISF `event` input, which reads as true for
 * exactly one frame after each rising edge of its control.
 */
export const isfProfile: CompatibilityProfile = {
    id: ISF_PROFILE_ID,
    create(effect): CompatibilityProfileInstance {
        const events = eventNames(effect.compatibility?.controls ?? {});
        const previous = new Map<string, number>();
        return {
            prelude: ISF_UNIFORMS,
            neutralUniforms: () => ({ DATE: new Float32Array(4) }),
            update: (_frame: ProfileFrame) => ({ DATE: isfDate(new Date()) }),
            processControls: (raw: Readonly<Record<string, UniformValue>>) => {
                const result: Record<string, UniformValue> = { ...raw };
                for (const name of events) {
                    const value = Number(raw[name] ?? 0);
                    result[name] = value > 0 && (previous.get(name) ?? 0) <= 0 ? 1 : 0;
                    previous.set(name, value);
                }
                return result;
            },
        };
    },
};
