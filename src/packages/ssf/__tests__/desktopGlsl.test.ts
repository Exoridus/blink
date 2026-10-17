import { describe, expect, it } from 'vitest';

import {
    adaptSsfDesktopGlsl,
    floatifyIntegerLiterals,
    renameReservedWords,
    stripPreambleTokens,
} from '../convert/glslAdapt';
import { detokenize, tokenize } from '../convert/glslText';

const adapt = (source: string): string => {
    const tokens = tokenize(source);
    floatifyIntegerLiterals(tokens);
    return detokenize(tokens);
};

describe('desktop GLSL conversion', () => {
    it('promotes integral operands without changing integer division', () => {
        expect(adapt('int i; float x; float y=x*(i+1)/10.0; float z=x*(i/2);')).toBe(
            'int i; float x; float y=x*float(i+1)/10.0; float z=x*float(i/2);'
        );
    });

    it('casts integer texture dimensions in floating declarations', () => {
        expect(adapt('vec2 size=textureSize(image,0); vec2 delta=1.0/textureSize(image,0);')).toBe(
            'vec2 size=vec2(textureSize(image,0)); vec2 delta=1.0/vec2(textureSize(image,0));'
        );
    });

    it('promotes integer parameters only for floating math', () => {
        expect(adapt('int i; float x=pow(2.0,i)+mod(i,2.0)+sin(i); int k=i%2;')).toBe(
            'int i; float x=pow(2.0,float(i))+mod(float(i),2.0)+sin(float(i)); int k=i%2;'
        );
    });

    it('adapts mixed loop bounds while leaving integral counters and indices intact', () => {
        expect(adapt('float limit; float x; for(int i=0;i<64-limit*60.0;i++){x+=values[i];}')).toBe(
            'float limit; float x; for(int i=0;float(i)<64.0-limit*60.0;i++){x+=values[i];}'
        );
    });

    it('retains integral grouped casts and LOD arithmetic', () => {
        expect(adapt('float v=float(int((3/2)*2)); vec4 c=texelFetch(t,ivec2(0,0),(2+1));')).toBe(
            'float v=float(int((3/2)*2)); vec4 c=texelFetch(t,ivec2(0,0),(2+1));'
        );
    });

    it('keeps scene scratch color distinct from the generated fragment output', () => {
        const tokens = tokenize('vec4 fragColor=vec4(0.0); vec4 renderMain(){return fragColor;}');
        renameReservedWords(tokens);
        expect(detokenize(tokens)).toBe('vec4 ssf_fragColor=vec4(0.0); vec4 renderMain(){return ssf_fragColor;}');
    });

    it('keeps explicitly declared outputs and function parameters available to their adapters', () => {
        const source = 'out highp vec4 fragColor; void mainImage(out vec4 fragColor){fragColor=vec4(1.0);}';
        const tokens = tokenize(source);
        renameReservedWords(tokens);
        expect(detokenize(tokens)).toBe(source);
    });

    it('preserves a scene PI override without redefining the host macro', () => {
        expect(
            detokenize(stripPreambleTokens(tokenize('#define PI 3.14529\nvec4 renderMain(){return vec4(PI);}')))
        ).toBe('#undef PI\n#define PI 3.14529\nvec4 renderMain(){return vec4(PI);}');
    });

    it('selects sampled colors instead of opaque sampler values', () => {
        expect(adapt('vec4 c=texMirror(active?syn_Media:image10,uv);')).toBe(
            'vec4 c=(active?texMirror(syn_Media,uv):texMirror(image10,uv));'
        );
    });

    it('recognizes integral macros in CRLF source and scopes function parameters', () => {
        expect(
            adapt(
                '#define MODE 2\r\nfloat first(float mode){return mode;} float second(int mode){return mode==MODE?1.0:0.0;}'
            )
        ).toBe(
            '#define MODE 2\r\nfloat first(float mode){return mode;} float second(int mode){return mode==MODE?1.0:0.0;}'
        );
    });

    it('leaves a vector macro alias compatible with its vector destination', () => {
        expect(adapt('#define screen RENDERSIZE.xy\nvec2 size; void f(){size=screen;}')).toBe(
            '#define screen RENDERSIZE.xy\nvec2 size; void f(){size=screen;}'
        );
    });

    it('preserves integer division before an implicit floating conversion', () => {
        expect(adapt('float value=3/2; float x; float mixed=(3/2)*x;')).toBe(
            'float value=float(3/2); float x; float mixed=float(3/2)*x;'
        );
    });

    it('preserves integer macro expressions inside explicit floating casts', () => {
        expect(adapt('#define COUNT 3\r\nfloat value=float(COUNT/2);')).toBe(
            '#define COUNT 3\r\nfloat value=float(COUNT/2);'
        );
    });

    it('restores an outer floating variable after an integral loop counter leaves scope', () => {
        expect(adapt('float i; void f(){for(int i=0;i<3;i++){} float value=i/2;}')).toBe(
            'float i; void f(){for(int i=0;i<3;i++){} float value=i/2.0;}'
        );
    });

    it('keeps nested unbraced loop counters integral throughout the inner body', () => {
        expect(
            adapt('void f(){for(int y=0;y<3;y++)for(int x=0;x<3;x++){if(x==0&&y==0)continue; float v=float(x*x+y*y);}}')
        ).toBe('void f(){for(int y=0;y<3;y++)for(int x=0;x<3;x++){if(x==0&&y==0)continue; float v=float(x*x+y*y);}}');
    });

    it('only removes initialized uniforms when shader code and macros cannot observe them', () => {
        const unused = tokenize('uniform vec2 mousePos=vec2(0.5); vec4 renderMain(){return vec4(1.0);}');
        adaptSsfDesktopGlsl(unused);
        expect(detokenize(unused)).not.toContain('mousePos');
        const used = 'uniform float gain=0.5;\n#define GAIN gain\nvec4 renderMain(){return vec4(GAIN);}';
        const tokens = tokenize(used);
        adaptSsfDesktopGlsl(tokens);
        expect(detokenize(tokens)).toBe(used);
    });

    it('adapts generic numeric macros at each invocation without changing integer overloads', () => {
        const source = '#define saturate(x) clamp(x,0,1)\nfloat x; int i; float a=saturate(x); int b=saturate(i);';
        expect(adapt(source)).toBe(
            '#define saturate(x) clamp(x,0,1)\nfloat x; int i; float a=(clamp(x,0.0,1.0)); int b=(clamp(i,0,1));'
        );
    });

    it('keeps integral overloads of generic math functions', () => {
        expect(
            adapt(
                'int i; int a=clamp(i,0,1); int b=min(i,2); float x; float c=clamp(x,0,1); float d=float(clamp(i,0,1));'
            )
        ).toBe(
            'int i; int a=clamp(i,0,1); int b=min(i,2); float x; float c=clamp(x,0.0,1.0); float d=float(clamp(i,0,1));'
        );
    });
});
