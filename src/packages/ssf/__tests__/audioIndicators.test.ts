import { describe, expect, it } from 'vitest';

import { loadBlinkFx } from '../../blinkfx/loader';
import { convertSsfScene } from '../convert/convertSsfScene';
import { SsfScriptRuntime } from '../script/SsfScriptRuntime';

const mainGlsl = 'vec4 renderMain() { return texture(history, _uv) + texture(auxiliary, _uv) * level; }';
const scriptJs = 'function update() { setUniform("level", syn_InputLevel); }';

describe('synthetic audio-driven multipass scene', () => {
    it('preserves float targets, cross-buffer history and script declarations', () => {
        const converted = convertSsfScene({
            slug: 'synthetic_audio',
            files: new Map(),
            mainGlsl,
            scriptJs,
            sceneJson: {
                TITLE: 'Synthetic audio',
                PASSES: [
                    { TARGET: 'history', FLOAT: true, WIDTH: 1920, HEIGHT: 1080 },
                    { TARGET: 'auxiliary', FLOAT: true, WIDTH: 1920, HEIGHT: 1080 },
                ],
            },
        });
        const ir = loadBlinkFx(converted.manifest, '/effects/synthetic_audio');
        expect(ir.passes).toHaveLength(3);
        expect(converted.manifest.passes?.slice(0, 2).map(pass => pass.target)).toEqual([
            {
                name: 'history',
                format: 'rgba32f',
                width: 1920,
                height: 1080,
                sampling: { filter: 'linear', wrap: 'repeat' },
                persistent: true,
            },
            {
                name: 'auxiliary',
                format: 'rgba32f',
                width: 1920,
                height: 1080,
                sampling: { filter: 'linear', wrap: 'repeat' },
                persistent: true,
            },
        ]);
        expect(converted.manifest.passes?.[0].inputs).toContainEqual({
            source: 'target.auxiliary.previous',
            uniform: 'auxiliary',
        });
        expect(converted.manifest.passes?.[1].inputs).toContainEqual({ source: 'target.history', uniform: 'history' });
        expect(converted.files.get('source/main.glsl')).toBe(mainGlsl);
        expect(converted.files.get('script.js')).toBe(scriptJs);
        expect(converted.manifest.compatibility?.scriptUniforms).toEqual({ level: 'float' });
    });

    it('publishes changing audio input through a native script lifecycle', () => {
        const runtime = new SsfScriptRuntime({
            source: scriptJs,
            nativeLifecycle: true,
            controls: [],
            declaredUniforms: { level: 'float' },
            surface: {
                get: (): number => 0,
                set: (): never => {
                    throw new Error('Unexpected control mutation');
                },
            },
        });
        try {
            runtime.init(new Map([['syn_InputLevel', 0]]));
            for (const input of [0, 1, 1, 0.5, 0]) {
                expect(runtime.step({ dt: 1 / 60, values: new Map([['syn_InputLevel', input]]) }).ok).toBe(true);
                expect(runtime.uniforms().level).toBe(input);
            }
        } finally {
            runtime.dispose();
        }
    });
});
