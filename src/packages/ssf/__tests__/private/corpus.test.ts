import { privateCorpusPath } from './corpusPaths';

import { describe, expect, it } from 'vitest';

import { findSsfScenes, readSsfScene } from '../../../../../scripts/lib/ssfDirectory';
import { loadBlinkFx } from '../../../blinkfx/loader';
import { validateBlinkFxManifest } from '../../../blinkfx/validate';
import { convertSsfScene } from '../../convert/convertSsfScene';

const roots = ['builtin', 'community'].map(kind => privateCorpusPath('synesthesia', kind, 'reference'));

describe('SSF corpus conversion', () => {
    const scenes = roots.flatMap(root => findSsfScenes(root));

    it('finds the corpus', () => {
        expect(scenes.length).toBeGreaterThan(100);
    });

    it('converts every scene without an unhandled error and classifies each', () => {
        const failures: string[] = [];
        const statuses: Record<string, number> = {};

        for (const directory of scenes) {
            const scene = readSsfScene(directory);
            let converted;
            try {
                converted = convertSsfScene(scene);
            } catch (error) {
                failures.push(`${scene.slug}: converter crashed: ${String(error)}`);
                continue;
            }
            statuses[converted.report.status] = (statuses[converted.report.status] ?? 0) + 1;
            if (converted.report.status === 'failed') {
                // A failure must be explained: an unexplained one is a converter bug.
                if (!converted.report.issues.some(issue => issue.severity === 'error')) {
                    failures.push(`${scene.slug}: failed without an error issue`);
                }
                continue;
            }

            const validation = validateBlinkFxManifest(converted.manifest);
            if (!validation.valid) {
                failures.push(`${scene.slug}: invalid manifest: ${validation.errors.join('; ')}`);
                continue;
            }
            try {
                loadBlinkFx(converted.manifest, `effects/${scene.slug}.blinkfx`);
            } catch (error) {
                failures.push(`${scene.slug}: does not load: ${String(error)}`);
            }
        }

        expect(failures).toEqual([]);
        expect(Object.values(statuses).reduce((sum, count) => sum + count, 0)).toBe(scenes.length);
    });
});
