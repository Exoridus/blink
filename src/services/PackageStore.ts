/** What is known about an installed package without reading its archive. */
export interface InstalledPackageInfo {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly version: string | null;
    /** SHA-256 of the archive, as lowercase hex. Two installs with the same hash are the same package. */
    readonly sha256: string;
    /** Archive size in bytes. */
    readonly size: number;
    readonly installedAt: number;
    /** When the package was last installed or opened; the cache evicts the oldest first. */
    readonly lastUsedAt: number;
}

/** Persistent home of installed `.blinkfx` archives, keyed by package id. */
export interface PackageStore {
    list(): Promise<InstalledPackageInfo[]>;
    /** The archive bytes, or undefined when nothing is installed under `id`. */
    read(id: string): Promise<Uint8Array | undefined>;
    /** Stores or replaces the package under `info.id`, archive and info together. */
    write(info: InstalledPackageInfo, archive: Uint8Array): Promise<void>;
    /** Updates the info of an installed package without touching its archive. */
    updateInfo(info: InstalledPackageInfo): Promise<void>;
    remove(id: string): Promise<void>;
}

export class MemoryPackageStore implements PackageStore {
    private readonly infos = new Map<string, InstalledPackageInfo>();
    private readonly archives = new Map<string, Uint8Array>();

    public list(): Promise<InstalledPackageInfo[]> {
        return Promise.resolve([...this.infos.values()]);
    }

    public read(id: string): Promise<Uint8Array | undefined> {
        return Promise.resolve(this.archives.get(id));
    }

    public write(info: InstalledPackageInfo, archive: Uint8Array): Promise<void> {
        this.infos.set(info.id, info);
        this.archives.set(info.id, archive);
        return Promise.resolve();
    }

    public updateInfo(info: InstalledPackageInfo): Promise<void> {
        if (this.infos.has(info.id)) {
            this.infos.set(info.id, info);
        }
        return Promise.resolve();
    }

    public remove(id: string): Promise<void> {
        this.infos.delete(id);
        this.archives.delete(id);
        return Promise.resolve();
    }
}

const DATABASE = 'blink-packages';
const INFO_STORE = 'info';
const ARCHIVE_STORE = 'archives';

function request<T>(source: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        source.onsuccess = (): void => resolve(source.result);
        source.onerror = (): void => reject(source.error ?? new Error('IndexedDB request failed'));
    });
}

function completion(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = (): void => resolve();
        transaction.onerror = (): void => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
        transaction.onabort = (): void => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
}

/**
 * Archives live in a store of their own, apart from the info, so listing what is installed never
 * has to read the archives it lists.
 */
export class IndexedDbPackageStore implements PackageStore {
    private database: Promise<IDBDatabase> | null = null;

    private open(): Promise<IDBDatabase> {
        if (this.database !== null) {
            return this.database;
        }
        const opened = new Promise<IDBDatabase>((resolve, reject) => {
            const opening = indexedDB.open(DATABASE, 1);
            opening.onupgradeneeded = (): void => {
                opening.result.createObjectStore(INFO_STORE, { keyPath: 'id' });
                opening.result.createObjectStore(ARCHIVE_STORE);
            };
            opening.onsuccess = (): void => resolve(opening.result);
            opening.onerror = (): void => reject(opening.error ?? new Error('IndexedDB could not be opened'));
            opening.onblocked = (): void =>
                reject(new Error('IndexedDB is blocked by another tab holding an older version'));
        }).then<IDBDatabase>(
            (database: IDBDatabase) => {
                // Another tab upgrading the database must not be held up by this connection.
                database.onversionchange = (): void => {
                    database.close();
                    this.database = null;
                };
                return database;
            },
            (error: unknown) => {
                // Not cached: the next call tries again instead of failing for the whole session.
                this.database = null;
                throw error;
            }
        );
        this.database = opened;
        return opened;
    }

    public async list(): Promise<InstalledPackageInfo[]> {
        const database = await this.open();
        return request(
            database.transaction(INFO_STORE).objectStore(INFO_STORE).getAll() as IDBRequest<InstalledPackageInfo[]>
        );
    }

    public async read(id: string): Promise<Uint8Array | undefined> {
        const database = await this.open();
        const stored = await request(
            database.transaction(ARCHIVE_STORE).objectStore(ARCHIVE_STORE).get(id) as IDBRequest<Uint8Array | undefined>
        );
        return stored === undefined ? undefined : new Uint8Array(stored);
    }

    public async write(info: InstalledPackageInfo, archive: Uint8Array): Promise<void> {
        const database = await this.open();
        const transaction = database.transaction([INFO_STORE, ARCHIVE_STORE], 'readwrite');
        transaction.objectStore(ARCHIVE_STORE).put(archive, info.id);
        transaction.objectStore(INFO_STORE).put(info);
        await completion(transaction);
    }

    public async updateInfo(info: InstalledPackageInfo): Promise<void> {
        const database = await this.open();
        const transaction = database.transaction(INFO_STORE, 'readwrite');
        const store = transaction.objectStore(INFO_STORE);
        // A package removed in the meantime must stay removed: a bare put would bring back an
        // info record whose archive is gone.
        const existing = store.get(info.id);
        existing.onsuccess = (): void => {
            if (existing.result !== undefined) {
                store.put(info);
            }
        };
        await completion(transaction);
    }

    public async remove(id: string): Promise<void> {
        const database = await this.open();
        const transaction = database.transaction([INFO_STORE, ARCHIVE_STORE], 'readwrite');
        transaction.objectStore(INFO_STORE).delete(id);
        transaction.objectStore(ARCHIVE_STORE).delete(id);
        await completion(transaction);
    }
}
