import { describe, expect, it } from 'vitest';

import { buildControlGallery } from '../../../../scripts/build-control-gallery';
import { loadBlinkFx } from '../../blinkfx/loader';
import { MemoryPackageFiles } from '../../blinkfx/packageReader';
import { validatePackage } from '../../blinkfx/validatePackage';
import { convertSsfScene } from '../convert/convertSsfScene';
import { SsfScriptRuntime } from '../script/SsfScriptRuntime';

const mainGlsl = 'vec4 renderMain() { return vec4(amount, 0.25, 0.75, 1.0); }';
const source = {
    slug: 'synthetic_controls',
    sceneJson: {
        TITLE: 'Synthetic controls',
        CONTROLS: [
            { NAME: 'amount', TYPE: 'slider smooth', MIN: 0, MAX: 1, DEFAULT: 0.5, PARAMS: 0.2 },
            { NAME: 'position', TYPE: 'xy', MIN: [-1, -1], MAX: [1, 1], DEFAULT: [0, 0] },
        ],
    },
    mainGlsl,
    files: new Map([['main.glsl', new TextEncoder().encode(mainGlsl)]]),
};

describe('synthetic native control gallery', () => {
    it('retains the source controls and adds all five distinct native capabilities', () => {
        const original = convertSsfScene(source);
        const result = buildControlGallery(source);
        expect(result.manifest).toMatchObject({ id: 'com.codexo.control_gallery', title: 'Control Matrix (BlinkFX)' });
        expect(result.manifest.controls?.slice(0, 2)).toEqual(original.manifest.controls);
        expect(result.manifest.compatibility?.controls).toEqual(original.manifest.compatibility?.controls);
        expect(result.manifest.controls?.slice(2)).toMatchObject([
            { name: 'Native_Int', type: 'int', default: 4, min: 0, max: 8, step: 1 },
            { name: 'Native_Bool', type: 'bool', default: true },
            { name: 'Native_Enum', type: 'enum', default: 'Amber', options: ['Mint', 'Amber', 'Violet'] },
            { name: 'Native_RGBA', type: 'color', default: [0.2, 0.7, 1, 0.55] },
            { name: 'Native_Bang', type: 'bang' },
        ]);
        expect(result.manifest.controls?.slice(2).every(control => control.group === '08 Native BlinkFX')).toBe(true);
    });

    it('preserves every source file and the converted original visualization', () => {
        const result = buildControlGallery(source);
        for (const [path, bytes] of source.files) {
            expect(result.files.has(`source/${path}`), path).toBe(true);
            expect(
                Buffer.compare(Buffer.from(result.files.get(`source/${path}`) as Uint8Array), Buffer.from(bytes)),
                path
            ).toBe(0);
        }
        const shader = result.files.get('shaders/main.frag.glsl') as string;
        expect(shader).toContain('vec4 controlGallerySsf()');
        expect(shader).toContain('return vec4(amount, 0.25, 0.75, 1.0);');
        expect(shader).toContain('Native_RGBA.a');
        expect(shader).toContain('Native_BangCount');
        expect(shader).not.toContain('uniform float Native_Bang;');
    });

    it('declares bang telemetry as script output while retaining SSF compatibility', async () => {
        const result = buildControlGallery(source);
        expect(result.manifest.compatibility?.profile).toBe('ssf/1');
        expect(result.manifest.compatibility?.scriptUniforms?.Native_BangCount).toBe('float');
        expect(result.manifest.compatibility?.scriptUniforms?.Native_BangPulse).toBe('float');
        expect(result.manifest.script).toEqual({ entry: 'script.js', abi: 'ssf/1' });
        const encoder = new TextEncoder();
        const files = new MemoryPackageFiles(
            new Map(
                [...result.files].map(([path, content]) => [
                    path,
                    typeof content === 'string' ? encoder.encode(content) : content,
                ])
            )
        );
        expect((await validatePackage(files)).valid).toBe(true);
    });

    it('counts each native bang pulse once and lets the visual flash decay', () => {
        const result = buildControlGallery(source);
        const effect = loadBlinkFx(result.manifest, '/effects/gallery');
        const runtime = new SsfScriptRuntime({
            source: result.files.get('script.js') as string,
            nativeLifecycle: true,
            controls: effect.controls,
            surface: {
                get: (): number => 0,
                set: (): void => {
                    throw new Error('Gallery diagnostics must not mutate controls');
                },
            },
            declaredUniforms: result.manifest.compatibility?.scriptUniforms,
        });
        try {
            runtime.init(new Map([['Native_Bang', 0]]));
            expect(runtime.uniforms().Native_BangCount).toBe(0);
            expect(runtime.step({ dt: 0.1, values: new Map([['Native_Bang', 1]]) }).ok).toBe(true);
            expect(runtime.uniforms().Native_BangCount).toBe(1);
            expect(runtime.uniforms().Native_BangPulse).toBe(1);
            runtime.step({ dt: 0.1, values: new Map([['Native_Bang', 0]]) });
            expect(runtime.uniforms().Native_BangCount).toBe(1);
            expect(runtime.uniforms().Native_BangPulse).toBe(0.75);
            runtime.step({ dt: 0.1, values: new Map([['Native_Bang', 1]]) });
            expect(runtime.uniforms().Native_BangCount).toBe(2);
        } finally {
            runtime.dispose();
        }
    });
});
