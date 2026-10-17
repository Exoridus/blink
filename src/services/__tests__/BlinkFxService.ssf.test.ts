import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchPackageFile, isPackageMounted, unmountPackage } from '../../runtime/package/packageMount';
import { BlinkFxService } from '../BlinkFxService';

const root = '/effects/indicators_ssf.synScene';
const entry = {
    id: 'com.codexo.ssf.indicators_ssf',
    title: 'Indicators (SSF)',
    description: 'Original scene',
    collection: 'builtin',
    scene: `${root}/scene.json`,
    files: ['scene.json', 'main.glsl', 'script.js', 'images/noise.png'],
};
const source = new Map([
    [
        'scene.json',
        '{"TITLE":"Indicators (SSF)","PASSES":[{"TARGET":"feedback","FLOAT":true},{"TARGET":"helper","FLOAT":true}],"IMAGES":[{"NAME":"noise","PATH":"images/noise.png"}]}',
    ],
    [
        'main.glsl',
        'vec4 renderMain() { if (PASSINDEX == 0) return texture(helper, _uv) + vec4(tracker); return texture(feedback, _uv) + texture(noise, _uv); }',
    ],
    ['script.js', 'var level = 0; function update(dt) { level += inputs.syn_InputLevel; uniforms.tracker = level; }'],
    ['images/noise.png', 'image-bytes'],
]);

function stub(entries: unknown[] = [entry], missing?: string): void {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
            if (url.endsWith('catalog.json')) return new Response(JSON.stringify({ packages: entries }));
            const name = url.slice(root.length + 1);
            const body = name === missing ? undefined : source.get(name);
            return new Response(body ?? null, { status: body === undefined ? 404 : 200 });
        })
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
    unmountPackage(root);
});

describe('bundled SSF scenes', () => {
    it('lists SSF metadata without fetching all scene assets', async () => {
        stub();
        const list = await new BlinkFxService().getPackageList();
        expect(list).toMatchObject([{ id: entry.id, title: entry.title, basePath: root, sourceCollection: 'builtin' }]);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('uses static preview metadata and refreshes it with the catalog', async () => {
        let image = 'effects/previews/indicators-a.png';
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) =>
                Promise.resolve(
                    new Response(
                        JSON.stringify(
                            url.endsWith('previews/manifest.json')
                                ? { version: 1, previews: { [entry.id]: { path: image, fingerprint: 'a' } } }
                                : { packages: [entry] }
                        )
                    )
                )
            )
        );
        const service = new BlinkFxService();
        expect(await service.getPackageList()).toMatchObject([{ previewUrl: '/effects/previews/indicators-a.png' }]);
        image = 'effects/previews/indicators-b.png';
        expect(await service.getPackageList()).toMatchObject([{ previewUrl: '/effects/previews/indicators-a.png' }]);
        expect(await service.reloadPackageList()).toMatchObject([{ previewUrl: '/effects/previews/indicators-b.png' }]);
    });

    it.each(['../secret.png', 'effects/previews/%2e%2e/secret.png', 'https://example.com/preview.png'])(
        'ignores unsafe preview paths (%s) and keeps effects selectable',
        async path => {
            vi.stubGlobal(
                'fetch',
                vi.fn((url: string) =>
                    Promise.resolve(
                        new Response(
                            JSON.stringify(
                                url.endsWith('previews/manifest.json')
                                    ? { version: 1, previews: { [entry.id]: { path } } }
                                    : { packages: [entry] }
                            )
                        )
                    )
                )
            );
            const list = await new BlinkFxService().getPackageList();
            expect(list).toMatchObject([{ id: entry.id }]);
            expect(list[0].previewUrl).toBeUndefined();
        }
    );

    it('times out optional preview metadata while retaining the available catalog', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string, options?: RequestInit) => {
                if (!url.endsWith('previews/manifest.json'))
                    return Promise.resolve(new Response(JSON.stringify({ packages: [entry] })));
                return new Promise<Response>((_resolve, reject) => {
                    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
                });
            })
        );
        try {
            const listing = new BlinkFxService().getPackageList();
            await vi.advanceTimersByTimeAsync(3000);
            expect(await listing).toMatchObject([{ id: entry.id }]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('reloads the catalog after a cached list and retries a failed refresh', async () => {
        stub();
        const service = new BlinkFxService();
        await service.getPackageList();
        stub([{ ...entry, title: 'Updated' }]);
        expect(await service.reloadPackageList()).toMatchObject([{ title: 'Updated' }]);
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        await expect(service.reloadPackageList()).rejects.toThrow('offline');
        expect(await service.getPackageList()).toMatchObject([{ title: 'Updated' }]);
        stub([{ ...entry, title: 'Recovered' }]);
        expect(await service.reloadPackageList()).toMatchObject([{ title: 'Recovered' }]);
    });

    it('converts the original shader, script, assets and previous-frame passes on load', async () => {
        stub();
        const service = new BlinkFxService();
        const effect = await service.loadPackage(entry.id);
        expect(effect.metadata.title).toBe(entry.title);
        expect(effect.passes).toHaveLength(3);
        expect(effect.script?.abi).toBe('ssf/1');
        expect(effect.compatibility?.mode).toBe('preserve');
        expect(await (await fetchPackageFile(`${root}/script.js`)).text()).toBe(source.get('script.js'));
        const shader = await (await fetchPackageFile(`${root}/shaders/main.frag.glsl`)).text();
        expect(shader).toContain('uniform float tracker;');
        expect(await (await fetchPackageFile(`${root}/assets/noise.png`)).text()).toBe('image-bytes');
        service.releasePackage(entry.id);
        expect(isPackageMounted(root)).toBe(false);
    });

    it('rejects incomplete scenes before mounting a converted package', async () => {
        stub([entry], 'script.js');
        await expect(new BlinkFxService().loadPackage(entry.id)).rejects.toThrow('script.js');
        expect(isPackageMounted(root)).toBe(false);
    });

    it('rejects file inventories that escape the scene directory', async () => {
        stub([{ ...entry, files: ['scene.json', '../secret'] }]);
        await expect(new BlinkFxService().loadPackage(entry.id)).rejects.toThrow('outside');
        expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('secret'));
    });

    it('reports converter errors without mounting an incomplete shader', async () => {
        stub();
        const previous = source.get('main.glsl')!;
        source.set('main.glsl', '#include "missing.glsl"\nvec4 renderMain() { return vec4(1.0); }');
        try {
            await expect(new BlinkFxService().loadPackage(entry.id)).rejects.toThrow('missing.glsl');
            expect(isPackageMounted(root)).toBe(false);
        } finally {
            source.set('main.glsl', previous);
        }
    });
});
