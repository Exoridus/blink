import { DataTexture, ScaleModes, TextureFormat, type UniformValue, WrapModes } from '@codexo/exojs';

import type { CompatibilityProfile, CompatibilityProfileInstance } from '../../../runtime/compat/CompatibilityProfile';
import type { ProfileFrame } from '../../../runtime/compat/CompatibilityProfile';
import type { AudioAnalysisProvider, AudioBlock } from '../original/provider';
import { SsfOriginalProvider } from '../original/provider';
import { SsfControlProcessor } from './SsfControlProcessor';

export const SSF_ORIGINAL_PROFILE_ID = 'ssf-original/1';

function scalarValues(provider: AudioAnalysisProvider, dt: number): Record<string, number> {
    const values: Record<string, number> = {};
    for (const [name, signal] of provider.snapshot(dt).signals) {
        if (typeof signal.value === 'number' && name !== 'TIME') values[name] = signal.value;
    }
    values.syn_MediaType = 0;
    return values;
}

/** How a PCM-driven SSF profile builds its provider and feeds it what the PCM alone cannot carry. */
export interface SsfPcmProfileOptions<P extends AudioAnalysisProvider> {
    readonly createProvider: () => P;
    /** Called once per frame before the snapshot; `lastSample` is the end of the PCM processed so far. */
    readonly beforeSnapshot?: (provider: P, frame: ProfileFrame, lastSample: number) => void;
    /** The generic Blink analyzers stay attached next to the PCM provider. */
    readonly needsGenericAnalysis?: boolean;
}

/** Builds a profile whose `syn_*` values come from a PCM-fed analysis provider. */
export function createSsfPcmProfile<P extends AudioAnalysisProvider>(
    id: string,
    options: SsfPcmProfileOptions<P>
): CompatibilityProfile {
    return {
        id,
        create(effect): CompatibilityProfileInstance {
            const provider = options.createProvider();
            let lastSample = 0;
            const neutral = scalarValues(options.createProvider(), 0);
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
                needsGenericAnalysis: options.needsGenericAnalysis === true,
                processPcm: (block: AudioBlock) => {
                    provider.process(block);
                    lastSample = block.firstSample + block.samples.length;
                },
                audioSurface: name => (name === 'spectrum' ? spectrum : trail),
                update: frame => {
                    options.beforeSnapshot?.(provider, frame, lastSample);
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
}

export const ssfOriginalProfile = createSsfPcmProfile(SSF_ORIGINAL_PROFILE_ID, {
    createProvider: () => new SsfOriginalProvider(),
});
