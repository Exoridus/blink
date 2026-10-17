import { unzipSync, zipSync } from 'fflate';

import { normalizePackagePath } from '../../runtime/shader/expandIncludes';

/** The files of one package, read from a directory or an archive. Paths are package-relative, with `/`. */
export interface PackageFiles {
    list(): string[];
    read(path: string): Uint8Array | undefined;
}

export class PackageArchiveError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'PackageArchiveError';
    }
}

/** A package held in memory, by normalized path. */
export class MemoryPackageFiles implements PackageFiles {
    private readonly files: ReadonlyMap<string, Uint8Array>;

    public constructor(files: ReadonlyMap<string, Uint8Array>) {
        this.files = files;
    }

    public list(): string[] {
        return [...this.files.keys()].sort();
    }

    public read(path: string): Uint8Array | undefined {
        const normalized = normalizePackagePath(path);
        return normalized === null ? undefined : this.files.get(normalized);
    }
}

/**
 * Reads a `.blinkfx` archive. Entries are decoded in memory; a name that is not a plain path
 * inside the package (absolute, drive-relative, or climbing out with `..`) rejects the whole
 * archive rather than being skipped, because a package that contains one is not one to trust.
 */
export function readPackageArchive(bytes: Uint8Array): PackageFiles {
    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(bytes);
    } catch (error) {
        throw new PackageArchiveError(`not a valid archive: ${error instanceof Error ? error.message : String(error)}`);
    }

    const files = new Map<string, Uint8Array>();
    for (const [name, content] of Object.entries(entries)) {
        if (name.endsWith('/')) continue;
        const normalized = normalizePackagePath(name);
        if (normalized === null) {
            throw new PackageArchiveError(`entry "${name}" is outside the package`);
        }
        files.set(normalized, content);
    }
    return new MemoryPackageFiles(files);
}

/** Writes a package as an archive with `manifest.json` first, so a reader finds it without scanning. */
export function writePackageArchive(files: PackageFiles): Uint8Array {
    const entries: Record<string, Uint8Array> = {};
    const paths = files.list();
    const ordered = ['manifest.json', ...paths.filter(path => path !== 'manifest.json')];
    for (const path of ordered) {
        const content = files.read(path);
        if (content !== undefined) entries[path] = content;
    }
    return zipSync(entries, { level: 6 });
}
