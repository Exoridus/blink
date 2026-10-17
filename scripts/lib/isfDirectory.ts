import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import type { IsfSource } from '../../src/packages/isf/convert/convertIsf';

/** Every `.fs` below a root, depth first. */
export function findIsfShaders(root: string): string[] {
    const found: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.name.endsWith('.fs')) found.push(path);
        }
    };
    walk(root);
    return found.sort();
}

/** Reads one `.fs`, its companion `.vs` if any, and the files next to it an `IMPORTED` entry may name. */
export function readIsfShader(path: string): IsfSource {
    const directory = dirname(path);
    const files = new Map<string, Uint8Array>();
    const collect = (current: string, depth: number): void => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = join(current, entry.name);
            if (entry.isDirectory() && depth < 2) collect(full, depth + 1);
            else if (
                entry.isFile() &&
                /\.(png|jpe?g|gif|webp)$/i.test(entry.name) &&
                statSync(full).size < 16 * 1024 * 1024
            ) {
                files.set(relative(directory, full).split(sep).join('/'), readFileSync(full));
            }
        }
    };
    collect(directory, 0);

    const vertexPath = path.replace(/\.fs$/, '.vs');
    return {
        slug: basename(path).replace(/\.fs$/, ''),
        text: readFileSync(path, 'utf8'),
        ...(existsSync(vertexPath) ? { vertexText: readFileSync(vertexPath, 'utf8') } : {}),
        files,
    };
}
