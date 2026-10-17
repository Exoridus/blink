import { describe, expect, it, vi } from 'vitest';

import type { BlinkSourceRef } from '../../../ir/sourceRef';
import type { BlinkRenderTargetSpec } from '../../../ir/types';
import type { CompiledPass, PassDrawContext } from '../executePasses';
import { executePasses } from '../executePasses';
import { RenderTargetPool } from '../RenderTargetPool';
import type { PassResourceStore } from '../resolvePassInput';
import { resolvePassInput } from '../resolvePassInput';

const NULL_STORE: PassResourceStore = {
    asset: () => undefined,
    hostInput: () => undefined,
    blinkAudio: () => undefined,
};

function fakeMaterial() {
    return { setUniform: vi.fn() } as unknown as import('@codexo/exojs').MeshMaterial;
}

function fakeTextureFactory() {
    return (width: number, height: number) =>
        ({ width, height, destroy: () => {} }) as unknown as import('@codexo/exojs').RenderTexture;
}

function recordingContext() {
    const calls: { kind: string; node: unknown; target?: unknown }[] = [];
    const context: PassDrawContext = {
        renderTo: (node, options) => {
            calls.push({ kind: 'renderTo', node, target: options.target });
        },
        render: node => {
            calls.push({ kind: 'render', node });
        },
        screenView: {},
    };
    return { context, calls };
}

const rt = (name: string, persistent: boolean): BlinkRenderTargetSpec => ({
    name,
    width: null,
    height: null,
    scale: 1,
    format: 'rgba8',
    persistent,
});

const CLEAR = { r: 0, g: 0, b: 0, a: 1 } as unknown as import('@codexo/exojs').Color;

const DUMMY = { id: 'dummyTexture' } as unknown as import('@codexo/exojs').RenderTexture;

describe('executePasses', () => {
    it('renders a feedback sim pass into the write texture and the screen pass to the canvas', () => {
        const pool = new RenderTargetPool([rt('fb', true)], { width: 8, height: 8 }, fakeTextureFactory());
        const simMat = fakeMaterial();
        const presentMat = fakeMaterial();
        const passes: CompiledPass[] = [
            {
                name: 'sim',
                mesh: { id: 'simMesh' } as never,
                material: simMat,
                target: { kind: 'renderTarget', name: 'fb' },
                inputs: [{ uniform: 'fb', source: { kind: 'target', name: 'fb', previous: true } }],
                clear: false,
                passIndex: 0,
            },
            {
                name: 'present',
                mesh: { id: 'presentMesh' } as never,
                material: presentMat,
                target: { kind: 'screen' },
                inputs: [{ uniform: 'fb', source: { kind: 'target', name: 'fb', previous: false } }],
                clear: true,
                passIndex: 1,
            },
        ];
        const { context, calls } = recordingContext();
        const upload = vi.fn();
        const resolveInput = (source: BlinkSourceRef, parity: number) =>
            resolvePassInput(source, pool, parity, NULL_STORE, DUMMY);

        executePasses(context, passes, pool, 0, CLEAR, upload, resolveInput, [8, 8]);

        // sim pass: uploaded, bound prev-frame fb, rendered into fb write texture
        expect(upload).toHaveBeenNthCalledWith(1, simMat, 0, [8, 8]);
        expect(simMat.setUniform).toHaveBeenCalledWith('fb', pool.read('fb', true, 0));
        expect(calls[0]).toMatchObject({ kind: 'renderTo', node: { id: 'simMesh' }, target: pool.write('fb', 0) });
        // present pass: bound current fb, rendered to screen
        expect(presentMat.setUniform).toHaveBeenCalledWith('fb', pool.read('fb', false, 0));
        expect(calls[1]).toMatchObject({ kind: 'render', node: { id: 'presentMesh' } });
    });

    it('passes clear color only when the pass clears', () => {
        const pool = new RenderTargetPool([rt('a', false)], { width: 8, height: 8 }, fakeTextureFactory());
        const passes: CompiledPass[] = [
            {
                name: 'w',
                mesh: {} as never,
                material: fakeMaterial(),
                target: { kind: 'renderTarget', name: 'a' },
                inputs: [],
                clear: true,
                passIndex: 0,
            },
        ];
        const captured: { clear?: unknown }[] = [];
        const context: PassDrawContext = {
            renderTo: (_node, options) => {
                captured.push({ clear: options.clear });
            },
            render: () => {},
            screenView: {},
        };
        executePasses(
            context,
            passes,
            pool,
            0,
            CLEAR,
            () => {},
            () => DUMMY,
            [8, 8]
        );
        expect(captured[0].clear).toBe(CLEAR);
    });

    it('uploads the render target size to a scaled pass and the screen size to the screen pass', () => {
        const half: BlinkRenderTargetSpec = {
            name: 'half',
            width: null,
            height: null,
            scale: 0.5,
            format: 'rgba8',
            persistent: false,
        };
        const pool = new RenderTargetPool([half], { width: 800, height: 600 }, fakeTextureFactory());
        const blurMat = fakeMaterial();
        const presentMat = fakeMaterial();
        const passes: CompiledPass[] = [
            {
                name: 'blur',
                mesh: {} as never,
                material: blurMat,
                target: { kind: 'renderTarget', name: 'half' },
                inputs: [],
                clear: true,
                passIndex: 0,
            },
            {
                name: 'present',
                mesh: {} as never,
                material: presentMat,
                target: { kind: 'screen' },
                inputs: [],
                clear: true,
                passIndex: 1,
            },
        ];
        const { context } = recordingContext();
        const upload = vi.fn();

        executePasses(context, passes, pool, 0, CLEAR, upload, () => DUMMY, [800, 600]);

        expect(upload).toHaveBeenNthCalledWith(1, blurMat, 0, [400, 300]);
        expect(upload).toHaveBeenNthCalledWith(2, presentMat, 1, [800, 600]);
    });
});
