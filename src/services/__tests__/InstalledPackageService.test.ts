import { describe, expect, it } from 'vitest';

import { MemoryPackageFiles, writePackageArchive } from '../../packages/blinkfx/packageReader';
import { fetchPackageFile } from '../../runtime/package';
import { resolveVisualShader } from '../../runtime/shader/resolveShaderText';
import { installedPackageRoot, InstalledPackageService, PackageInstallError } from '../InstalledPackageService';
import { MemoryPackageStore } from '../PackageStore';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** A valid package archive; `padding` makes it larger without changing what it is. */
function archive(
    id: string,
    options: { title?: string; shader?: string; padding?: number; extra?: Record<string, string> } = {}
): Uint8Array {
    const manifest = {
        format: 'blinkfx/1',
        id,
        title: options.title ?? id,
        description: `The ${id} effect`,
        shaders: { glsl: { main: 'shaders/main.frag.glsl' } },
    };
    const entries = new Map<string, Uint8Array>([
        ['manifest.json', encode(JSON.stringify(manifest))],
        ['shaders/main.frag.glsl', encode(options.shader ?? 'void main() {}')],
    ]);
    for (const [path, text] of Object.entries(options.extra ?? {})) entries.set(path, encode(text));
    if (options.padding !== undefined) {
        // Random bytes do not deflate, so the archive really grows by this much.
        const noise = new Uint8Array(options.padding);
        for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
        entries.set('assets/padding.bin', noise);
    }
    return writePackageArchive(new MemoryPackageFiles(entries));
}

function service(options: { maxBytes?: number } = {}): {
    installed: InstalledPackageService;
    store: MemoryPackageStore;
    tick: () => void;
} {
    const store = new MemoryPackageStore();
    let time = 1000;
    const installed = new InstalledPackageService(store, { ...options, now: () => time });
    return {
        installed,
        store,
        tick: () => {
            time += 10;
        },
    };
}

