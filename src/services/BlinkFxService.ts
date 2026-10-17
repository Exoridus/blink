import { loadBlinkFx } from '../packages/blinkfx/loader';
import type { BlinkFxManifest } from '../packages/blinkfx/manifest';
import { validateBlinkFxManifest } from '../packages/blinkfx/validate';
import type { BlinkEffectIR } from '../runtime/ir/types';
import { unmountPackage } from '../runtime/package/packageMount';
import { assetUrl } from '../utils/base-url';
import { loadEffectPreviews } from './EffectPreviews';
import { installedPackageRoot, type InstalledPackageService } from './InstalledPackageService';
import { loadSsfScene, type SsfCatalogEntry } from './SsfSceneLoader';

export interface BlinkFxPackageListItem {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly basePath: string;
    /** True for a package the user installed from an archive; false or absent for a bundled one. */
    readonly installed?: boolean;
    readonly sourceFiles?: readonly string[];
    readonly sourceCollection?: 'builtin' | 'community';
    readonly previewUrl?: string;
}

export type BlinkFxPackageList = readonly BlinkFxPackageListItem[];

const DEFAULT_CATALOG_URL = assetUrl('effects/catalog.json');

interface CatalogLocation {
    readonly url: string;
    readonly resolveEntry: (entry: string) => string;
}

/**
 * Where the effect catalog lives. Development builds accept `?catalog=<url>` so a directory of
 * converted packages can be browsed without copying it under `public/`; its entries are relative
 * to the catalog file.
 */
function catalogLocation(): CatalogLocation {
    const override =
        import.meta.env.DEV && typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('catalog')
            : null;
    if (override === null) {
        return { url: DEFAULT_CATALOG_URL, resolveEntry: assetUrl };
    }
    const base = new URL(override, window.location.href);
    return { url: base.pathname, resolveEntry: entry => new URL(entry, base).pathname };
}

async function fetchCatalog(): Promise<BlinkFxPackageList> {
    const location = catalogLocation();
    const response = await fetch(location.url, { cache: 'no-cache' });
    if (!response.ok) {
        throw new Error(`Failed to load effect catalog: ${location.url} (${response.status})`);
    }
    const data = (await response.json()) as { packages: Array<string | SsfCatalogEntry> };
    const catalogEntries = data.packages;

    // Fetch all manifests in parallel
    const previews = loadEffectPreviews();
    const manifests = await Promise.all(
        catalogEntries.map(async entry => {
            if (typeof entry !== 'string') {
                return {
                    id: entry.id,
                    title: entry.title,
                    description: entry.description ?? '',
                    basePath: location.resolveEntry(entry.scene).replace(/\/scene\.json$/, ''),
                    sourceFiles: entry.files,
                    sourceCollection: entry.collection,
                };
            }
            const manifestPath = location.resolveEntry(entry);
            const resp = await fetch(manifestPath, { cache: 'no-cache' });
            if (!resp.ok) {
                console.warn(`BlinkFxService: skipping ${manifestPath} (${resp.status})`);
                return null;
            }
            const raw = (await resp.json()) as Record<string, unknown>;
            const validation = validateBlinkFxManifest(raw);
            if (!validation.valid) {
                console.warn(`BlinkFxService: skipping ${manifestPath}: ${validation.errors.join(', ')}`);
                return null;
            }
            const m = raw as unknown as BlinkFxManifest;
            const basePath = manifestPath.replace(/\/manifest\.json$/, '');
            return {
                id: m.id,
                title: m.title,
                description: m.description ?? '',
                basePath,
            };
        })
    );

    const previewUrls = await previews;
    return manifests.filter(p => p !== null).map(pkg => ({ ...pkg, previewUrl: previewUrls.get(pkg.id) }));
}

export class BlinkFxService {
    private _catalog: BlinkFxPackageList | null = null;
    private _loadPromise: Promise<BlinkFxPackageList> | null = null;
    private readonly importedRoots = new Map<string, string>();
    private readonly installedPackages: InstalledPackageService | null;

    public constructor(installedPackages: InstalledPackageService | null = null) {
        this.installedPackages = installedPackages;
    }

