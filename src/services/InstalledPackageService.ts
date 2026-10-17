import { loadBlinkFx } from '../packages/blinkfx/loader';
import type { BlinkFxManifest } from '../packages/blinkfx/manifest';
import { type PackageFiles, readPackageArchive } from '../packages/blinkfx/packageReader';
import { type PackageFinding, validatePackage } from '../packages/blinkfx/validatePackage';
import type { BlinkEffectIR } from '../runtime/ir/types';
import { mountPackage, unmountPackage } from '../runtime/package';
import type { InstalledPackageInfo, PackageStore } from './PackageStore';

/** An archive that cannot be installed; the message says why and names the first findings. */
export class PackageInstallError extends Error {
    public readonly findings: readonly PackageFinding[];

    public constructor(message: string, findings: readonly PackageFinding[] = []) {
        super(message);
        this.name = 'PackageInstallError';
        this.findings = findings;
    }
}

export interface InstallOptions {
    /** Claims ids that may not be installed, such as the ids of bundled effects. */
    readonly isReserved?: (id: string) => Promise<boolean>;
    /** The package the running effect loads from; it is neither replaced nor evicted. */
    readonly inUseId?: string;
}

export interface InstalledPackageOptions {
    /** Most archive bytes the cache holds; installing past it evicts the least recently used packages. */
    readonly maxBytes?: number;
    readonly now?: () => number;
}

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const MAX_FINDINGS_IN_MESSAGE = 3;

/** Where an installed package is served from: a mount root, never a URL. */
export function installedPackageRoot(id: string): string {
    return `blinkfx-installed/${encodeURIComponent(id)}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Packages the user installed from `.blinkfx` archives, kept in a persistent store and served
 * from memory.
 *
 * An archive is validated completely before anything is stored: a package that does not validate
 * is never installed, so every stored package can be opened. Installing the same archive again
 * only refreshes its place in the cache; installing a different archive under the same id
 * replaces the old one.
 */
export class InstalledPackageService {
    private readonly store: PackageStore;
    private readonly maxBytes: number;
    private readonly now: () => number;
    private readonly opened = new Map<string, { manifest: BlinkFxManifest; sha256: string }>();

    public constructor(store: PackageStore, options: InstalledPackageOptions = {}) {
        this.store = store;
        this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
        this.now = options.now ?? ((): number => Date.now());
    }

    public list(): Promise<InstalledPackageInfo[]> {
        return this.store.list();
    }

    /**
     * Validates and stores an archive. Rejects with `PackageInstallError` for an archive that is
     * unreadable, invalid, larger than the whole cache, whose id `isReserved` claims, or that would
     * replace the package `inUseId` names, whose files the running effect still loads.
     */
    public async install(archive: Uint8Array, options: InstallOptions = {}): Promise<InstalledPackageInfo> {
        const { isReserved, inUseId } = options;
        if (archive.byteLength > this.maxBytes) {
            throw new PackageInstallError(
                `The archive is ${archive.byteLength} bytes; the package cache holds at most ${this.maxBytes}`
            );
        }
        const files = this.readArchive(archive);
        const validation = await validatePackage(files);
        if (!validation.valid || validation.manifest === null) {
            throw this.invalid(validation.findings);
        }

        const { manifest } = validation;
        if (isReserved !== undefined && (await isReserved(manifest.id))) {
            throw new PackageInstallError(`"${manifest.id}" is the id of a bundled effect`);
        }
        const sha256 = await sha256Hex(archive);
        const existing = (await this.store.list()).find(info => info.id === manifest.id);
        if (existing?.sha256 !== sha256 && manifest.id === inUseId) {
            throw new PackageInstallError(`"${manifest.id}" is running; switch to another effect before replacing it`);
        }
        if (existing?.sha256 === sha256) {
            const refreshed = { ...existing, lastUsedAt: this.now() };
            await this.store.updateInfo(refreshed);
            return refreshed;
        }

        const timestamp = this.now();
        const info: InstalledPackageInfo = {
            id: manifest.id,
            title: manifest.title,
            description: manifest.description ?? '',
            version: manifest.version ?? null,
            sha256,
            size: archive.byteLength,
            installedAt: timestamp,
            lastUsedAt: timestamp,
        };
        // Room is made first: a store that is out of space would otherwise fail the write although
        // evicting older packages would have made it fit.
        await this.evictToFit(manifest.id, archive.byteLength, inUseId);
        await this.store.write(info, archive);
        this.opened.delete(manifest.id);
        unmountPackage(installedPackageRoot(manifest.id));
        return info;
    }

    /**
     * Drops the decompressed copy of an installed package that is no longer running. The archive
     * stays installed and is mounted again the next time the package is opened.
     */
    public release(id: string): void {
        this.opened.delete(id);
        unmountPackage(installedPackageRoot(id));
    }

    public async remove(id: string): Promise<void> {
        await this.store.remove(id);
        this.opened.delete(id);
        unmountPackage(installedPackageRoot(id));
    }

    /**
     * Mounts the installed package and returns it as an effect, ready to load. Reading the archive
     * again re-validates it, so a store that was damaged since the install fails here with a
     * message rather than with a missing file in the middle of a frame.
     */
    public async open(id: string): Promise<BlinkEffectIR> {
        const info = (await this.store.list()).find(candidate => candidate.id === id);
        const archive = info === undefined ? undefined : await this.store.read(id);
        if (info === undefined || archive === undefined) {
            throw new Error(`Installed package not found: ${id}`);
        }

        const root = installedPackageRoot(id);
        let cached = this.opened.get(id);
        if (cached?.sha256 !== info.sha256) {
            const files = this.readArchive(archive);
            const validation = await validatePackage(files);
            if (!validation.valid || validation.manifest === null) {
                throw this.invalid(validation.findings);
            }
            mountPackage(root, files);
            cached = { manifest: validation.manifest, sha256: info.sha256 };
            this.opened.set(id, cached);
        }

        await this.store.updateInfo({ ...info, lastUsedAt: this.now() });
        return loadBlinkFx(cached.manifest, root);
    }

    private readArchive(archive: Uint8Array): PackageFiles {
        try {
            return readPackageArchive(archive);
        } catch (error) {
            throw new PackageInstallError(error instanceof Error ? error.message : String(error));
        }
    }

    private invalid(findings: readonly PackageFinding[]): PackageInstallError {
        const errors = findings.filter(finding => finding.severity === 'error');
        const shown = errors.slice(0, MAX_FINDINGS_IN_MESSAGE).map(finding => finding.message);
        const more = errors.length > shown.length ? ` (and ${errors.length - shown.length} more)` : '';
        return new PackageInstallError(`The package is not valid: ${shown.join('; ')}${more}`, findings);
    }

    /**
     * Drops least recently used packages until `incoming` more bytes fit. Neither the package being
     * installed (which the incoming bytes replace) nor the one in use is dropped.
     */
    private async evictToFit(keep: string, incoming: number, inUseId: string | undefined): Promise<void> {
        const infos = (await this.store.list()).filter(info => info.id !== keep);
        let total = incoming + infos.reduce((sum, info) => sum + info.size, 0);
        const evictable = infos.filter(info => info.id !== inUseId).sort((a, b) => a.lastUsedAt - b.lastUsedAt);
        for (const info of evictable) {
            if (total <= this.maxBytes) {
                return;
            }
            await this.remove(info.id);
            total -= info.size;
        }
    }
}