describe('InstalledPackageService', () => {
    it('installs a valid archive and lists it', async () => {
        const { installed } = service();

        const info = await installed.install(archive('com.test.one', { title: 'One' }));

        expect(info).toMatchObject({
            id: 'com.test.one',
            title: 'One',
            description: 'The com.test.one effect',
            version: null,
        });
        expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(await installed.list()).toEqual([info]);
    });

    it('rejects bytes that are not an archive', async () => {
        const { installed } = service();

        await expect(installed.install(encode('not a zip'))).rejects.toBeInstanceOf(PackageInstallError);
        expect(await installed.list()).toEqual([]);
    });

    it('rejects a package that does not validate, saying why, and installs nothing', async () => {
        const { installed } = service();
        const broken = writePackageArchive(
            new MemoryPackageFiles(
                new Map([
                    [
                        'manifest.json',
                        encode(
                            JSON.stringify({
                                format: 'blinkfx/1',
                                id: 'com.test.broken',
                                title: 'Broken',
                                shaders: { glsl: 'missing.glsl' },
                            })
                        ),
                    ],
                ])
            )
        );

        const failure = await installed.install(broken).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(PackageInstallError);
        expect((failure as PackageInstallError).message).toContain('missing.glsl');
        expect((failure as PackageInstallError).findings.length).toBeGreaterThan(0);
        expect(await installed.list()).toEqual([]);
    });

    it('rejects an id the caller reserves', async () => {
        const { installed } = service();

        await expect(
            installed.install(archive('com.codexo.aurora'), {
                isReserved: id => Promise.resolve(id === 'com.codexo.aurora'),
            })
        ).rejects.toThrow(/bundled/);
        expect(await installed.list()).toEqual([]);
    });

    it('only refreshes the cache position when the same archive is installed again', async () => {
        const { installed, store, tick } = service();
        const bytes = archive('com.test.one');
        const first = await installed.install(bytes);
        tick();

        const second = await installed.install(bytes);

        expect(second.sha256).toBe(first.sha256);
        expect(second.installedAt).toBe(first.installedAt);
        expect(second.lastUsedAt).toBeGreaterThan(first.lastUsedAt);
        expect(await store.list()).toHaveLength(1);
    });

    it('replaces the package when a different archive uses the same id', async () => {
        const { installed } = service();
        await installed.install(archive('com.test.one', { title: 'Old' }));

        await installed.install(archive('com.test.one', { title: 'New' }));

        expect(await installed.list()).toMatchObject([{ id: 'com.test.one', title: 'New' }]);
    });

    it('opens an installed package as an effect whose files are served from memory', async () => {
        const { installed } = service();
        await installed.install(archive('com.test.one', { shader: 'void main() { /* mine */ }' }));

        const effect = await installed.open('com.test.one');

        expect(effect.metadata.id).toBe('com.test.one');
        expect(effect.packageRoot).toBe(installedPackageRoot('com.test.one'));
        const shader = await resolveVisualShader(effect.shaders.glsl.main, effect.packageRoot, async path =>
            (await fetchPackageFile(path)).text()
        );
        expect(shader.fragment).toContain('/* mine */');
    });

    it('expands a package-local include from the archive', async () => {
        const { installed } = service();
        await installed.install(
            archive('com.test.inc', {
                shader: '#include "lib/common.glsl"\nvoid main() {}',
                extra: { 'shaders/lib/common.glsl': 'float shared() { return 1.0; }' },
            })
        );

        const effect = await installed.open('com.test.inc');
        // The include sits beside the shader, so it resolves to shaders/lib/common.glsl.
        const shader = await resolveVisualShader(effect.shaders.glsl.main, effect.packageRoot, async path =>
            (await fetchPackageFile(path)).text()
        );

        expect(shader.fragment).toContain('float shared()');
    });

    it('serves the new content after a replace, not the old mount', async () => {
        const { installed } = service();
        await installed.install(archive('com.test.one', { shader: 'void main() { /* v1 */ }' }));
        await installed.open('com.test.one');

        await installed.install(archive('com.test.one', { shader: 'void main() { /* v2 */ }' }));
        const effect = await installed.open('com.test.one');

        const shader = await resolveVisualShader(effect.shaders.glsl.main, effect.packageRoot, async path =>
            (await fetchPackageFile(path)).text()
        );
        expect(shader.fragment).toContain('/* v2 */');
    });

    it('does not open what is not installed', async () => {
        const { installed } = service();

        await expect(installed.open('com.test.nothing')).rejects.toThrow(/not found/);
    });

    it('refuses to open a package whose stored archive was damaged', async () => {
        const { installed, store } = service();
        const info = await installed.install(archive('com.test.one'));
        await store.write({ ...info, sha256: 'changed' }, encode('garbage'));

        await expect(installed.open('com.test.one')).rejects.toBeInstanceOf(PackageInstallError);
    });

    it('removes a package and stops serving its files', async () => {
        const { installed } = service();
        await installed.install(archive('com.test.one'));
        await installed.open('com.test.one');

        await installed.remove('com.test.one');

        expect(await installed.list()).toEqual([]);
        await expect(installed.open('com.test.one')).rejects.toThrow(/not found/);
        const root = installedPackageRoot('com.test.one');
        expect(
            (await fetchPackageFile(`${root}/manifest.json`).catch(() => new Response(null, { status: 599 }))).ok
        ).toBe(false);
    });

    it('evicts the least recently used package when the cache is over its limit', async () => {
        const first = archive('com.test.first', { padding: 3000 });
        const { installed, tick } = service({ maxBytes: first.byteLength * 2 + 500 });
        await installed.install(first);
        tick();
        await installed.install(archive('com.test.second', { padding: 3000 }));
        tick();
        await installed.open('com.test.first');
        tick();

        await installed.install(archive('com.test.third', { padding: 3000 }));

        expect((await installed.list()).map(info => info.id).sort()).toEqual(['com.test.first', 'com.test.third']);
    });

    it('never evicts the package it just installed, and refuses one larger than the whole cache', async () => {
        const { installed } = service({ maxBytes: 2000 });

        await expect(installed.install(archive('com.test.huge', { padding: 5000 }))).rejects.toThrow(/at most/);
        expect(await installed.list()).toEqual([]);
    });

    it('keeps an id with a slash from escaping its own mount root', () => {
        expect(installedPackageRoot('a/b')).not.toContain('a/b');
        expect(installedPackageRoot('a/b').split('/')).toHaveLength(2);
    });

    it('does not replace the package the running effect loads from', async () => {
        const { installed } = service();
        await installed.install(archive('com.test.one', { title: 'Old' }));

        await expect(
            installed.install(archive('com.test.one', { title: 'New' }), { inUseId: 'com.test.one' })
        ).rejects.toThrow(/running/);

        expect(await installed.list()).toMatchObject([{ title: 'Old' }]);
    });

    it('still accepts the same archive again while it is running', async () => {
        const { installed } = service();
        const bytes = archive('com.test.one');
        await installed.install(bytes);

        await expect(installed.install(bytes, { inUseId: 'com.test.one' })).resolves.toMatchObject({
            id: 'com.test.one',
        });
    });

    it('never evicts the package in use, however long ago it was used', async () => {
        const first = archive('com.test.first', { padding: 3000 });
        const { installed, tick } = service({ maxBytes: first.byteLength * 2 + 500 });
        await installed.install(first);
        tick();
        await installed.install(archive('com.test.second', { padding: 3000 }));
        tick();

        await installed.install(archive('com.test.third', { padding: 3000 }), { inUseId: 'com.test.first' });

        expect((await installed.list()).map(info => info.id).sort()).toEqual(['com.test.first', 'com.test.third']);
    });

    it('makes room before it writes, so a full store does not fail the install', async () => {
        const first = archive('com.test.first', { padding: 3000 });
        const { installed, store } = service({ maxBytes: first.byteLength + 500 });
        await installed.install(first);
        const writes: number[] = [];
        const write = store.write.bind(store);
        store.write = async (info, bytes) => {
            writes.push((await store.list()).length);
            await write(info, bytes);
        };

        await installed.install(archive('com.test.second', { padding: 3000 }));

        // The first package was already gone when the second was written.
        expect(writes).toEqual([0]);
    });

    it('frees the mounted copy of a package without uninstalling it, and mounts it again on the next open', async () => {
        const { installed } = service();
        await installed.install(archive('com.test.one'));
        const effect = await installed.open('com.test.one');
        const manifestUrl = `${effect.packageRoot}/manifest.json`;
        expect((await fetchPackageFile(manifestUrl)).ok).toBe(true);

        installed.release('com.test.one');

        expect((await fetchPackageFile(manifestUrl)).status).toBe(404);
        expect(await installed.list()).toHaveLength(1);
        await installed.open('com.test.one');
        expect((await fetchPackageFile(manifestUrl)).ok).toBe(true);
    });
});
