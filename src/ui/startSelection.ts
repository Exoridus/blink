import type { SourceType } from './StartScreen';

const STORAGE_KEY = 'blink.start-selection';
export const DEFAULT_STREAM_URL = 'https://s6.citrus3.com:8526/stream';

export interface StartSelection {
    readonly packageId?: string;
    readonly sourceType?: 'url';
    readonly url?: string;
}

export function readStartSelection(): StartSelection {
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        if (raw === null || typeof raw !== 'object') return {};
        const value = raw as Record<string, unknown>;
        return {
            packageId: typeof value.packageId === 'string' ? value.packageId : undefined,
            sourceType: value.sourceType === 'url' ? 'url' : undefined,
            url: typeof value.url === 'string' ? value.url : undefined,
        };
    } catch {
        return {};
    }
}

function write(selection: StartSelection): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
        /* Browser storage is optional; playback must remain usable when it is unavailable. */
    }
}

export function rememberEffect(packageId: string): void {
    write({ ...readStartSelection(), packageId });
}

/** Only URL sources survive a reload; capture permissions and local file handles must be acquired again. */
export function rememberSource(sourceType: SourceType, url?: string): void {
    write({
        ...readStartSelection(),
        sourceType: sourceType === 'url' ? 'url' : undefined,
        ...(sourceType === 'url' ? { url } : {}),
    });
}
