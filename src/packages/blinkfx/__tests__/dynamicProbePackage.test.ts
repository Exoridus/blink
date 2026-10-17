/**
 * Slice-4 acceptance test: the shipped `dynamic_probe.blinkfx` package sizes a render target with
 * an expression, supplies a vertex stage and pulls a package-local include. Everything up to the
 * GPU boundary is checked: the loaded IR, the text handed to the shader compiler, the allocated
 * target sizes and the capability verdict.
 */
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { resolveCapabilities } from '../../../runtime/capability/resolveCapabilities';
import type { BlinkEffectIR } from '../../../runtime/ir/types';
import { buildVertexSource } from '../../../runtime/render/pass/buildVertexSource';
import { RenderTargetPool } from '../../../runtime/render/pass/RenderTargetPool';
import { resolveVisualShader } from '../../../runtime/shader/resolveShaderText';
import { loadBlinkFx } from '../loader';
import type { BlinkFxManifest } from '../manifest';
import { validateBlinkFxManifest } from '../validate';

const PACKAGE_DIR = 'public/effects/dynamic_probe.blinkfx';
const BASE_PATH = 'effects/dynamic_probe.blinkfx';

const loadIr = async (): Promise<BlinkEffectIR> => {
    const raw: unknown = JSON.parse(await readFile(`${PACKAGE_DIR}/manifest.json`, 'utf8'));
    expect(validateBlinkFxManifest(raw)).toEqual({ valid: true });
    return loadBlinkFx(raw as BlinkFxManifest, BASE_PATH);
};

const fetchFromDisk = (url: string): Promise<string> => readFile(url.replace(BASE_PATH, PACKAGE_DIR), 'utf8');

const fakeTexture = (width: number, height: number): never => ({ width, height, destroy: () => {} }) as never;

describe('dynamic_probe.blinkfx', () => {
    it('keeps the target size as an expression and the vertex stage as a separate source', async () => {
        const ir = await loadIr();
        const [low] = ir.renderTargets;

        expect(low.name).toBe('low');
        expect(typeof low.width).toBe('object');
        expect(ir.shaders.glsl.main.vertex?.path).toBe(`${BASE_PATH}/shaders/main.vert.glsl`);
        expect(ir.packageRoot).toBe(BASE_PATH);
    });

    it('needs dynamic-target-size without declaring it, and runs where the runtime provides it', async () => {
        const ir = await loadIr();
        const without = resolveCapabilities(ir, { backend: 'webgl2', features: new Set() });
        expect(without.failures.map(f => f.feature)).toEqual(['dynamic-target-size']);

        const withFeature = resolveCapabilities(ir, { backend: 'webgl2', features: new Set(['dynamic-target-size']) });
        expect(withFeature.failures).toEqual([]);
    });

    it('expands the include in the fragment stage and wraps the vertex stage with the controls it reads', async () => {
        const ir = await loadIr();

        const { fragment, vertex } = await resolveVisualShader(ir.shaders.glsl.main, ir.packageRoot, fetchFromDisk);

        expect(fragment).toContain('float stripes(vec2 uv, float count)');
        expect(fragment).not.toContain('#include');
        expect(vertex).not.toBeNull();

        const vertexSource = buildVertexSource(vertex!, ir.controls);
        expect(vertexSource).toContain('uniform float wobble;');
        expect(vertexSource).toContain('uniform float bl_time;');
        expect(vertexSource).toContain('out vec2 v_uv;');
    });

    it('sizes the target from the screen and follows the resolution control', async () => {
        const ir = await loadIr();
        const pool = new RenderTargetPool(
            ir.renderTargets,
            { width: 1920, height: 1080 },
            fakeTexture,
            undefined,
            undefined,
            {
                controls: { resolution: 0.25 },
            }
        );

        expect(pool.size('low')).toEqual([480, 270]);

        expect(pool.updateControls({ resolution: 0.5 })).toEqual(['low']);
        expect(pool.size('low')).toEqual([960, 540]);

        pool.resize(1280, 720);
        expect(pool.size('low')).toEqual([640, 360]);

        pool.updateControls({ resolution: 0.001 });
        expect(pool.size('low')).toEqual([16, 16]);
    });
});
