import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Resolves a required private fixture, failing explicitly when the corpus is unavailable. */
export function privateCorpusPath(...parts: string[]): string {
    const root = process.env.BLINK_CORPUS_ROOT;
    if (!root)
        throw new Error(
            'Private SSF tests require BLINK_CORPUS_ROOT. Run npm run test:private or set the corpus root explicitly.'
        );
    const path = resolve(root, ...parts);
    if (!existsSync(path))
        throw new Error(
            `Missing private SSF fixture: ${path}. Populate BLINK_CORPUS_ROOT before running the private lane.`
        );
    return path;
}
