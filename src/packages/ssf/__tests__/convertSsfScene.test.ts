import { describe, expect, it } from 'vitest';

import { validateBlinkFxManifest } from '../../blinkfx/validate';
import type { SsfSceneSource } from '../convert/convertSsfScene';
import { convertSsfScene } from '../convert/convertSsfScene';
import { floatifyIntegerLiterals, hoistGlobalInitializers, rewriteOneDimensionalSamplers } from '../convert/glslAdapt';
import { detokenize, tokenize } from '../convert/glslText';

const MINIMAL_GLSL = `vec4 renderMain() { return vec4(_uv, 0.0, 1.0); }`;

function scene(overrides: Partial<SsfSceneSource> & { json?: unknown } = {}): SsfSceneSource {
    return {
        slug: 'Test Scene',
        sceneJson: overrides.json ?? { TITLE: 'Test Scene', CREDIT: 'Someone' },
        mainGlsl: MINIMAL_GLSL,
        files: new Map(),
        ...overrides,
    };
}

const text = (result: ReturnType<typeof convertSsfScene>, path: string): string => {
    const content = result.files.get(path);
    return typeof content === 'string' ? content : '';
};

describe('convertSsfScene', () => {
    it('preserves source sampling and normalizes the native image, pass and media defaults', () => {
        const result = convertSsfScene(
            scene({
                json: {
                    IMAGES: [{ NAME: 'label', PATH: 'label.png' }],
                    MEDIA: { FILTER: 'linear', WRAP: 'mirror' },
                    PASSES: [
                        { TARGET: 'feedback', FLOAT: true, FILTER: 'linear', WRAP: 'clamp' },
                        { TARGET: 'defaultBuffer' },
                    ],
                },
                mainGlsl:
                    'vec4 renderMain() { return texture(syn_Media, _uv) + texture(label, _uv) + texture(feedback, _uv); }',
                files: new Map([['label.png', new Uint8Array([1])]]),
            })
        );
        expect(result.manifest.assets?.[0].sampling).toEqual({ filter: 'mipmap', wrap: 'repeat' });
        expect(result.manifest.passes?.[0].target).toMatchObject({ sampling: { filter: 'linear', wrap: 'clamp' } });
        expect(result.manifest.passes?.[1].target).toMatchObject({ sampling: { filter: 'linear', wrap: 'repeat' } });
        expect(result.manifest.inputs?.find(input => input.name === 'syn_Media')).toMatchObject({
            sampling: { filter: 'linear', wrap: 'mirror' },
        });
        expect(result.report.issues.some(issue => issue.code === 'target-sampling-unsupported')).toBe(false);
        expect(validateBlinkFxManifest(result.manifest).valid).toBe(true);
    });

    it('produces a valid package for a minimal scene and declares the ssf/1 profile', () => {
        const result = convertSsfScene(scene());

        expect(validateBlinkFxManifest(result.manifest).valid).toBe(true);
        expect(result.manifest.id).toBe('com.codexo.ssf.test_scene');
        expect(result.manifest.compatibility).toMatchObject({ profile: 'ssf/1', mode: 'preserve' });
        expect(result.manifest.passes).toEqual([
            { name: 'main', shader: 'main', inputs: [], target: 'screen', clear: true },
        ]);
        expect(text(result, 'shaders/main.frag.glsl')).toContain('fragColor = renderMain();');
        expect(text(result, 'source/main.glsl')).toBe(MINIMAL_GLSL);
    });

    it('preserves original scene.json bytes including unknown, null and legacy fields', () => {
        const original = '{ "TITLE": "legacy", "IMAGE": "old.png", "IMAGES": null, "CUSTOM": { "x": 2 } }\n';
        const bytes = new TextEncoder().encode(original);
        const result = convertSsfScene(scene({ json: JSON.parse(original), files: new Map([['scene.json', bytes]]) }));

        expect(result.files.get('source/scene.json')).toEqual(bytes);
    });

    it('retains scene.json members when only the parsed scene model is available', () => {
        const json = { TITLE: 'parsed', IMAGES: null, IMAGE: 'old.png', CUSTOM: [1, 2] };
        const result = convertSsfScene(scene({ json }));

        expect(JSON.parse(text(result, 'source/scene.json'))).toEqual(json);
    });

    it('fails with an explained error when the shader has no entry point', () => {
        const result = convertSsfScene(scene({ mainGlsl: 'void helper() {}' }));

        expect(result.report.status).toBe('failed');
        expect(result.report.issues.map(issue => issue.code)).toContain('entry-missing');
    });

    describe('passes', () => {
        const glsl = `vec4 renderMain() {
  if (PASSINDEX == 0) return vec4(1.0);
  return texture(first, _uv) + texture(second, _uv);
}`;
        const json = {
            TITLE: 'multipass',
            PASSES: [
                { TARGET: 'first', FLOAT: true },
                { TARGET: 'second', WIDTH: 640, HEIGHT: 360, FLOAT: false },
            ],
        };

        it('turns each buffer into a persistent target followed by a screen pass', () => {
            const { manifest } = convertSsfScene(scene({ mainGlsl: glsl, json }));

            expect(manifest.passes?.map(pass => pass.name)).toEqual(['first', 'second', 'final']);
            expect(manifest.passes?.[0].target).toEqual({
                name: 'first',
                format: 'rgba32f',
                sampling: { filter: 'linear', wrap: 'repeat' },
                persistent: true,
            });
            expect(manifest.passes?.[1].target).toEqual({
                name: 'second',
                width: 640,
                height: 360,
                format: 'rgba8',
                sampling: { filter: 'linear', wrap: 'repeat' },
                persistent: true,
            });
            expect(manifest.passes?.[2].target).toBe('screen');
        });

        it('inherits each native dimension below two independently', () => {
            const result = convertSsfScene(
                scene({
                    json: {
                        PASSES: [
                            { TARGET: 'a', WIDTH: 1, HEIGHT: 360, DOUBLE_BUFFER: true },
                            { TARGET: 'b', WIDTH: 640, HEIGHT: 0, DOUBLE_BUFFER: true },
                            { TARGET: 'c', WIDTH: -4, HEIGHT: null, DOUBLE_BUFFER: true },
                        ],
                    },
                })
            );

            expect(result.manifest.passes?.slice(0, 3).map(pass => pass.target)).toEqual([
                {
                    name: 'a',
                    height: 360,
                    format: 'rgba32f',
                    sampling: { filter: 'linear', wrap: 'repeat' },
                    persistent: true,
                },
                {
                    name: 'b',
                    width: 640,
                    format: 'rgba32f',
                    sampling: { filter: 'linear', wrap: 'repeat' },
                    persistent: true,
                },
                { name: 'c', format: 'rgba32f', sampling: { filter: 'linear', wrap: 'repeat' }, persistent: true },
            ]);
        });

        it('declares safe pingpong adaptation for native single-buffer defaults and false', () => {
            const result = convertSsfScene(
                scene({
                    json: {
                        PASSES: [
                            { TARGET: 'default' },
                            { TARGET: 'single', DOUBLE_BUFFER: false },
                            { TARGET: 'double', DOUBLE_BUFFER: true },
                        ],
                    },
                })
            );

            const warnings = result.report.issues.filter(issue => issue.code === 'native-single-buffer-adapted');
            expect(warnings).toHaveLength(2);
            expect(warnings.every(issue => issue.severity === 'warning')).toBe(true);
            expect(warnings[0].message).toContain('default');
            expect(warnings[1].message).toContain('single');
        });

        it('declares safe history adaptation of native FinalPass undefined feedback', () => {
            const result = convertSsfScene(
                scene({ mainGlsl: 'vec4 renderMain() { return texture(syn_FinalPass, _uv); }' })
            );

            expect(result.report.issues).toContainEqual(
                expect.objectContaining({
                    severity: 'warning',
                    code: 'native-final-pass-feedback-adapted',
                })
            );
        });

        it('reads earlier buffers as this frame and itself or later ones as the previous frame', () => {
            const { manifest } = convertSsfScene(scene({ mainGlsl: glsl, json }));

            expect(manifest.passes?.[0].inputs).toEqual([
                { source: 'target.first.previous', uniform: 'first' },
                { source: 'target.second.previous', uniform: 'second' },
            ]);
            expect(manifest.passes?.[1].inputs).toEqual([
                { source: 'target.first', uniform: 'first' },
                { source: 'target.second.previous', uniform: 'second' },
            ]);
            expect(manifest.passes?.[2].inputs).toEqual([
                { source: 'target.first', uniform: 'first' },
                { source: 'target.second', uniform: 'second' },
            ]);
        });

        it('routes syn_FinalPass through a persistent buffer and a presenting copy', () => {
            const { manifest, files } = convertSsfScene(
                scene({ mainGlsl: 'vec4 renderMain() { return texture(syn_FinalPass, _uv) * 0.9; }' })
            );

            expect(manifest.passes?.map(pass => pass.name)).toEqual(['main', 'present']);
            expect(manifest.passes?.[0].inputs).toEqual([
                { source: 'target.syn_FinalBuffer.previous', uniform: 'syn_FinalPass' },
            ]);
            expect(manifest.passes?.[1].target).toBe('screen');
            expect(files.has('shaders/present.frag.glsl')).toBe(true);
        });
    });

    describe('controls', () => {
        const controls = [
            { NAME: 'amount', TYPE: 'slider smooth', MIN: 0, MAX: 4, DEFAULT: 2, PARAMS: 0.2 },
            { NAME: 'enabled', TYPE: 'toggle', MIN: 0, MAX: 1, DEFAULT: 1 },
            { NAME: 'offset', TYPE: 'xy smooth', MIN: [-1, -1], MAX: [1, 1], DEFAULT: [0.5, 0] },
            { NAME: 'tint', TYPE: 'color', DEF_COLOR: [1, 0.5, 0] },
            { NAME: 'mode', TYPE: 'dropdown', LABELS: ['a', 'b', 'c'], VALUES: [0, 1, 2], DEFAULT: 1 },
            { NAME: 'hit', TYPE: 'bang counter' },
        ];

        it('maps every control family and keeps the source behavior as metadata', () => {
            const { manifest } = convertSsfScene(scene({ json: { TITLE: 'c', CONTROLS: controls } }));

            expect(manifest.controls?.map(control => [control.name, control.type])).toEqual([
                ['amount', 'float'],
                ['enabled', 'float'],
                ['offset', 'point2d'],
                ['tint', 'color'],
                ['mode', 'float'],
                ['hit', 'float'],
            ]);
            expect(manifest.controls?.find(control => control.name === 'tint')).toMatchObject({
                default: [1, 0.5, 0, 1],
            });
            expect(manifest.compatibility?.controls?.amount).toMatchObject({
                type: 'slider smooth',
                modifiers: ['smooth'],
                params: 0.2,
            });
            expect(manifest.compatibility?.controls?.hit).toMatchObject({ modifiers: ['counter'] });
            expect(validateBlinkFxManifest(manifest).valid).toBe(true);
        });

        it('reads a color control as the vec3 the scene expects', () => {
            const result = convertSsfScene(
                scene({
                    json: { TITLE: 'c', CONTROLS: [controls[3]] },
                    mainGlsl: 'vec4 renderMain() { vec3 c = tint * 2.0; return vec4(c + tint.r, 1.0); }',
                })
            );

            expect(text(result, 'shaders/main.frag.glsl')).toContain(
                'vec3 c = tint.rgb * 2.0; return vec4(c + tint.rgb.r, 1.0);'
            );
        });

        it('turns transition uniforms into controls at their starting value', () => {
            const { manifest } = convertSsfScene(
                scene({
                    json: {
                        TITLE: 't',
                        HARD_TRANSITIONS: [{ UNIFORM: 'shape', VALUES: [2, 0] }],
                        SMOOTH_TRANSITIONS: [{ UNIFORMS: ['a', 'b'], DURATION: 3 }],
                    },
                })
            );

            expect(
                manifest.controls?.map(control => [control.name, 'default' in control ? control.default : null])
            ).toEqual([
                ['shape', 2],
                ['a', 1],
                ['b', 0],
            ]);
        });
    });

    it('inlines package-local includes and reports an unavailable library as an error', () => {
        const files = new Map([['common.glsl', new TextEncoder().encode('float helper() { return 1.0; }')]]);

        const ok = convertSsfScene(
            scene({ mainGlsl: '#include "common.glsl"\nvec4 renderMain() { return vec4(helper()); }', files })
        );
        expect(text(ok, 'shaders/main.frag.glsl')).toContain('float helper()');
        expect(ok.report.status).not.toBe('failed');

        const missing = convertSsfScene(
            scene({ mainGlsl: '#include "hg_sdf.glsl"\nvec4 renderMain() { return vec4(1.0); }' })
        );
        expect(missing.report.issues.map(issue => issue.code)).toContain('include-unresolved');
        expect(missing.report.status).toBe('failed');
    });

    it('injects only the library helpers the scene uses, and not ones it defines itself', () => {
        const used = convertSsfScene(
            scene({ mainGlsl: 'vec4 renderMain() { return vec4(_rotate(_uv, 1.0), _rand(_uv), 1.0); }' })
        );
        const shader = text(used, 'shaders/main.frag.glsl');
        expect(shader).toMatch(/vec2 _rotate\(vec2 \w+, float \w+\)/);
        expect(shader).toContain('float _rand(vec2 seed)');
        expect(shader).not.toContain('_hsv2rgb');

        const own = convertSsfScene(
            scene({
                mainGlsl:
                    'vec2 _rotate(vec2 v, float t) { return v; }\nvec4 renderMain() { return vec4(_rotate(_uv, 1.0), 0.0, 1.0); }',
            })
        );
        expect(text(own, 'shaders/main.frag.glsl')).not.toContain('float theta');
        expect(text(own, 'shaders/main.frag.glsl').match(/vec2 _rotate\(/g)).toHaveLength(1);
    });

    it('keeps the script and requires the ssf/1 script ABI', () => {
        const result = convertSsfScene(scene({ scriptJs: 'function update() {}' }));

        expect(result.manifest.script).toEqual({ entry: 'script.js', abi: 'ssf/1' });
        expect(result.manifest.requirements?.features).toEqual(['script:ssf/1']);
        expect(text(result, 'script.js')).toBe('function update() {}');

        const without = convertSsfScene(scene({ scriptJs: 'x' }), { skipScript: true });
        expect(without.manifest.script).toBeUndefined();
    });
});

describe('GLSL adaptation', () => {
    const adapt = (source: string, fn: (tokens: ReturnType<typeof tokenize>) => unknown): string => {
        const tokens = tokenize(source);
        fn(tokens);
        return detokenize(tokens);
    };

    it('tokenizes losslessly', () => {
        const source = '#define X 1\nfloat a = 1e-3 + .5; // note\n/* block */ vec2 b = vec2(a, 2.);\n';
        expect(detokenize(tokenize(source))).toBe(source);
    });

    describe('integer literals', () => {
        it('floats them in float contexts', () => {
            const out = adapt('float x = 1; float y = pow(x, 2) * 3 + mod(x, 4);', floatifyIntegerLiterals);
            expect(out).toBe('float x = 1.0; float y = pow(x, 2.0) * 3.0 + mod(x, 4.0);');
        });

        it('keeps them where an integer is required', () => {
            const out = adapt(
                'int n = 5; for (int i = 0; i < 4; i++) { a[i + 1] = n % 3; } if (PASSINDEX == 2) {} ivec2 p = ivec2(1, 2); texelFetch(t, p, 0);',
                floatifyIntegerLiterals
            );
            expect(out).toBe(
                'int n = 5; for (int i = 0; i < 4; i++) { a[i + 1] = n % 3; } if (PASSINDEX == 2) {} ivec2 p = ivec2(1, 2); texelFetch(t, p, 0);'
            );
        });

        it('keeps a signed literal that initializes or bounds an integral loop counter', () => {
            const source = 'for (int i = -4; i <= 4; i++) { x += float(i) * 2; }';
            expect(adapt(source, floatifyIntegerLiterals)).toBe(
                'for (int i = -4; i <= 4; i++) { x += float(i) * 2.0; }'
            );
        });

        it('knows integral names the converter supplies, such as an int control', () => {
            const out = adapt('float m = shape == 0 ? 1 : 2;', tokens => floatifyIntegerLiterals(tokens, ['shape']));
            expect(out).toBe('float m = shape == 0 ? 1.0 : 2.0;');
        });

        it('follows user function parameter types', () => {
            const out = adapt('float f(int a, float b) { return b; } float g = f(2, 3);', floatifyIntegerLiterals);
            expect(out).toBe('float f(int a, float b) { return b; } float g = f(2, 3.0);');
        });
    });

    it('moves non-constant global initializers into assignments', () => {
        const tokens = tokenize(
            'const float K = 2.0; float a = RENDERSIZE.x, b; vec2 c = vec2(a, 1.0);\nvec4 renderMain() { return vec4(1.0); }'
        );
        const assignments = hoistGlobalInitializers(tokens);

        expect(assignments).toEqual(['a = RENDERSIZE.x;', 'c = vec2(a, 1.0);']);
        expect(detokenize(tokens)).toContain('const float K = 2.0; float a , b; vec2 c ;');
    });

    it('turns 1D spectrum lookups into 2D ones', () => {
        const out = adapt(
            'vec4 a = texture(syn_Spectrum, x * 0.5); vec4 b = texelFetch(syn_Spectrum, int(x * 1024.0), 0);',
            tokens => rewriteOneDimensionalSamplers(tokens, new Set(['syn_Spectrum']))
        );
        expect(out).toBe(
            'vec4 a = texture(syn_Spectrum, vec2(x * 0.5,0.5)); vec4 b = texelFetch(syn_Spectrum, ivec2(int(x * 1024.0),0), 0);'
        );
    });
});

describe('script uniform shape diagnostics', () => {
    it('warns for a shader-used output whose assigned shape cannot be inferred', () => {
        const result = convertSsfScene(
            scene({
                mainGlsl: 'vec4 renderMain() { return vec4(dynamic, 0.0, 0.0, 1.0); }',
                scriptJs: 'uniforms.dynamic = makeVector(); uniforms.unused = anotherFactory();',
            })
        );
        const warnings = result.report.issues.filter(issue => issue.code === 'script-uniform-type-unresolved');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain('dynamic');
        expect(warnings[0].message).not.toContain('unused');
    });

    it('accepts a source-declared uniform even when its script output shape is unknown', () => {
        const result = convertSsfScene(
            scene({
                mainGlsl: 'uniform vec2 dynamic; vec4 renderMain() { return vec4(dynamic, 0.0, 1.0); }',
                scriptJs: 'uniforms.dynamic = makeVector();',
            })
        );
        expect(result.report.issues.some(issue => issue.code === 'script-uniform-type-unresolved')).toBe(false);
    });
});

describe('qualified native helpers', () => {
    it('qualifies recovered native arithmetic without claiming a processed media producer', () => {
        const math = convertSsfScene(
            scene({ mainGlsl: 'vec4 renderMain() { return vec4(_rotate(_uv, 1.0), _toPolarTrue(_uv).x, 1.0); }' })
        );
        expect(math.report.issues.some(issue => issue.code === 'helper-native-parity-unverified')).toBe(false);
        expect(math.report.status).toBe('complete');
        const media = convertSsfScene(scene({ mainGlsl: 'vec4 renderMain() { return _loadUserImage(); }' }));
        expect(media.manifest.inputs?.some(input => input.name === 'syn_Media')).toBe(true);
        expect(media.report.issues.some(issue => issue.code === 'media-processing-unavailable')).toBe(true);
    });
});

describe('unsupported native resources', () => {
    it('fails conversion explicitly for deferred cubemap bindings', () => {
        const result = convertSsfScene(
            scene({
                json: { CUBEMAPS: [{ NAME: 'environment', PATH: 'environment' }] },
                mainGlsl: 'vec4 renderMain() { return texture(environment, vec3(_uv, 1.0)); }',
            })
        );
        expect(result.report.status).toBe('failed');
        expect(result.report.issues).toContainEqual(
            expect.objectContaining({ severity: 'error', code: 'native-cubemaps-unmapped' })
        );
    });
});

describe('SSF media array sampling', () => {
    it.each(['mirror', 'repeat'])('preserves linear MEDIA array sampling with %s wrap', wrap => {
        const result = convertSsfScene(
            scene({
                json: { MEDIA: [{ FILTER: 'linear', WRAP: wrap }] },
                mainGlsl: 'vec4 renderMain() { return texture(syn_Media, _uv); }',
            })
        );
        expect(result.manifest.inputs?.find(input => input.name === 'syn_Media')?.sampling).toEqual({
            filter: 'linear',
            wrap,
        });
    });

    it('preserves nondefault filter and wrap from a MEDIA array record', () => {
        const result = convertSsfScene(
            scene({
                json: { MEDIA: [{ FILTER: 'nearest', WRAP: 'clamp' }] },
                mainGlsl: 'vec4 renderMain() { return texture(syn_UserImage, _uv); }',
            })
        );
        expect(result.manifest.inputs?.[0].sampling).toEqual({ filter: 'nearest', wrap: 'clamp' });
    });

    it.each([
        { MEDIA: [{ FILTER: 'linear', WRAP: 'border' }] },
        { MEDIA: { FILTER: 'linear', WRAP: 'BORDER' } },
        { PASSES: [{ TARGET: 'buffer', WRAP: 'border' }] },
        { IMAGES: [{ NAME: 'label', PATH: 'label.png', WRAP: 'border' }] },
    ])('reports unsupported border sampling rather than claiming conversion for %j', json => {
        const result = convertSsfScene(scene({ json, files: new Map([['label.png', new Uint8Array([1])]]) }));
        expect(result.report.status).toBe('failed');
        expect(result.report.issues).toContainEqual(
            expect.objectContaining({ severity: 'error', code: 'texture-wrap-unsupported' })
        );
    });
});

describe('SSF pointer button adapter', () => {
    it('binds all three click components through the common pointer tuple', () => {
        const result = convertSsfScene(scene({ mainGlsl: 'vec4 renderMain() { return vec4(_click, 1.0); }' }));
        expect(result.manifest.inputs).toContainEqual({ name: 'pointer', type: 'pointer' });
        expect(text(result, 'shaders/main.frag.glsl')).toContain('_click = bl_pointerButtons;');
        expect(text(result, 'shaders/main.frag.glsl')).not.toContain('_click = vec3(bl_pointerDown, 0.0, 0.0);');
    });
});
