import { describe, expect, it } from 'vitest';

import { convertSsfScene } from '../convert/convertSsfScene';
import { floatifyIntegerLiterals } from '../convert/glslAdapt';
import { detokenize, findFunctions, tokenize } from '../convert/glslText';

const convert = (mainGlsl: string, scriptJs?: string): ReturnType<typeof convertSsfScene> =>
    convertSsfScene({ slug: 'test', sceneJson: {}, mainGlsl, scriptJs, files: new Map() });
const shader = (result: ReturnType<typeof convert>): string => result.files.get('shaders/main.frag.glsl') as string;

describe('SSF conversion regressions', () => {
    it('keeps floating-point arithmetic inside an integer texel-coordinate cast', () => {
        const tokens = tokenize('vec4 color = texelFetch(syn_Spectrum, ivec2(int(x*1024), 0), 0);');
        floatifyIntegerLiterals(tokens);
        expect(detokenize(tokens)).toContain('int(x*1024.0)');
        expect(detokenize(tokens)).toContain(', 0), 0)');
    });

    it('declares script outputs used only by global initializers', () => {
        const result = convert(
            'float t = script_time; vec4 renderMain() { return vec4(t); }',
            'function update(dt) { uniforms.script_time = 1; }'
        );
        expect(result.manifest.compatibility?.scriptUniforms).toMatchObject({ script_time: 'float' });
        expect(shader(result)).toContain('uniform float script_time;');
    });

    it('adapts floating pass-index literals to the integral host index', () => {
        const result = convert('vec4 renderMain() { return PASSINDEX == 0.0 ? vec4(1.0) : vec4(0.0); }');
        expect(shader(result)).toContain('PASSINDEX == 0');
        expect(shader(result)).not.toContain('PASSINDEX == 0.0');
    });

    it('declares vector outputs written through setUniform arrays', () => {
        const result = convert(
            'vec4 renderMain() { return vec4(ro, 0.0, 1.0); }',
            "function update(dt) { setUniform('ro', [1, 2]); }"
        );
        expect(result.manifest.compatibility?.scriptUniforms).toMatchObject({ ro: 'vec2' });
    });

    it('finds script uniforms referenced by macros', () => {
        const result = convert(
            '#define TT scriptTime\nvec4 renderMain() { return vec4(TT); }',
            'function update(dt) { uniforms.scriptTime = 1; }'
        );
        expect(shader(result)).toContain('uniform float scriptTime;');
    });

    it('does not treat an inactive Kodelife helper as a scene override', () => {
        const result = convert(
            '#ifdef KODELIFE\nvec4 _loadMedia() { return vec4(1.0); }\n#endif\nvec4 renderMain() { return _loadMedia(); }'
        );
        expect(result.manifest.inputs).toMatchObject([{ name: 'syn_Media' }]);
        expect(shader(result)).toContain('texture(syn_Media');
    });

    it('does not execute an empty optional scene script', () => {
        const result = convert('vec4 renderMain() { return vec4(1.0); }', '  \n');
        expect(result.manifest.script).toBeUndefined();
        expect(result.manifest.compatibility?.source).toEqual({ format: 'ssf', version: '2.0' });
        expect(result.manifest.compatibility?.profile).toBe('ssf/1');
    });

    it('infers uniforms named by callers of script setter helpers', () => {
        const result = convert(
            'vec4 renderMain() { return vec4(BY + LD, 1.0); }',
            `
      function color(name, h) { if(h < 0) { h = 0; } setUniform(name, h, 0, 1); }
      function direction(name, x) { setUniform(name, [x, 0, 1]); }
      function update(dt) { color("BY", .5); direction("LD", 1); }
    `
        );
        expect(result.manifest.compatibility?.scriptUniforms).toMatchObject({ BY: 'vec3', LD: 'vec3' });
    });

    it('injects source-compatible image sampling helpers', () => {
        const result = convert(
            'vec4 renderMain() { return _loadImage(tex, vec2(0.1)) + _textureImage(tex, _uv) + IMG_NORM_PIXEL(tex, _uv); }'
        );
        const functions = findFunctions(tokenize(shader(result)));
        for (const name of ['_loadImage', '_textureImage', 'IMG_NORM_PIXEL']) {
            expect(functions).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name,
                        returnType: 'vec4',
                        parameterTypes: ['sampler2D', 'vec2'],
                    }),
                ])
            );
        }
    });

    it('uses the nearest counter declaration when names are reused', () => {
        const tokens = tokenize('void a() { for(int i=0; i<3; i++) {} } void b() { for(float i=0.0; i<60; i++) {} }');
        floatifyIntegerLiterals(tokens);
        expect(detokenize(tokens)).toContain('i<60.0');
    });

    it('infers named-component vectors written through legacy objects', () => {
        const result = convert(
            'vec4 renderMain() { return vec4(position.xy, position.z, 1.0); }',
            'function Vector() { this.x=0; this.y=0; this.z=0; } var point = new Vector(); function update(dt) { uniforms.position = point; }'
        );
        expect(result.manifest.compatibility?.scriptUniforms).toMatchObject({ position: 'vec3' });
    });

    it('keeps integral comparisons after explicit casts and modulo', () => {
        const tokens = tokenize('if (int(x) == 0. || i%2 == 0.0) {}');
        floatifyIntegerLiterals(tokens, ['i']);
        expect(detokenize(tokens)).toBe('if (int(x) == 0 || i%2 == 0) {}');
    });

    it('preserves integral arithmetic inside casts and texel-fetch LOD expressions', () => {
        const tokens = tokenize('float value = float(int(3/2*2)); vec4 color = texelFetch(t, ivec2(0,0), 2+1);');
        floatifyIntegerLiterals(tokens);
        expect(detokenize(tokens)).toBe(
            'float value = float(int(3/2*2)); vec4 color = texelFetch(t, ivec2(0,0), 2+1);'
        );
    });

    it('preserves integral grouping while adapting the complete mixed argument', () => {
        const tokens = tokenize(
            'float x; float a=float(int((3)*x*1024)); float b=float(int((3/2)*2)); vec4 c=texelFetch(t, ivec2(0,0), (2+1));'
        );
        floatifyIntegerLiterals(tokens);
        expect(detokenize(tokens)).toBe(
            'float x; float a=float(int((3.0)*x*1024.0)); float b=float(int((3/2)*2)); vec4 c=texelFetch(t, ivec2(0,0), (2+1));'
        );
    });

    it('treats sampled texture components as floats within integer casts', () => {
        const tokens = tokenize('float value = float(int(texelFetch(t, ivec2(0,0), 0).r * 2));');
        floatifyIntegerLiterals(tokens);
        expect(detokenize(tokens)).toBe('float value = float(int(texelFetch(t, ivec2(0,0), 0).r * 2.0));');
    });
});
