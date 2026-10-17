import { describe, expect, it } from 'vitest';

import type { BlinkRenderTargetSpec } from '../../../ir/types';
import { computePassDiagnostics } from '../passDiagnostics';
import { RenderTargetPool } from '../RenderTargetPool';

const rt = (name: string, format: BlinkRenderTargetSpec['format'] = 'rgba8'): BlinkRenderTargetSpec => ({
    name,
    width: null,
    height: null,
    scale: 1,
    format,
    persistent: false,
});

function fakeTextureFactory() {
    return (width: number, height: number) =>
        ({ width, height, destroy: () => {} }) as unknown as import('@codexo/exojs').RenderTexture;
}

describe('computePassDiagnostics', () => {
    it('reports a render-target pass at the pool-allocated resolution and declared format', () => {
        const pool = new RenderTargetPool([rt('feedback', 'rgba16f')], { width: 16, height: 8 }, fakeTextureFactory());
        const passes = [{ name: 'sim', target: { kind: 'renderTarget' as const, name: 'feedback' } }];

        const result = computePassDiagnostics(passes, pool, [16, 8], [rt('feedback', 'rgba16f')]);

        expect(result).toEqual([{ name: 'sim', resolution: [16, 8], format: 'rgba16f' }]);
    });

    it('reports the screen pass at the screen size with format "screen"', () => {
        const pool = new RenderTargetPool([], { width: 16, height: 8 }, fakeTextureFactory());
        const passes = [{ name: 'present', target: { kind: 'screen' as const } }];

        const result = computePassDiagnostics(passes, pool, [16, 8], []);

        expect(result).toEqual([{ name: 'present', resolution: [16, 8], format: 'screen' }]);
    });

    it('preserves pass order across a mixed graph', () => {
        const pool = new RenderTargetPool([rt('a'), rt('b')], { width: 4, height: 4 }, fakeTextureFactory());
        const passes = [
            { name: 'first', target: { kind: 'renderTarget' as const, name: 'a' } },
            { name: 'second', target: { kind: 'renderTarget' as const, name: 'b' } },
            { name: 'third', target: { kind: 'screen' as const } },
        ];

        const result = computePassDiagnostics(passes, pool, [4, 4], [rt('a'), rt('b')]);

        expect(result.map(entry => entry.name)).toEqual(['first', 'second', 'third']);
    });

    it('throws when a pass targets a render target not in the declared list', () => {
        const pool = new RenderTargetPool([rt('a')], { width: 4, height: 4 }, fakeTextureFactory());
        const passes = [{ name: 'orphan', target: { kind: 'renderTarget' as const, name: 'missing' } }];

        expect(() => computePassDiagnostics(passes, pool, [4, 4], [rt('a')])).toThrow(
            /undeclared render target "missing"/
        );
    });
});
