import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryPackageFiles, writePackageArchive } from '../../packages/blinkfx/packageReader';
import { BlinkFxService } from '../BlinkFxService';
import { installedPackageRoot, InstalledPackageService } from '../InstalledPackageService';
import { MemoryPackageStore } from '../PackageStore';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const PLASMA_MANIFEST = {
    format: 'blinkfx/1',
    id: 'com.codexo.plasma',
    title: 'Plasma',
    description: 'Bundled plasma.',
    shaders: { glsl: 'shaders/main.frag.glsl' },
};

function archive(id: string, title: string): Uint8Array {
    const manifest = {
        format: 'blinkfx/1',
        id,
        title,
        description: `${title} effect`,
        shaders: { glsl: 'main.frag.glsl' },
    };
    return writePackageArchive(
        new MemoryPackageFiles(
            new Map([
                ['manifest.json', encode(JSON.stringify(manifest))],
                ['main.frag.glsl', encode('void main() {}')],
            ])
        )
    );
}

function stubCatalog(): void {
    vi.stubGlobal('fetch', (url: string | URL | Request) => {
        const path = typeof url === 'string' ? url : url.toString();
        const body = path.includes('catalog.json')
            ? { packages: ['/effects/plasma.blinkfx/manifest.json'] }
            : PLASMA_MANIFEST;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    });
}

describe('BlinkFxService with installed packages', () => {
    let service: BlinkFxService;

    beforeEach(() => {
        vi.unstubAllGlobals();
        stubCatalog();
        service = new BlinkFxService(new InstalledPackageService(new MemoryPackageStore()));
    });

    it('lists an installed package after the bundled ones, marked as installed', async () => {
        await service.installPackage(archive('com.test.mine', 'Mine'));

        const list = await service.getPackageList();

        expect(list.map(item => item.id)).toEqual(['com.codexo.plasma', 'com.test.mine']);
        expect(list[0].installed).toBeUndefined();
        expect(list[1]).toEqual({
            id: 'com.test.mine',
            title: 'Mine',
            description: 'Mine effect',
            basePath: installedPackageRoot('com.test.mine'),
            installed: true,
        });
    });

    it('loads an installed package from its archive, not from the network', async () => {
        await service.installPackage(archive('com.test.mine', 'Mine'));

        const effect = await service.loadPackage('com.test.mine');

        expect(effect.metadata.title).toBe('Mine');
        expect(effect.packageRoot).toBe(installedPackageRoot('com.test.mine'));
    });

    it('refuses to install over a bundled effect', async () => {
        await expect(service.installPackage(archive('com.codexo.plasma', 'Imposter'))).rejects.toThrow(/bundled/);

        expect((await service.getPackageList()).map(item => item.title)).toEqual(['Plasma']);
    });

    it('removes an installed package, and refuses to remove a bundled one', async () => {
        await service.installPackage(archive('com.test.mine', 'Mine'));

        await service.removePackage('com.test.mine');
        await expect(service.removePackage('com.codexo.plasma')).rejects.toThrow(/bundled/);

        expect((await service.getPackageList()).map(item => item.id)).toEqual(['com.codexo.plasma']);
    });

    it('keeps the bundled effects working when the installed ones cannot be read', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const broken = new MemoryPackageStore();
        broken.list = (): Promise<never> => Promise.reject(new Error('storage blocked'));
        const withBrokenStore = new BlinkFxService(new InstalledPackageService(broken));

        expect((await withBrokenStore.getPackageList()).map(item => item.id)).toEqual(['com.codexo.plasma']);
        expect(warn).toHaveBeenCalled();
    });

    it('says so when this build has no installer', async () => {
        const plain = new BlinkFxService();

        await expect(plain.installPackage(archive('com.test.mine', 'Mine'))).rejects.toThrow(/cannot install/);
    });
});
