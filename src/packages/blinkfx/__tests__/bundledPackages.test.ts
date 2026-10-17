import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { openPackage } from '../../../../scripts/lib/packageDirectory';
import { loadBlinkFx } from '../loader';
import { readPackageArchive, writePackageArchive } from '../packageReader';
import { validatePackage } from '../validatePackage';

const EFFECTS = join(process.cwd(), 'public', 'effects');
const packages = existsSync(EFFECTS) ? readdirSync(EFFECTS).filter(name => name.endsWith('.blinkfx')) : [];

describe('bundled packages', () => {
    it('finds the catalog', () => {
        expect(packages.length).toBeGreaterThan(0);
    });

    describe.each(packages)('%s', name => {
        const files = openPackage(join(EFFECTS, name));

        it('validates without a finding', async () => {
            const result = await validatePackage(files);

            expect(result.findings).toEqual([]);
        });

        it('loads into the IR', async () => {
            const result = await validatePackage(files);
            expect(result.manifest).not.toBeNull();

            expect(() => loadBlinkFx(result.manifest!, `effects/${name}`)).not.toThrow();
        });

        it('survives pack and unpack unchanged', async () => {
            const restored = readPackageArchive(writePackageArchive(files));

            expect(restored.list()).toEqual(files.list());
            for (const path of files.list()) {
                // openPackage yields Node Buffers, the archive reader plain Uint8Arrays: compare content, not class.
                expect(Buffer.from(restored.read(path) ?? []).equals(Buffer.from(files.read(path) ?? []))).toBe(true);
            }
            expect(await validatePackage(restored)).toEqual(await validatePackage(files));
        });
    });
});
