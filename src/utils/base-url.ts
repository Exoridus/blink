/**
 * Resolves a path inside `public/` against the base URL the app was built with.
 *
 * Vite rewrites the URLs it emits itself (entry scripts, CSS, hashed assets),
 * but not path strings that only exist at runtime. Anything fetched by such a
 * string must go through here, or the app breaks as soon as it is served from
 * a sub-path instead of the domain root.
 *
 * @param path Path relative to `public/`; a leading slash is tolerated.
 */
export function assetUrl(path: string): string {
    return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
