import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type { ConversionReport, ConvertedPackage } from '../../src/packages/convert/report';
import { convertIsf } from '../../src/packages/isf/convert/convertIsf';
import { convertShadertoy } from '../../src/packages/shadertoy/convert/convertShadertoy';
import { convertSsfScene } from '../../src/packages/ssf/convert/convertSsfScene';
import { findIsfShaders, readIsfShader } from './isfDirectory';
import { writeFiles } from './packageDirectory';
import { findSsfScenes, readSsfScene } from './ssfDirectory';

export type SourceFormat = 'ssf' | 'isf' | 'shadertoy';

export interface ConvertJob {
    readonly format: SourceFormat;
    readonly path: string;
}

export interface BatchOptions {
    readonly skipScripts: boolean;
    readonly license: string | undefined;
}

export interface BatchEntry extends ConversionReport {
    readonly format: SourceFormat;
    readonly source: string;
    readonly milliseconds: number;
}

/** What a path is: a scene directory, a shader file or an export. A plain directory yields what it contains. */
export function discoverJobs(input: string, format: SourceFormat | 'auto'): ConvertJob[] {
    const jobs: ConvertJob[] = [];
    const stat = statSync(input);
    const wants = (candidate: SourceFormat): boolean => format === 'auto' || format === candidate;

    if (stat.isDirectory()) {
        if (input.endsWith('.synScene')) {
            return wants('ssf') ? [{ format: 'ssf', path: input }] : [];
        }
        if (wants('ssf')) jobs.push(...findSsfScenes(input).map((path): ConvertJob => ({ format: 'ssf', path })));
        if (wants('isf')) jobs.push(...findIsfShaders(input).map((path): ConvertJob => ({ format: 'isf', path })));
        if (wants('shadertoy')) {
            for (const name of readdirSync(input)) {
                if (name.endsWith('.json') && !['report.json', 'catalog.json'].includes(name)) {
                    jobs.push({ format: 'shadertoy', path: join(input, name) });
                }
            }
        }
        return jobs;
    }
    if (input.endsWith('.fs') && wants('isf')) return [{ format: 'isf', path: input }];
    if (input.endsWith('.json') && wants('shadertoy')) return [{ format: 'shadertoy', path: input }];
    return [];
}

function convertOne(job: ConvertJob, slug: string, options: BatchOptions): ConvertedPackage {
    if (job.format === 'ssf') {
        return convertSsfScene({ ...readSsfScene(job.path), slug }, { skipScript: options.skipScripts });
    }
    if (job.format === 'isf') {
        return convertIsf({ ...readIsfShader(job.path), slug });
    }
    const directory = dirname(job.path);
    const files = new Map<string, Uint8Array>();
    for (const name of readdirSync(directory)) {
        const full = join(directory, name);
        if (/\.(png|jpe?g|gif|webp)$/i.test(name) && statSync(full).size < 16 * 1024 * 1024)
            files.set(name, readFileSync(full));
    }
    return convertShadertoy(
        { slug, json: JSON.parse(readFileSync(job.path, 'utf8')) as unknown, files },
        { license: options.license }
    );
}

/** Converts every job into `<out>/<slug>.blinkfx`, with a `report.json` and a `catalog.json`. */
export function convertBatch(jobs: readonly ConvertJob[], outDir: string, options: BatchOptions): BatchEntry[] {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const entries: BatchEntry[] = [];
    const catalog: string[] = [];
    const used = new Set<string>();

    for (const job of jobs) {
        const base = basename(job.path).replace(/\.(synScene|fs|json)$/, '');
        let slug = base;
        for (let suffix = 2; used.has(slug); suffix++) slug = `${base}_${suffix}`;
        used.add(slug);

        const started = performance.now();
        try {
            const converted = convertOne(job, slug, options);
            entries.push({
                ...converted.report,
                format: job.format,
                source: job.path,
                milliseconds: performance.now() - started,
            });
            if (converted.report.status !== 'failed') {
                writeFiles(join(outDir, `${slug}.blinkfx`), converted.files);
                catalog.push(`${slug}.blinkfx/manifest.json`);
            }
        } catch (error) {
            entries.push({
                slug,
                status: 'failed',
                features: [],
                issues: [
                    {
                        severity: 'error',
                        code: 'converter-crash',
                        message: error instanceof Error ? (error.stack ?? error.message) : String(error),
                    },
                ],
                format: job.format,
                source: job.path,
                milliseconds: performance.now() - started,
            });
        }
    }

    writeFileSync(join(outDir, 'report.json'), JSON.stringify(entries, null, 2));
    writeFileSync(join(outDir, 'catalog.json'), JSON.stringify({ packages: catalog }, null, 2));
    return entries;
}

/** Counts by status and the most frequent issue codes, for a corpus summary. */
export function summarize(entries: readonly ConversionReport[]): {
    statuses: Record<string, number>;
    issues: Array<[string, number]>;
} {
    const statuses: Record<string, number> = {};
    const issues = new Map<string, number>();
    for (const entry of entries) {
        statuses[entry.status] = (statuses[entry.status] ?? 0) + 1;
        for (const code of new Set(entry.issues.map(issue => issue.code)))
            issues.set(code, (issues.get(code) ?? 0) + 1);
    }
    return { statuses, issues: [...issues.entries()].sort((a, b) => b[1] - a[1]) };
}
