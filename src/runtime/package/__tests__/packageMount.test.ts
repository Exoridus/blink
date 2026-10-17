import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemoryPackageFiles } from '../../../packages/blinkfx/packageReader';
import { fetchPackageFile, isPackageMounted, mountPackage, unmountPackage } from '../packageMount';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const files = new MemoryPackageFiles(
    new Map([
        ['shaders/main.frag.glsl', encode('void main() {}')],
        ['manifest.json', encode('{}')],
        ['assets/noise.png', new Uint8Array([137, 80, 78, 71])],
    ])
);

describe('fetchPackageFile', () => {
    afterEach(() => {
        unmountPackage('blinkfx-installed/test');
        vi.restoreAllMocks();
    });

    it('answers a path under a mounted root from memory, with a content type', async () => {
        mountPackage('blinkfx-installed/test', files);

        const response = await fetchPackageFile('blinkfx-installed/test/shaders/main.frag.glsl');

        expect(response.ok).toBe(true);
        expect(await response.text()).toBe('void main() {}');
        expect(response.headers.get('Content-Type')).toBe('text/plain');
        expect((await fetchPackageFile('blinkfx-installed/test/assets/noise.png')).headers.get('Content-Type')).toBe(
            'image/png'
        );
    });

    it('answers 404 for a file the package does not hold, without falling through to the network', async () => {
        const network = vi.spyOn(globalThis, 'fetch');
        mountPackage('blinkfx-installed/test', files);

        const response = await fetchPackageFile('blinkfx-installed/test/shaders/missing.glsl');

        expect(response.status).toBe(404);
        expect(network).not.toHaveBeenCalled();
    });

    it('answers 404 for a path that climbs out of the package', async () => {
        const network = vi.spyOn(globalThis, 'fetch');
        mountPackage('blinkfx-installed/test', files);

        const response = await fetchPackageFile('blinkfx-installed/test/../other/manifest.json');

        expect(response.status).toBe(404);
        expect(network).not.toHaveBeenCalled();
    });

    it('does not treat a longer name that merely starts with the root as part of the package', async () => {
        const network = vi.spyOn(globalThis, 'fetch');
        mountPackage('blinkfx-installed/test', files);

        const response = await fetchPackageFile('blinkfx-installed/test2/manifest.json');

        expect(response.status).toBe(404);
        expect(network).not.toHaveBeenCalled();
    });

    it('answers 404 for an installed-package path that is not mounted instead of asking the network', async () => {
        const network = vi.spyOn(globalThis, 'fetch');

        const response = await fetchPackageFile('blinkfx-installed/gone/shaders/main.frag.glsl');

        expect(response.status).toBe(404);
        expect(network).not.toHaveBeenCalled();
    });

    it('goes to the network for anything not mounted', async () => {
        const network = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('net'));
        mountPackage('blinkfx-installed/test', files);
        expect(isPackageMounted('blinkfx-installed/test')).toBe(true);

        await fetchPackageFile('effects/aurora.blinkfx/manifest.json');
        unmountPackage('blinkfx-installed/test');

        expect(isPackageMounted('blinkfx-installed/test')).toBe(false);
        expect(network).toHaveBeenCalledTimes(1);
    });

    it('serves what a re-mount replaced it with', async () => {
        mountPackage('blinkfx-installed/test', files);
        mountPackage('blinkfx-installed/test', new MemoryPackageFiles(new Map([['manifest.json', encode('{"v":2}')]])));

        expect(await (await fetchPackageFile('blinkfx-installed/test/manifest.json')).text()).toBe('{"v":2}');
    });
});
