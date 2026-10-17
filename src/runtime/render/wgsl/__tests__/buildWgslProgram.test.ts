import { describe, expect, it } from 'vitest';

import type { BlinkControlSpec } from '../../../ir/types';
import { buildWgslProgram } from '../buildWgslProgram';

const SOURCE = '@fragment fn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';

const control = (
    spec: Partial<BlinkControlSpec> & { name: string; type: BlinkControlSpec['type'] }
): BlinkControlSpec =>
    ({ label: null, description: null, group: null, default: 0, ...spec }) as unknown as BlinkControlSpec;

function program(overrides: Partial<Parameters<typeof buildWgslProgram>[0]> = {}): string {
    return buildWgslProgram({
        uniformNames: ['TIME', 'bl_time', 'bl_resolution', 'bl_frame', 'au_bass', 'amount'],
        textures: [],
        controls: [control({ name: 'amount', type: 'float' })],
        source: SOURCE,
        ...overrides,
    });
}

describe('buildWgslProgram', () => {
    it('lists the uniforms as one vec4 slot each, in the material order, because the packed layout is positional', () => {
        const text = program({ uniformNames: ['b', 'a', 'c', 'bl_resolution'] });

        const struct = text.slice(text.indexOf('struct BlinkUniforms'), text.indexOf('};'));
        expect(struct.match(/\w+(?=: vec4<f32>)/g)).toEqual(['b', 'a', 'c', 'bl_resolution']);
    });

    it('binds the uniform buffer in the user group and the package program after the runtime parts', () => {
        const text = program();

        expect(text).toContain('@group(2) @binding(0) var<uniform> blink: BlinkUniforms;');
        expect(text.endsWith(`${SOURCE}\n`)).toBe(true);
        expect(text.indexOf('fn vertexMain')).toBeLessThan(text.indexOf(SOURCE));
    });

    it('gives the pass the fullscreen vertex stage and the varying its fragment reads', () => {
        const text = program();

        expect(text).toContain('@vertex\nfn vertexMain(input: BlinkVertexInput) -> BlinkVarying');
        expect(text).toContain('out.uv = input.position * 0.5 + vec2<f32>(0.5, 0.5);');
        expect(text).toContain(
            'struct BlinkVarying {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};'
        );
    });

    it('reads a value from its slot the way the GLSL uniform of the same name is typed', () => {
        const text = program();

        expect(text).toContain('fn bl_time() -> f32 { return blink.bl_time.x; }');
        expect(text).toContain('fn bl_frame() -> i32 { return i32(blink.bl_frame.x); }');
        expect(text).toContain('fn bl_resolution() -> vec2<f32> { return blink.bl_resolution.xy; }');
        expect(text).toContain('fn au_bass() -> f32 { return blink.au_bass.x; }');
    });

    it('types a control by its kind', () => {
        const text = program({
            uniformNames: ['bl_resolution', 'f', 'i', 'b', 'c', 'p', 'e', 'gone'],
            controls: [
                control({ name: 'f', type: 'float' }),
                control({ name: 'i', type: 'int' }),
                control({ name: 'b', type: 'bool' }),
                control({ name: 'c', type: 'color' }),
                control({ name: 'p', type: 'point2d' }),
                control({ name: 'e', type: 'enum', options: ['a', 'b'] } as Partial<BlinkControlSpec> & {
                    name: string;
                    type: 'enum';
                }),
                control({ name: 'gone', type: 'bang' }),
            ],
        });

        expect(text).toContain('fn f() -> f32 { return blink.f.x; }');
        expect(text).toContain('fn i() -> i32 { return i32(blink.i.x); }');
        expect(text).toContain('fn b() -> bool { return (blink.b.x != 0.0); }');
        expect(text).toContain('fn c() -> vec4<f32> { return blink.c; }');
        expect(text).toContain('fn p() -> vec2<f32> { return blink.p.xy; }');
        expect(text).toContain('fn e() -> i32 { return i32(blink.e.x); }');
        expect(text).not.toContain('fn gone()');
    });

    it('writes an accessor only for a uniform the material actually declares', () => {
        const text = program({ uniformNames: ['bl_resolution'] });

        expect(text).not.toContain('fn bl_time()');
        expect(text).not.toContain('fn au_bass()');
    });

    it('declares each texture with its sampler after the uniform buffer, two bindings apiece', () => {
        const text = program({
            textures: [
                { name: 'marker', renderTarget: false },
                { name: 'buf', renderTarget: true },
            ],
        });

        expect(text).toContain('@group(2) @binding(1) var marker: texture_2d<f32>;');
        expect(text).toContain('@group(2) @binding(2) var marker_sampler: sampler;');
        expect(text).toContain('@group(2) @binding(3) var buf: texture_2d<f32>;');
        expect(text).toContain('@group(2) @binding(4) var buf_sampler: sampler;');
    });

    // A render target is stored with its first row at the bottom in GL and at the top in WebGPU; an
    // uploaded image has its first row at coordinate 0 in both.
    it('flips the coordinate of a render target and leaves that of an uploaded texture alone', () => {
        const text = program({
            textures: [
                { name: 'marker', renderTarget: false },
                { name: 'buf', renderTarget: true },
            ],
        });

        expect(text).toContain('fn marker_uv(uv: vec2<f32>) -> vec2<f32> { return uv; }');
        expect(text).toContain('fn buf_uv(uv: vec2<f32>) -> vec2<f32> { return vec2<f32>(uv.x, 1.0 - uv.y); }');
    });

    it('gives a fragment its position with a bottom-left origin, as gl_FragCoord has', () => {
        expect(program()).toContain('return vec2<f32>(in.position.x, bl_resolution().y - in.position.y);');
    });
});
