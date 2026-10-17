import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateBlinkFxManifest } from '../../blinkfx/validate';
import type { ShadertoySceneSource } from '../convert/convertShadertoy';
import { convertShadertoy } from '../convert/convertShadertoy';
import { normalizeShadertoy } from '../convert/model';
import { shadertoyDate } from '../profile/ShadertoyProfile';

const FIXTURES = join(__dirname, 'fixtures');
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as unknown;
const convert = (name: string, files = new Map<string, Uint8Array>()) =>
    convertShadertoy({ slug: name.replace('.json', ''), json: fixture(name), files } satisfies ShadertoySceneSource);
const shaderOf = (result: ReturnType<typeof convertShadertoy>, key: string): string =>
    String(result.files.get(`shaders/${key}.frag.glsl`));

describe('normalizeShadertoy', () => {
    it('accepts the API wrapper, the bare shader and a one-element array', () => {
        const shader = {
            info: { name: 'x' },
            renderpass: [{ type: 'image', code: 'void mainImage(out vec4 c, in vec2 p) {}' }],
        };

        expect(normalizeShadertoy({ Shader: shader })?.renderpass).toHaveLength(1);
        expect(normalizeShadertoy(shader)?.renderpass).toHaveLength(1);
        expect(normalizeShadertoy([{ Shader: shader }])?.info?.name).toBe('x');
        expect(normalizeShadertoy({ nothing: true })).toBeNull();
    });
});

