import { describe, expect, it } from 'vitest';

import { silentBlinkAudioFrame } from '../../../../runtime/audio/BlinkAudioFrame';
import { loadBlinkFx } from '../../../blinkfx/loader';
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
