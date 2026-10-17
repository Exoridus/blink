import { describe, expect, it } from 'vitest';

import { silentBlinkAudioFrame } from '../../../../runtime/audio/BlinkAudioFrame';
import { loadBlinkFx } from '../../../blinkfx/loader';
import { ssfEnhancedProfile } from '../../profile/SsfEnhancedProfile';
import { ssfOriginalProfile } from '../../profile/SsfOriginalProfile';

describe('SSF Original profile consumer integration', () => {
    it('publishes PCM-derived values and independent float textures without generic audio values', () => {
        const effect = loadBlinkFx(
            { format: 'blinkfx/1', id: 'test.original', title: 'Original', shaders: { glsl: 'main.glsl' } },
            '/fixture'
        );
        const profile = ssfOriginalProfile.create(effect);
        profile.processPcm?.({
            samples: new Float32Array(512).fill(0.25),
            sampleRate: 44100,
            firstSample: 0,
            sourceEpoch: 0,
        });
        const frame = { audio: { ...silentBlinkAudioFrame(), level: 0.99 }, deltaTime: 1 / 60, mediaActive: false };
        const values = profile.update(frame);
        expect(values.syn_InputLevel).toBe(0.25);
        expect(values.syn_PrimeBang).toBe(0);
        expect(profile.prelude).toContain('uniform float syn_PrimeBang;');
        expect(profile.audioSurface?.('spectrum')).not.toBe(profile.audioSurface?.('levelTrail'));
        profile.dispose?.();
    });
});

describe('SSF Enhanced profile', () => {
    const effect = loadBlinkFx(
        { format: 'blinkfx/1', id: 'test.enhanced', title: 'Enhanced', shaders: { glsl: 'main.glsl' } },
        '/fixture'
    );
    const block = { samples: new Float32Array(512).fill(0.25), sampleRate: 44100, firstSample: 0, sourceEpoch: 0 };

    it('keeps the generic analyzers attached next to the PCM provider', () => {
        const profile = ssfEnhancedProfile.create(effect);
        expect(profile.needsGenericAnalysis).toBe(true);
        expect(ssfOriginalProfile.create(effect).needsGenericAnalysis).toBe(false);
        profile.dispose?.();
    });

    it('substitutes the ExoJS tempo for the BPM family and falls back to the original without one', () => {
        const profile = ssfEnhancedProfile.create(effect);
        profile.processPcm?.(block);
        const audio = { ...silentBlinkAudioFrame(), bpm: 128, bpmConfidence: 0.9 };
        const withTempo = profile.update({ audio, deltaTime: 1 / 60, mediaActive: false });
        expect(withTempo.syn_BPM).toBeCloseTo(128, 0);

        const fallback = ssfEnhancedProfile.create(effect);
        fallback.processPcm?.(block);
        const original = fallback.update({
            audio: { ...silentBlinkAudioFrame(), bpm: 0, bpmConfidence: 0 },
            deltaTime: 1 / 60,
            mediaActive: false,
        });
        expect(original.syn_BPM).not.toBeCloseTo(128, 0);
        profile.dispose?.();
        fallback.dispose?.();
    });
});
