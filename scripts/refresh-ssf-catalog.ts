import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { MemoryPackageFiles } from '../src/packages/blinkfx/packageReader';
import { validatePackage } from '../src/packages/blinkfx/validatePackage';
import { convertSsfScene } from '../src/packages/ssf/convert/convertSsfScene';
import type { SsfCatalogEntry } from '../src/services/SsfSceneLoader';
import { findSsfScenes, readSsfScene } from './lib/ssfDirectory';

const args = process.argv.slice(2).filter(arg => arg !== '--');
const root = resolve(args.find(arg => !arg.startsWith('--')) ?? 'public/effects');
const includeFailed = args.includes('--include-failed');
const catalogPath = join(root, 'catalog.json');
const existing = JSON.parse(readFileSync(catalogPath, 'utf8')) as { packages: Array<string | SsfCatalogEntry> };
const entries: SsfCatalogEntry[] = [];
const reports = [];
const encoder = new TextEncoder();
for (const directory of findSsfScenes(root)) {
    const name = relative(root, directory).split(sep).join('/');
    const scene = { ...readSsfScene(directory), slug: name.replace(/\.synScene$/, '').replaceAll('/', '_') };
    const converted = convertSsfScene(scene);
    const files = new MemoryPackageFiles(
        new Map(
            [...converted.files].map(([path, value]) => [
                path,
                typeof value === 'string' ? encoder.encode(value) : value,
            ])
        )
    );
    const validation = await validatePackage(files, { maxTextureBindings: 16 });
    const supported = converted.report.status !== 'failed' && validation.valid;
    const prior = existing.packages.find(
        (entry): entry is SsfCatalogEntry => typeof entry !== 'string' && entry.scene === `effects/${name}/scene.json`
    );
    const collection = prior?.collection ?? (name.includes('/') ? 'community' : 'builtin');
    if (supported || includeFailed)
        entries.push({
            id: converted.manifest.id,
            title: converted.manifest.title,
            description: converted.manifest.description,
            collection,
            scene: `effects/${name}/scene.json`,
            files: [...scene.files.keys()].sort(),
        });
    reports.push({
        scene: name,
        collection,
        listed: supported || includeFailed,
        ...converted.report,
        findings: validation.findings,
    });
}
writeFileSync(
    catalogPath,
    `${JSON.stringify({ packages: [...existing.packages.filter(entry => typeof entry === 'string'), ...entries] }, null, 2)}\n`
);
writeFileSync(join(root, 'ssf-import-report.json'), `${JSON.stringify(reports, null, 2)}\n`);
console.log(
    `${entries.length} scenes listed; ${reports.filter(row => row.status === 'failed' || row.findings.some(f => f.severity === 'error')).length} structurally unsupported.`
);
