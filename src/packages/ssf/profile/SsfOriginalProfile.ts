import { DataTexture, ScaleModes, TextureFormat, type UniformValue, WrapModes } from '@codexo/exojs';

import type { CompatibilityProfile, CompatibilityProfileInstance } from '../../../runtime/compat/CompatibilityProfile';
import type { AudioBlock } from '../original/provider';
import { SsfOriginalProvider } from '../original/provider';
import { SsfControlProcessor } from './SsfControlProcessor';

export const SSF_ORIGINAL_PROFILE_ID = 'ssf-original/1';

function scalarValues(provider: SsfOriginalProvider, dt: number): Record<string, number> {
    const values: Record<string, number> = {};
    for (const [name, signal] of provider.snapshot(dt).signals) {
        if (typeof signal.value === 'number' && name !== 'TIME') values[name] = signal.value;
    }
    values.syn_MediaType = 0;
    return values;
}

export const ssfOriginalProfile: CompatibilityProfile = {
    id: SSF_ORIGINAL_PROFILE_ID,
    create(effect): CompatibilityProfileInstance {
        const provider = new SsfOriginalProvider();
        const neutral = scalarValues(new SsfOriginalProvider(), 0);
        const processor = new SsfControlProcessor(effect.controls, effect.compatibility?.controls ?? {});
        const createTexture = (width: number): DataTexture<TextureFormat.Rgba32F> =>
            new DataTexture({
                width,
                height: 1,
                format: TextureFormat.Rgba32F,
                textureOptions: { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.Repeat },
            });
        const spectrum = createTexture(1024);
        const trail = createTexture(400);
        return {
            screenColor: 'encoded',
            assetColor: 'raw',
            prelude: `${Object.keys(neutral)
                .map(name => `uniform float ${name};`)
                .join('\n')}\n`,
            neutralUniforms: () => {
                const values: Record<string, UniformValue> = { ...neutral };
                for (const [name, type] of Object.entries(effect.compatibility?.scriptUniforms ?? {})) {
                    const size = { vec2: 2, vec3: 3, vec4: 4 }[type];
                    values[name] = size === undefined ? 0 : new Float32Array(size);
                }
                return values;
            },
            processPcm: (block: AudioBlock) => provider.process(block),
            audioSurface: name => (name === 'spectrum' ? spectrum : trail),
            update: frame => {
                const snapshot = provider.snapshot(frame.deltaTime);
                spectrum.buffer.set(snapshot.spectrum);
                trail.buffer.set(snapshot.levelTrail);
                spectrum.commit();
                trail.commit();
                const values: Record<string, UniformValue> = {};
                for (const [name, signal] of snapshot.signals) {
                    if (name !== 'TIME' && typeof signal.value === 'number') values[name] = signal.value;
                }
                values.syn_MediaType = frame.mediaActive ? 1 : 0;
                return values;
            },
            resetControl: name => processor.reset(name),
            processControls: (raw, dt) => (processor.active ? processor.process(raw, dt) : { ...raw }),
            dispose: () => {
                provider.destroy();
                spectrum.destroy();
                trail.destroy();
            },
        };
    },
};