    /** The bundled catalog followed by the installed packages. The bundled catalog is fetched once. */
    public async getPackageList(): Promise<BlinkFxPackageList> {
        const catalog = await this.getCatalog();
        const installed = await this.installedItems();
        return installed.length === 0 ? catalog : [...catalog, ...installed];
    }

    /** Refreshes catalog metadata without releasing or switching the running effect. */
    public async reloadPackageList(): Promise<BlinkFxPackageList> {
        if (this._loadPromise !== null) await this._loadPromise.catch(() => {});
        const refreshed = await fetchCatalog();
        this._catalog = refreshed;
        this._loadPromise = Promise.resolve(refreshed);
        return this.getPackageList();
    }

    /**
     * Installs a `.blinkfx` archive and returns its list entry. A package may not take the id of a
     * bundled one: two entries with one id would make the list ambiguous about which one loads.
     */
    public async installPackage(archive: Uint8Array, inUseId?: string): Promise<BlinkFxPackageListItem> {
        const installer = this.requireInstaller();
        const info = await installer.install(archive, {
            isReserved: async id => (await this.getCatalog()).some(entry => entry.id === id),
            inUseId,
        });
        return {
            id: info.id,
            title: info.title,
            description: info.description,
            basePath: installedPackageRoot(info.id),
            installed: true,
        };
    }

    /** Frees the memory of an installed package the running effect has switched away from. */
    public releasePackage(id: string): void {
        this.installedPackages?.release(id);
        const root = this.importedRoots.get(id);
        if (root !== undefined) {
            unmountPackage(root);
            this.importedRoots.delete(id);
        }
    }

    /** Removes an installed package. A bundled one cannot be removed. */
    public async removePackage(id: string): Promise<void> {
        const installer = this.requireInstaller();
        if ((await this.getCatalog()).some(entry => entry.id === id)) {
            throw new Error(`"${id}" is a bundled effect and cannot be removed`);
        }
        await installer.remove(id);
    }

    private requireInstaller(): InstalledPackageService {
        if (this.installedPackages === null) {
            throw new Error('This build cannot install packages');
        }
        return this.installedPackages;
    }

    private async getCatalog(): Promise<BlinkFxPackageList> {
        if (this._catalog === null) {
            this._loadPromise ??= fetchCatalog().catch((error: unknown) => {
                this._loadPromise = null;
                throw error;
            });
            this._catalog = await this._loadPromise;
        }
        return this._catalog;
    }

    private async installedItems(): Promise<BlinkFxPackageListItem[]> {
        if (this.installedPackages === null) return [];
        try {
            const infos = await this.installedPackages.list();
            return infos.map(info => ({
                id: info.id,
                title: info.title,
                description: info.description,
                basePath: installedPackageRoot(info.id),
                installed: true,
            }));
        } catch (error) {
            // Storage can be unavailable (private browsing, blocked site data); the bundled effects still work.
            console.warn('BlinkFxService: installed packages are unavailable', error);
            return [];
        }
    }

    public async loadPackage(packageId: string): Promise<BlinkEffectIR> {
        const packages = await this.getPackageList();
        const pkg = packages.find(p => p.id === packageId);
        if (pkg === undefined) {
            throw new Error(`BlinkFX package not found: ${packageId}`);
        }
        if (pkg.installed === true) {
            return this.requireInstaller().open(packageId);
        }

        if (pkg.sourceFiles !== undefined) {
            const effect = await loadSsfScene(pkg.basePath, pkg.sourceFiles, pkg.id);
            this.importedRoots.set(packageId, pkg.basePath);
            return effect;
        }
        const manifestUrl = `${pkg.basePath}/manifest.json`;
        const response = await fetch(manifestUrl);
        if (!response.ok) {
            throw new Error(`Failed to load package manifest: ${manifestUrl} (${response.status})`);
        }

        const raw = (await response.json()) as unknown;
        const validation = validateBlinkFxManifest(raw);
        if (!validation.valid) {
            throw new Error(`Invalid BlinkFX manifest: ${validation.errors.join(', ')}`);
        }

        const manifest = raw as BlinkFxManifest;
        return loadBlinkFx(manifest, pkg.basePath);
    }
}
