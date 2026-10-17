import { privateCorpusPath } from './corpusPaths';

import { describe, expect, it } from 'vitest';

import { openPackage } from '../../../../../scripts/lib/packageDirectory';
import { readSsfScene } from '../../../../../scripts/lib/ssfDirectory';
import { loadBlinkFx } from '../../../blinkfx/loader';
import { convertSsfScene } from '../../convert/convertSsfScene';
import { SsfScriptRuntime } from '../../script/SsfScriptRuntime';

const directory = privateCorpusPath('synesthesia', 'builtin', 'local', 'audio_indicators.synScene');

describe('original Audio Indicators', () => {
    it('preserves the three-pass graph, float dimensions, cross-buffer history and script', () => {
        const source = readSsfScene(directory);
        const converted = convertSsfScene(source);
        const ir = loadBlinkFx(converted.manifest, '/effects/audio_indicators.synScene');
        expect(ir.passes).toHaveLength(3);
        expect(converted.manifest.passes?.slice(0, 2).map(pass => pass.target)).toEqual([
            {
                name: 'feedback',
                format: 'rgba32f',
                width: 1920,
                height: 1080,
                sampling: { filter: 'linear', wrap: 'repeat' },
                persistent: true,
            },
            {
                name: 'helper',
                format: 'rgba32f',
                width: 1920,
                height: 1080,
                sampling: { filter: 'linear', wrap: 'repeat' },
                persistent: true,
            },
        ]);
        expect(converted.manifest.passes?.[0].inputs).toContainEqual({
            source: 'target.helper.previous',
            uniform: 'helper',
        });
        expect(converted.manifest.passes?.[1].inputs).toContainEqual({
            source: 'target.feedback',
            uniform: 'feedback',
        });
        expect(converted.files.get('source/main.glsl')).toBe(source.mainGlsl);
        expect(converted.files.get('script.js')).toBe(source.scriptJs);
        expect(converted.manifest.compatibility?.scriptUniforms).toEqual({
            inputTrackerScript: 'float',
            trackerSmoothScript: 'float',
            trackerSmoothIDScript: 'float',
        });
    });

    it('runs the original independent trackers across impulse, sustain and release', () => {
        const files = openPackage(directory);
        const runtime = new SsfScriptRuntime({
            source: new TextDecoder().decode(files.read('script.js')),
            nativeLifecycle: true,
            controls: [],
            declaredUniforms: {
                inputTrackerScript: 'float',
                trackerSmoothScript: 'float',
                trackerSmoothIDScript: 'float',
            },
            surface: {
                get: (): number => 0,
                set: (): never => {
                    throw new Error('Unexpected control mutation');
                },
            },
        });
        runtime.init(new Map([['syn_InputLevel', 0]]));
        let peak = 0;
        let smooth = 0;
        let smoothPeak = 0;
        for (const input of [1, 1, 1, 0, 0, 0, 0.25, 0, 0]) {
            peak = input > peak ? input : peak - (peak - input) * 0.05;
            smooth = input * 0.04 + smooth * 0.96;
            smoothPeak = smooth > smoothPeak ? smooth : smoothPeak - (smoothPeak - smooth) * 0.05;
            expect(runtime.step({ dt: 1 / 60, values: new Map([['syn_InputLevel', input]]) }).ok).toBe(true);
            const uniforms = runtime.uniforms();
            expect(uniforms.inputTrackerScript).toBeCloseTo(peak, 6);
            expect(uniforms.trackerSmoothScript).toBeCloseTo(smooth, 6);
            expect(uniforms.trackerSmoothIDScript).toBeCloseTo(smoothPeak, 6);
        }
        runtime.dispose();
    });
});