describe('convertShadertoy', () => {
    it('converts a static Image pass and keeps the source entry point', () => {
        const result = convert('static_image.json');

        expect(validateBlinkFxManifest(result.manifest).valid).toBe(true);
        expect(result.manifest).toMatchObject({
            id: 'com.codexo.shadertoy.fixt01',
            title: 'Static image',
            author: 'blink-fixture',
            license: 'MIT',
            compatibility: { source: { format: 'shadertoy' }, profile: 'shadertoy/1', mode: 'preserve' },
        });
        expect(result.manifest.passes).toEqual([
            { name: 'image', shader: 'image', inputs: [], target: 'screen', clear: true },
        ]);
        const shader = shaderOf(result, 'image');
        expect(shader).toContain('#define iTime bl_time');
        expect(shader).toContain('mainImage(shadertoyColor, gl_FragCoord.xy);');
        expect(shader).toContain('fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);');
    });

    it('warns about missing license information unless one is supplied', () => {
        const json = {
            renderpass: [{ type: 'image', code: 'void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }' }],
        };

        expect(
            convertShadertoy({ slug: 'a', json, files: new Map() }).report.issues.map(issue => issue.code)
        ).toContain('license-unknown');
        expect(convertShadertoy({ slug: 'a', json, files: new Map() }, { license: 'CC0' }).report.status).toBe(
            'complete'
        );
    });

    it('accepts a pasted Image source with no metadata', () => {
        const result = convertShadertoy({
            slug: 'pasted',
            imageCode: 'void mainImage(out vec4 c, in vec2 p) { c = vec4(0.0); }',
            files: new Map(),
        });
        expect(result.manifest.passes?.map(pass => pass.name)).toEqual(['image']);
    });

    it('places Common ahead of every pass', () => {
        const result = convert('common_shared.json');

        const shader = shaderOf(result, 'image');
        expect(shader.indexOf('vec3 palette(float t)')).toBeGreaterThan(-1);
        expect(shader.indexOf('vec3 palette(float t)')).toBeLessThan(shader.indexOf('void mainImage'));
    });

    describe('buffers', () => {
        it('makes a buffer a persistent float target that reads its own previous frame', () => {
            const result = convert('buffer_feedback.json');

            expect(result.manifest.passes).toEqual([
                {
                    name: 'buffer_a',
                    shader: 'buffer_a',
                    inputs: [{ source: 'target.buffer_a.previous', uniform: 'iChannel0' }],
                    target: { name: 'buffer_a', format: 'rgba32f', persistent: true },
                    clear: false,
                },
                {
                    name: 'image',
                    shader: 'image',
                    inputs: [{ source: 'target.buffer_a', uniform: 'iChannel0' }],
                    target: 'screen',
                    clear: true,
                },
            ]);
        });

        it('reads an earlier buffer as this frame and itself as the previous frame', () => {
            const { manifest } = convert('buffers_chain.json');

            expect(manifest.passes?.map(pass => pass.name)).toEqual(['buffer_a', 'buffer_b', 'image']);
            expect(manifest.passes?.[1].inputs).toEqual([
                { source: 'target.buffer_a', uniform: 'iChannel0' },
                { source: 'target.buffer_b.previous', uniform: 'iChannel1' },
            ]);
            expect(manifest.passes?.[2].inputs).toEqual([{ source: 'target.buffer_b', uniform: 'iChannel0' }]);
        });
    });

    describe('channels', () => {
        it('binds a keyboard channel to the keyboard host input', () => {
            const { manifest } = convert('keyboard.json');

            expect(manifest.inputs).toEqual([{ name: 'keyboard', type: 'keyboard' }]);
            expect(manifest.passes?.[0].inputs).toEqual([{ source: 'input.keyboard', uniform: 'iChannel0' }]);
        });

        it('binds an audio channel to an audioTexture host input with the spectrum-waveform packing', () => {
            const { manifest } = convert('audio_texture.json');

            expect(manifest.inputs).toEqual([
                { name: 'audio', type: 'audioTexture', samples: 512, representation: 'spectrum-waveform' },
            ]);
            expect(manifest.passes?.[0].inputs).toEqual([{ source: 'input.audio', uniform: 'iChannel0' }]);
        });

        it('declares the pointer and repacks it into iMouse only for a shader that reads it', () => {
            const withMouse = convert('pointer.json');
            expect(withMouse.manifest.inputs).toEqual([{ name: 'pointer', type: 'pointer' }]);
            expect(shaderOf(withMouse, 'image')).toContain('iMouse = vec4(');

            const without = convert('static_image.json');
            expect(without.manifest.inputs).toBeUndefined();
        });

        it('packages a texture it can find and fails on one it cannot', () => {
            const json = {
                renderpass: [
                    {
                        type: 'image',
                        code: 'void mainImage(out vec4 c, in vec2 p) { c = texture(iChannel0, p / iResolution.xy); }',
                        inputs: [
                            {
                                channel: 0,
                                ctype: 'texture',
                                src: '/media/a/abc.png',
                                sampler: { filter: 'nearest', wrap: 'repeat' },
                            },
                        ],
                    },
                ],
            };

            const ok = convertShadertoy({ slug: 't', json, files: new Map([['abc.png', new Uint8Array([9])]]) });
            expect(ok.manifest.assets).toEqual([
                {
                    name: 'tex0',
                    type: 'texture2d',
                    path: 'assets/abc.png',
                    sampling: { filter: 'nearest', wrap: 'repeat' },
                },
            ]);
            expect(ok.manifest.passes?.[0].inputs).toEqual([{ source: 'asset.tex0', uniform: 'iChannel0' }]);
            expect(ok.files.get('assets/abc.png')).toEqual(new Uint8Array([9]));

            const missing = convertShadertoy({ slug: 't', json, files: new Map() });
            expect(missing.report.status).toBe('failed');
            expect(missing.report.issues.map(issue => issue.code)).toContain('asset-unresolved');
        });

        it('fails with a precise issue for a cube map channel', () => {
            const result = convert('cubemap_unsupported.json');

            expect(result.report.status).toBe('failed');
            expect(result.report.issues.map(issue => issue.code)).toContain('channel-cubemap-unsupported');
        });

        it('declares a channel the shader reads but no input binds', () => {
            const json = {
                renderpass: [
                    {
                        type: 'image',
                        code: 'void mainImage(out vec4 c, in vec2 p) { c = texture(iChannel2, p / iResolution.xy); }',
                    },
                ],
            };
            const result = convertShadertoy({ slug: 'orphan', json, files: new Map() });

            expect(shaderOf(result, 'image')).toContain('uniform sampler2D iChannel2;');
        });
    });

    describe('sound', () => {
        it('declares audio output with the shadertoy-sound ABI and an audio program', () => {
            const result = convert('sound_only.json');

            expect(result.manifest.outputs).toEqual({
                visual: false,
                audio: { shader: 'sound', abi: 'shadertoy-sound/1', channels: 2, sampleRate: 'device' },
            });
            expect(result.manifest.shaders.glsl).toEqual({ sound: { audio: 'shaders/sound.glsl' } });
            expect(result.manifest.requirements?.features).toEqual(['audio-generation']);
            expect(result.manifest.passes).toBeUndefined();
            expect(String(result.files.get('shaders/sound.glsl'))).toContain('vec2 mainSound(int samp, float time)');
            expect(validateBlinkFxManifest(result.manifest).valid).toBe(true);
        });

        it('carries visuals and sound in one package', () => {
            const result = convert('image_and_sound.json');

            expect(result.manifest.outputs).toMatchObject({ visual: true });
            expect(result.manifest.passes?.map(pass => pass.name)).toEqual(['image']);
            expect(Object.keys(result.manifest.shaders.glsl as object).sort()).toEqual(['image', 'sound']);
        });
    });

    it('formats iDate with a zero-based month', () => {
        expect([...shadertoyDate(new Date(2026, 9, 5, 0, 0, 1, 250))]).toEqual([2026, 9, 5, 1.25]);
    });

    describe('the shipped fixtures', () => {
        for (const name of readdirSync(FIXTURES).filter(
            file => file.endsWith('.json') && !file.startsWith('cubemap')
        )) {
            it(`${name} converts to a valid package`, () => {
                const result = convert(name);

                expect(result.report.status).not.toBe('failed');
                expect(validateBlinkFxManifest(result.manifest).valid).toBe(true);
            });
        }
    });
});
