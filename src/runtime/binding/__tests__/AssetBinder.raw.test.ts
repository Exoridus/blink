import type { Texture } from '@codexo/exojs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetBinder } from '../AssetBinder';

vi.mock('../../package', () => ({
    fetchPackageFile: (): Promise<Response> => Promise.resolve(new Response(new Blob(['bitmap']))),
}));

const asset = {
    name: 'gray',
    type: 'texture2d' as const,
    path: 'gray.png',
    sampling: { filter: 'nearest' as const, wrap: 'clamp' as const },
};

class Bitmap {
    public readonly width = 2;
    public readonly height = 2;
}

afterEach(() => vi.unstubAllGlobals());

function bitmapDecoder(): void {
    vi.stubGlobal('ImageBitmap', Bitmap);
    vi.stubGlobal('createImageBitmap', (): Promise<Bitmap> => Promise.resolve(new Bitmap()));
}

describe('compatibility asset samples', () => {
    it('keeps encoded straight RGBA storage when raw shader samples are requested', async () => {
        bitmapDecoder();
        const binder = new AssetBinder(undefined, 'raw');
        await binder.load([asset]);
        const texture = binder.get('gray') as Texture;
        expect(texture.resolvedMetadata).toMatchObject({
            storageFormat: 'rgba8',
            colorSpace: 'none',
            alphaMode: 'straight',
        });
        expect(texture.premultiplyAlpha).toBe(false);
        binder.dispose();
    });

    it('retains managed color uploads for native assets', async () => {
        bitmapDecoder();
        const binder = new AssetBinder();
        await binder.load([asset]);
        const texture = binder.get('gray') as Texture;
        expect(texture.resolvedMetadata).toMatchObject({
            storageFormat: 'rgba8-srgb',
            colorSpace: 'srgb',
            alphaMode: 'straight',
        });
        expect(texture.premultiplyAlpha).toBe(true);
        binder.dispose();
    });
});
