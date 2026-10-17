import type { BlinkShaderEntry, BlinkShaderSource } from '../ir/types';
import { expandShaderIncludes, normalizePackagePath } from './expandIncludes';

export type FetchText = (url: string) => Promise<string>;

export interface ResolvedVisualShader {
    readonly fragment: string;
    readonly vertex: string | null;
}

async function resolveSource(
    source: BlinkShaderSource,
    packageRoot: string | undefined,
    fetchText: FetchText
): Promise<string> {
    if (source.source !== null) {
        return source.source;
    }
    if (source.path === null) {
        throw new Error('Shader entry has neither source nor path');
    }
    const { path } = source;
    if (packageRoot === undefined) {
        return fetchText(path);
    }

    const root = packageRoot.replace(/\/+$/, '');
    const relative = normalizePackagePath(path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path);
    if (relative === null) {
        throw new Error(`Shader path "${path}" is outside the package`);
    }
    return expandShaderIncludes(relative, packagePath => fetchText(`${root}/${packagePath}`));
}

/** Loads the text of an audio program, with package-local includes expanded. */
export async function resolveAudioShader(
    entry: BlinkShaderEntry,
    packageRoot: string | undefined,
    fetchText: FetchText
): Promise<string> {
    if (entry.stage !== 'audio') {
        throw new Error('Shader entry is a visual program and cannot run as the audio output');
    }
    return resolveSource(entry, packageRoot, fetchText);
}

/**
 * Loads the text of a visual shader entry: the fragment stage and, when the package supplies one,
 * its vertex stage, with package-local includes expanded in both.
 */
export async function resolveVisualShader(
    entry: BlinkShaderEntry,
    packageRoot: string | undefined,
    fetchText: FetchText
): Promise<ResolvedVisualShader> {
    if (entry.stage !== 'visual') {
        throw new Error('Shader entry is an audio program and cannot run as a visual pass');
    }
    const fragment = await resolveSource(entry, packageRoot, fetchText);
    const vertex = entry.vertex === null ? null : await resolveSource(entry.vertex, packageRoot, fetchText);
    return { fragment, vertex };
}
