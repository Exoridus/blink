import type {
    CompatibilityProfile,
    CompatibilityProfileInstance,
    ProfileFrame,
} from '../../../runtime/compat/CompatibilityProfile';
import { SSF_SCALAR_PRELUDE, SsfAudioAdapter } from './SsfAudioAdapter';
import { SsfControlProcessor } from './SsfControlProcessor';
import { ssfOriginalProfile } from './SsfOriginalProfile';

export const SSF_PROFILE_ID = 'ssf/1';

const VECTOR_SIZES: Readonly<Record<string, number>> = { vec2: 2, vec3: 3, vec4: 4 };

/** Zero values for the uniforms a scene's script writes, shaped by their declared GLSL type. */
function neutralScriptUniforms(types: Readonly<Record<string, string>>): Record<string, number | Float32Array> {
    const values: Record<string, number | Float32Array> = {};
    for (const [name, type] of Object.entries(types)) {
        const size = VECTOR_SIZES[type];
        values[name] = size === undefined ? 0 : new Float32Array(size);
    }
    return values;
}

/**
 * The `ssf/1` compatibility profile: the `syn_*` audio scalars and the behavior of SSF control
 * types, for packages converted from Synesthesia scenes (or authored in that vocabulary).
 */
export const legacySsfProfile: CompatibilityProfile = {
    id: 'ssf-semantic/1',
    create(effect): CompatibilityProfileInstance {
        const adapter = new SsfAudioAdapter();
        const processor = new SsfControlProcessor(effect.controls, effect.compatibility?.controls ?? {});
        return {
            screenColor: 'encoded',
            assetColor: 'raw',
            prelude: SSF_SCALAR_PRELUDE,
            neutralUniforms: () => ({
                ...SsfAudioAdapter.neutral(),
                ...neutralScriptUniforms(effect.compatibility?.scriptUniforms ?? {}),
            }),
            update: (frame: ProfileFrame) => ({ ...adapter.update(frame.audio, frame.deltaTime, frame.mediaActive) }),
            resetControl: name => processor.reset(name),
            processControls: (raw, deltaTime) => (processor.active ? processor.process(raw, deltaTime) : { ...raw }),
        };
    },
};

export const ssfProfile: CompatibilityProfile = { ...ssfOriginalProfile, id: SSF_PROFILE_ID };
