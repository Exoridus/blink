import type { PackageFiles } from '../../packages/blinkfx/packageReader';
import { normalizePackagePath } from '../shader/expandIncludes';

const mounts = new Map<string, PackageFiles>();

/** Roots under this prefix only ever exist in memory; see `installedPackageRoot`. */
const INSTALLED_PREFIX = 'blinkfx-installed/';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
    glsl: 'text/plain',
    wgsl: 'text/plain',
    frag: 'text/plain',
    vert: 'text/plain',
    txt: 'text/plain',
    js: 'text/javascript',
    mjs: 'text/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
};

function contentType(path: string): string {
    const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    return Object.hasOwn(CONTENT_TYPES, extension) ? CONTENT_TYPES[extension] : 'application/octet-stream';
}

/**
 * Serves a package held in memory under `root`, so everything that loads package files through
 * `fetchPackageFile` finds them without the package ever having a URL. Mounting a root again
 * replaces what was there.
 */
export function mountPackage(root: string, files: PackageFiles): void {
    mounts.set(root.replace(/\/+$/, ''), files);
}

export function unmountPackage(root: string): void {
    mounts.delete(root.replace(/\/+$/, ''));
}

export function isPackageMounted(root: string): boolean {
    return mounts.has(root.replace(/\/+$/, ''));
}

/**
 * `fetch` for package files: a path under a mounted root is answered from memory, anything else
 * goes to the network. A mounted path that is not a plain path inside its package, or names a file
 * the package does not hold, is a 404 rather than a fall-through to the network.
 */
export async function fetchPackageFile(path: string): Promise<Response> {
    for (const [root, files] of mounts) {
        if (!path.startsWith(`${root}/`)) {
            continue;
        }
        const relative = normalizePackagePath(path.slice(root.length + 1));
        const bytes = relative === null ? undefined : files.read(relative);
        if (relative === null || bytes === undefined) {
            return new Response(null, { status: 404 });
        }
        const headers = new Headers();
        headers.set('Content-Type', contentType(relative));
        return new Response(new Blob([bytes as BlobPart]), { status: 200, headers });
    }
    // A package that is not mounted (removed, or never opened) must not fall through to a server
    // that answers every unknown path with its index page, which would load as a shader or script.
    if (path.startsWith(INSTALLED_PREFIX)) {
        return new Response(null, { status: 404 });
    }
    return fetch(path);
}
