import { normalizePackagePath } from '../runtime/shader/expandIncludes';
import { assetUrl } from '../utils/base-url';

/** Optional static artwork; unavailable or invalid images never block effect selection. */
export async function loadEffectPreviews(): Promise<ReadonlyMap<string, string>> {
    const urls = new Map<string, string>();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetch(assetUrl('effects/previews/manifest.json'), {
            cache: 'no-cache',
            signal: controller.signal,
        });
        if (!response.ok) return urls;
        const data = (await response.json()) as { version?: unknown; previews?: unknown } | null;
        if (
            data?.version !== 1 ||
            data.previews === null ||
            typeof data.previews !== 'object' ||
            Array.isArray(data.previews)
        )
            return urls;
        for (const [id, preview] of Object.entries(data.previews)) {
            if (preview === null || typeof preview !== 'object') continue;
            const path = (preview as { path?: unknown }).path;
            if (
                typeof path !== 'string' ||
                !/^effects\/previews\/[A-Za-z0-9._/-]+\.png$/.test(path) ||
                normalizePackagePath(path) !== path
            )
                continue;
            urls.set(id, assetUrl(path));
        }
    } catch {
        return urls;
    } finally {
        clearTimeout(timeout);
    }
    return urls;
}
