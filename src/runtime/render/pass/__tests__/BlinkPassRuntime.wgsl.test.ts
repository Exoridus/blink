import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadBlinkFx } from '../../../../packages/blinkfx/loader';
import type { BlinkFxManifest } from '../../../../packages/blinkfx/manifest';

const programs = vi.hoisted(() => [] as string[]);
const materials = vi.hoisted(() => [] as { uniforms: Record<string, unknown> }[]);
const glslBuilds = vi.hoisted(() => ({ count: 0 }));

vi.mock('@codexo/exojs', () => ({
    Color: class {},
    DataTexture: class {
        public commit(): void {}
        public destroy(): void {}
    },
    TextureFormat: { Rgba8: 'rgba8' },
    ScaleModes: { Nearest: 9728, Linear: 9729, LinearMipmapLinear: 9987 },
    WrapModes: { ClampToEdge: 33071, Repeat: 10497, MirroredRepeat: 33648 },
    Mesh: class {},
    RenderTexture: class {
        public constructor(
            public readonly width: number,
            public readonly height: number
        ) {}
        public destroy(): void {}
    },
    Shader: class {
        public constructor(public readonly options: { wgsl: string }) {
            programs.push(options.wgsl);
        }
    },
    MeshMaterial: {
        from: (source: unknown, second: unknown, third?: { uniforms: Record<string, unknown> }) => {
            const options = (third ?? second) as { uniforms: Record<string, unknown> };
            if (typeof source === 'string') glslBuilds.count++;
            const material = { uniforms: options.uniforms, destroy: () => undefined };
            materials.push(material);
            return material;
        },
    },
}));

const { BlinkPassRuntime } = await import('../BlinkPassRuntime');

const manifest = {
    format: 'blinkfx/1',
    id: 'com.test.wgsl',
    title: 'Wgsl',
    controls: [{ name: 'amount', type: 'float', default: 0.5, min: 0, max: 1 }],
    assets: [{ name: 'marker', type: 'texture2d', path: 'assets/marker.png' }],
    shaders: { wgsl: { write: 'shaders/write.wgsl', present: 'shaders/present.wgsl' } },
    passes: [
        {
            name: 'write',
            shader: 'write',
            inputs: [{ source: 'asset.marker', uniform: 'marker' }],
            target: { name: 'buf', persistent: false },
            clear: true,
        },
        { name: 'present', shader: 'present', inputs: ['buf'], target: 'screen', clear: true },
    ],
} as unknown as BlinkFxManifest;

function build(language: 'wgsl' | 'glsl'): void {
    new BlinkPassRuntime().build(
        loadBlinkFx(manifest, 'effects/wgsl.blinkfx'),
        new Map([
            ['write', 'WRITE_PROGRAM'],
            ['present', 'PRESENT_PROGRAM'],
        ]),
        {
            screen: { width: 8, height: 8 },
            supportsFormat: () => true,
            frameUniforms: { TIME: 0, bl_time: 0, bl_resolution: new Float32Array(2) },
            language,
        }
    );
}

describe('BlinkPassRuntime on WebGPU', () => {
    beforeEach(() => {
        programs.length = 0;
        materials.length = 0;
        glslBuilds.count = 0;
    });

    it("builds one WGSL module per pass from that pass's own program and textures", () => {
        build('wgsl');

        expect(programs).toHaveLength(2);
        expect(programs[0]).toContain('WRITE_PROGRAM');
        expect(programs[0]).not.toContain('PRESENT_PROGRAM');
        expect(programs[1]).toContain('PRESENT_PROGRAM');
        expect(glslBuilds.count).toBe(0);
    });

    it('declares to each module exactly the textures its pass binds, a render target flipped and an asset not', () => {
        build('wgsl');

        expect(programs[0]).toContain('var marker: texture_2d<f32>');
        expect(programs[0]).not.toContain('var buf:');
        expect(programs[0]).toContain('fn marker_uv(uv: vec2<f32>) -> vec2<f32> { return uv; }');
        expect(programs[1]).toContain('var buf: texture_2d<f32>');
        expect(programs[1]).toContain('fn buf_uv(uv: vec2<f32>) -> vec2<f32> { return vec2<f32>(uv.x, 1.0 - uv.y); }');
    });

    // The engine's packed layout is positional, so the struct must list the uniforms in the order the
    // material's schema was declared in, which is the order of the record the material is built from.
    it("lists the module's uniform slots in the order of the material's schema", () => {
        build('wgsl');

        const slots = (text: string): string[] =>
            text.slice(text.indexOf('struct BlinkUniforms'), text.indexOf('};')).match(/\w+(?=: vec4<f32>)/g) ?? [];
        const scalars = (index: number): string[] =>
            Object.keys(materials[index].uniforms).filter(name => !['marker', 'buf'].includes(name));
        expect(slots(programs[0])).toEqual(scalars(0));
        expect(slots(programs[1])).toEqual(scalars(1));
    });

    it('still builds GLSL when asked to, or when not asked', () => {
        build('glsl');

        expect(programs).toHaveLength(0);
        expect(glslBuilds.count).toBe(2);
    });
});
