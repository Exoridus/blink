import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { MemoryPackageFiles, PackageArchiveError, readPackageArchive, writePackageArchive } from '../packageReader';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function files(entries: Record<string, string>): MemoryPackageFiles {
    return new MemoryPackageFiles(new Map(Object.entries(entries).map(([path, text]) => [path, encode(text)])));
}

describe('package archive', () => {
    it('round-trips every file byte for byte', () => {
        const source = files({
            'manifest.json': '{"format":"blinkfx/1"}',
            'shaders/main.frag.glsl': 'void main() {}',
            'assets/noise.bin': '\u0000\u0001ÿ',
        });

        const restored = readPackageArchive(writePackageArchive(source));

        expect(restored.list()).toEqual(source.list());
        for (const path of source.list()) {
            expect(restored.read(path)).toEqual(source.read(path));
        }
    });

    it('writes manifest.json as the first entry', () => {
        const archive = writePackageArchive(files({ 'a.txt': 'a', 'manifest.json': '{}', 'z.txt': 'z' }));

        expect(Object.keys(unzipSync(archive))[0]).toBe('manifest.json');
    });

    it('serves reads through normalized paths and misses unknown ones', () => {
        const source = files({ 'shaders/main.frag.glsl': 'x' });

        expect(source.read('./shaders/main.frag.glsl')).toBeDefined();
        expect(source.read('shaders/other.glsl')).toBeUndefined();
        expect(source.read('../escape')).toBeUndefined();
    });

    it('rejects an archive with an entry outside the package', () => {
        const hostile = zipSync({ 'manifest.json': encode('{}'), '../outside.txt': encode('x') });

        expect(() => readPackageArchive(hostile)).toThrow(PackageArchiveError);
    });

    it('rejects bytes that are not an archive', () => {
        expect(() => readPackageArchive(encode('not a zip'))).toThrow(PackageArchiveError);
    });
});
