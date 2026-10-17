import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadBlinkFx } from '../../../../packages/blinkfx/loader';
import type { BlinkFxManifest } from '../../../../packages/blinkfx/manifest';

const created = vi.hoisted(() => [] as { uniforms: Record<string, unknown> }[]);

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
    MeshMaterial: {
        from: (_vertex: string, _fragment: string, options: { uniforms: Record<string, unknown> }) => {
            const material = { uniforms: options.uniforms, destroy: () => undefined };
            created.push(material);
            return material;
        },
    },
}));

const { BlinkPassRuntime } = await import('../BlinkPassRuntime');

const manifest: BlinkFxManifest = {
    format: 'blinkfx/1',
    id: 'com.test.schema',
    title: 'Schema',
    shaders: { glsl: 'shaders/main.frag.glsl' },
    controls: [{ name: 'amount', type: 'float', default: 0.5, min: 0, max: 1 }],
    passes: [
        { name: 'write', shader: 'main', target: { name: 'buf', persistent: false }, clear: true },
        { name: 'present', shader: 'main', inputs: ['buf'], target: 'screen', clear: true },
    ],
} as unknown as BlinkFxManifest;

function build(fragment: string): InstanceType<typeof BlinkPassRuntime> {
    const runtime = new BlinkPassRuntime();
    runtime.build(loadBlinkFx(manifest, 'effects/schema.blinkfx'), new Map([['main', fragment]]), {
        screen: { width: 8, height: 8 },
        supportsFormat: () => true,
        frameUniforms: { bl_time: 0, TIME: 0 },
    });
    return runtime;
}

describe('BlinkPassRuntime material schema', () => {
    beforeEach(() => {
        created.length = 0;
    });

    it('declares the host scalars and the control defaults on every pass', () => {
        build('void main() { fragColor = vec4(1.0); }');

        expect(created).toHaveLength(2);
        for (const material of created) {
            expect(Object.keys(material.uniforms)).toEqual(expect.arrayContaining(['bl_time', 'TIME', 'amount']));
        }
    });

    it('declares only the textures a pass binds, so the seven-texture limit is not spent on unused samplers', () => {
        build('void main() { fragColor = vec4(1.0); }');

        expect(Object.keys(created[0].uniforms)).not.toContain('buf');
        expect(Object.keys(created[1].uniforms)).toContain('buf');
    });

    it('reports a name as declared for the material that holds it and no other', () => {
        const runtime = build('void main() { fragColor = vec4(1.0); }');
        const [write, present] = created as unknown as Parameters<typeof runtime.isDeclared>[0][];

        expect(runtime.isDeclared(present, 'buf')).toBe(true);
        expect(runtime.isDeclared(write, 'buf')).toBe(false);
        expect(runtime.isDeclared(present, 'never_declared')).toBe(false);
    });
});
