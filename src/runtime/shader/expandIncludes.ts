/** Reads a package-relative file. Paths passed to it are normalized and never leave the package. */
export type ShaderFileReader = (packagePath: string) => Promise<string>;

export interface ExpandIncludesOptions {
    /** Deepest allowed include nesting. */
    readonly maxDepth?: number;
    /** Upper bound on the total size of every file read, so a fan-out of includes cannot exhaust memory. */
    readonly maxBytes?: number;
}

export class ShaderIncludeError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'ShaderIncludeError';
    }
}

const DEFAULT_MAX_DEPTH = 16;
const DEFAULT_MAX_BYTES = 1024 * 1024;

const INCLUDE_LINE = /^[ \t]*#[ \t]*include\b.*$/gm;
const STRICT_INCLUDE = /^[ \t]*#[ \t]*include[ \t]+"([^"\r\n]*)"[ \t]*\r?$/;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Resolves an include target against the including file, or returns null when the result would
 * not be a plain path inside the package. Normalization is lexical: the reader never sees a `..`.
 */
function resolveInclude(fromPath: string, target: string): string | null {
    if (target === '' || target.startsWith('/') || target.includes('\\') || SCHEME.test(target)) {
        return null;
    }
    const segments = fromPath.split('/').slice(0, -1);
    for (const segment of target.split('/')) {
        if (segment === '..') {
            if (segments.length === 0) {
                return null;
            }
            segments.pop();
        } else if (segment !== '.' && segment !== '') {
            segments.push(segment);
        }
    }
    return segments.length > 0 ? segments.join('/') : null;
}

/**
 * Expands package-local `#include "relative/path"` directives.
 *
 * Only quoted, relative, package-internal paths are accepted. The same file may appear several
 * times; an include of a file that is still being expanded is a cycle and fails.
 */
export async function expandShaderIncludes(
    entryPath: string,
    read: ShaderFileReader,
    options: ExpandIncludesOptions = {}
): Promise<string> {
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    let bytesRead = 0;

    async function load(path: string, includer: string | null): Promise<string> {
        let text: string;
        try {
            text = await read(path);
        } catch (error) {
            const origin = includer === null ? '' : ` (included from "${includer}")`;
            throw new ShaderIncludeError(
                `cannot read shader "${path}"${origin}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
        bytesRead += text.length;
        if (bytesRead > maxBytes) {
            throw new ShaderIncludeError(`shader includes exceed the size limit of ${maxBytes} characters`);
        }
        return text;
    }

    async function expand(path: string, text: string, stack: readonly string[]): Promise<string> {
        const lines = [...text.matchAll(INCLUDE_LINE)];
        if (lines.length === 0) {
            return text;
        }
        let result = '';
        let cursor = 0;
        for (const line of lines) {
            const match = STRICT_INCLUDE.exec(line[0]);
            if (match === null) {
                throw new ShaderIncludeError(`"${path}": malformed include directive: ${line[0].trim()}`);
            }
            const target = resolveInclude(path, match[1]);
            if (target === null) {
                throw new ShaderIncludeError(
                    `"${path}": include "${match[1]}" is not a relative path inside the package`
                );
            }
            if (stack.includes(target)) {
                throw new ShaderIncludeError(`include cycle: ${[...stack, target].join(' -> ')}`);
            }
            if (stack.length >= maxDepth) {
                throw new ShaderIncludeError(`include depth exceeds ${maxDepth} at "${target}"`);
            }
            const included = await load(target, path);
            const expanded = await expand(target, included, [...stack, target]);
            const end = line.index + line[0].length;
            result += text.slice(cursor, line.index) + expanded;
            cursor = end;
        }
        return result + text.slice(cursor);
    }

    return expand(entryPath, await load(entryPath, null), [entryPath]);
}

/** Lexically normalizes a package-relative path; null when it is not a plain path inside the package. */
export function normalizePackagePath(path: string): string | null {
    return resolveInclude('', path);
}
