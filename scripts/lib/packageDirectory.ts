import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import type { PackageFiles } from '../../src/packages/blinkfx/packageReader';
import { MemoryPackageFiles, readPackageArchive } from '../../src/packages/blinkfx/packageReader';

function walk(root: string, directory: string, files: Map<string, Uint8Array>): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(root, path, files);
        else files.set(relative(root, path).split(sep).join('/'), readFileSync(path));
    }
}

/** Reads a package from an unpacked directory or a `.blinkfx` archive. */
export function openPackage(path: string): PackageFiles {
    if (statSync(path).isDirectory()) {
        const files = new Map<string, Uint8Array>();
        walk(path, path, files);
        return new MemoryPackageFiles(files);
    }
    return readPackageArchive(readFileSync(path));
}

export function writeFiles(directory: string, files: Iterable<[string, string | Uint8Array]>): void {
    for (const [path, content] of files) {
        const target = join(directory, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
    }
}
