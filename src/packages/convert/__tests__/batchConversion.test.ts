import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BatchEntry } from '../../../../scripts/lib/convertBatch';
import { convertBatch, discoverJobs, summarize } from '../../../../scripts/lib/convertBatch';
import { openPackage } from '../../../../scripts/lib/packageDirectory';
import { loadBlinkFx } from '../../blinkfx/loader';
import { validatePackage } from '../../blinkfx/validatePackage';
import { writeBlinkFxManifest } from '../../blinkfx/writeManifest';

const FIXTURES = [
    join(process.cwd(), 'src', 'packages', 'isf', '__tests__', 'fixtures'),
    join(process.cwd(), 'src', 'packages', 'shadertoy', '__tests__', 'fixtures'),
];

describe('converting the fixture corpora as a batch', () => {
    let out: string;
    let entries: BatchEntry[];

    beforeAll(() => {
        out = mkdtempSync(join(tmpdir(), 'blinkfx-batch-'));
        const jobs = FIXTURES.flatMap(root => discoverJobs(root, 'auto'));
        entries = convertBatch(jobs, out, { skipScripts: false, license: 'MIT' });
    });

    afterAll(() => {
        rmSync(out, { recursive: true, force: true });
    });

    it('discovers every fixture of both formats', () => {
        expect(entries.filter(entry => entry.format === 'isf')).toHaveLength(6);
        expect(entries.filter(entry => entry.format === 'shadertoy')).toHaveLength(11);
    });

    it('never crashes a converter', () => {
        expect(entries.filter(entry => entry.issues.some(issue => issue.code === 'converter-crash'))).toEqual([]);
    });

    it('explains every failure with an error issue', () => {
        for (const entry of entries.filter(candidate => candidate.status === 'failed')) {
            expect(
                entry.issues.some(issue => issue.severity === 'error'),
                entry.slug
            ).toBe(true);
        }
    });

    it('writes a package that validates for every conversion that did not fail', async () => {
        const converted = entries.filter(entry => entry.status !== 'failed');
        expect(converted.length).toBeGreaterThan(0);

        for (const entry of converted) {
            const result = await validatePackage(openPackage(join(out, `${entry.slug}.blinkfx`)));
            expect(
                result.findings.filter(finding => finding.severity === 'error'),
                entry.slug
            ).toEqual([]);
        }
    });

    it('round-trips every converted package through the IR to an equal one', async () => {
        for (const entry of entries.filter(candidate => candidate.status !== 'failed')) {
            const result = await validatePackage(openPackage(join(out, `${entry.slug}.blinkfx`)));
            const original = loadBlinkFx(result.manifest!, `effects/${entry.slug}.blinkfx`);
            const written = writeBlinkFxManifest(original);

            expect(loadBlinkFx(written, `effects/${entry.slug}.blinkfx`), entry.slug).toEqual(original);
            expect(writeBlinkFxManifest(loadBlinkFx(written, `effects/${entry.slug}.blinkfx`)), entry.slug).toEqual(
                written
            );
        }
    });

    it('records the batch in report.json and catalog.json', () => {
        const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as unknown[];
        const catalog = JSON.parse(readFileSync(join(out, 'catalog.json'), 'utf8')) as { packages: string[] };

        expect(report).toHaveLength(entries.length);
        expect(catalog.packages).toHaveLength(entries.filter(entry => entry.status !== 'failed').length);
    });

    it('summarizes statuses and issue frequencies', () => {
        const { statuses } = summarize(entries);

        expect(Object.values(statuses).reduce((sum, count) => sum + count, 0)).toBe(entries.length);
    });
});
