import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import type { SsfSceneSource } from '../../src/packages/ssf/convert/convertSsfScene';
import { readSsfDirectory } from '../../src/packages/ssf/package';

function collectFiles(root: string, directory: string, files: Map<string, Uint8Array>): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            collectFiles(root, path, files);
        } else if (statSync(path).size < 32 * 1024 * 1024) {
            files.set(relative(root, path).split(sep).join('/'), readFileSync(path));
        }
    }
}

/** Reads one `.synScene` directory into the shape the converter takes. */
export function readSsfScene(directory: string): SsfSceneSource {
    const files = new Map<string, Uint8Array>();
    collectFiles(directory, directory, files);

    const slug = basename(directory).replace(/\.synScene$/, '');
    try {
        return readSsfDirectory(files, slug);
    } catch {
        return { slug, sceneJson: null, mainGlsl: '', files };
    }
}

/** Every `*.synScene` directory below a root, depth first. */
export function findSsfScenes(root: string): string[] {
    const found: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const path = join(directory, entry.name);
            if (entry.name.endsWith('.synScene')) found.push(path);
            else walk(path);
        }
    };
    walk(root);
    return found.sort();
}
