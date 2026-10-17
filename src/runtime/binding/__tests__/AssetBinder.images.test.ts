import { describe, expect, it, vi } from 'vitest';

const texture = vi.hoisted(() => vi.fn());
vi.mock('@codexo/exojs', async importOriginal => {
    const actual = await importOriginal<typeof import('@codexo/exojs')>();
    return {
        ...actual,
        Texture: class {
            constructor(source: unknown, options: unknown) {
                texture(source, options);
            }
        },
    };
});
vi.mock('../../package', () => ({
    fetchPackageFile: (): Promise<Response> => Promise.resolve(new Response(new Blob(['image']))),
}));

import { AssetBinder } from '../AssetBinder';

const asset = {
    name: 'guide',
    type: 'texture2d' as const,
    path: 'guide.png',
    sampling: { filter: 'linear' as const, wrap: 'clamp' as const },
};

describe('asset bitmap orientation', () => {
    it('uses bottom-first image rows and straight unchanged color bytes by default for BlinkFX assets', async () => {
        const decode = vi.fn().mockResolvedValue({ width: 2, height: 2 });
        vi.stubGlobal('createImageBitmap', decode);
        try {
            await new AssetBinder().load([asset]);
            expect(decode).toHaveBeenCalledWith(expect.any(Blob), {
                imageOrientation: 'flipY',
                premultiplyAlpha: 'none',
                colorSpaceConversion: 'none',
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
