import { describe, expect, it, vi } from 'vitest';

import { AssetBinder } from '../AssetBinder';

const spec = (name: string, filter: 'nearest' | 'linear' | 'mipmap' = 'linear') => ({
    name,
    type: 'texture2d' as const,
    path: `assets/${name}.png`,
    sampling: { filter, wrap: 'repeat' as const },
});

describe('AssetBinder', () => {
    it('loads each declared asset once and exposes it by name', async () => {
        const create = vi.fn((path: string) => ({ path, destroy: vi.fn() }) as never);
        const binder = new AssetBinder(create);

        await binder.load([spec('noise'), spec('grad')]);

        expect(create).toHaveBeenCalledTimes(2);
        expect(binder.get('noise')).toMatchObject({ path: 'assets/noise.png' });
        expect(binder.get('missing')).toBeUndefined();
    });

    it('passes the declared sampling state to the texture factory', async () => {
        const create = vi.fn(() => ({ destroy: vi.fn() }) as never);
        await new AssetBinder(create).load([spec('noise', 'nearest')]);
        expect(create).toHaveBeenCalledWith('assets/noise.png', { filter: 'nearest', wrap: 'repeat' });
    });

    it('destroys every texture on dispose and forgets them', async () => {
        const destroy = vi.fn();
        const binder = new AssetBinder(() => ({ destroy }) as never);
        await binder.load([spec('noise')]);

        binder.dispose();

        expect(destroy).toHaveBeenCalledTimes(1);
        expect(binder.get('noise')).toBeUndefined();
    });

    it('destroys textures that already resolved when a sibling asset fails to load', async () => {
        const goodDestroy = vi.fn();
        const create = vi.fn((path: string) =>
            path.includes('bad')
                ? Promise.reject(new Error(`decode failed: ${path}`))
                : Promise.resolve({ path, destroy: goodDestroy } as never)
        );
        const binder = new AssetBinder(create);

        await expect(binder.load([spec('good'), spec('bad')])).rejects.toThrow('decode failed: assets/bad.png');

        expect(goodDestroy).toHaveBeenCalledTimes(1);
        expect(binder.get('good')).toBeUndefined();
    });
});
