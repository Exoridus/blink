import { resolve, sep } from 'node:path';

/** Resolves private tooling artifacts without allowing a path to escape the workspace. */
export function workspacePath(...parts: string[]): string {
    const root = resolve('.workspace');
    const path = resolve(root, ...parts);
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Private artifact path escapes workspace');
    return path;
}

export function corpusRoot(): string {
    return resolve(process.env.BLINK_CORPUS_ROOT ?? workspacePath('corpora'));
}
