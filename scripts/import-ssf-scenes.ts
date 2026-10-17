import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { MemoryPackageFiles } from '../src/packages/blinkfx/packageReader';
import { validatePackage } from '../src/packages/blinkfx/validatePackage';
import { convertSsfScene } from '../src/packages/ssf/convert/convertSsfScene';
import type { SsfCatalogEntry } from '../src/services/SsfSceneLoader';
import { findSsfScenes, readSsfScene } from './lib/ssfDirectory';

const [outArgument, ...roots] = process.argv.slice(2).filter(arg => arg !== '--');
if (outArgument === undefined || roots.length === 0)
    throw new Error('Usage: vite-node scripts/import-ssf-scenes.ts -- <output directory> <source directory>...');
const out = resolve(outArgument);
const directories = roots.flatMap(root => findSsfScenes(resolve(root)));
const builtinRoot = resolve(roots[0]);
const location = (directory: string): string =>
    relative(builtinRoot, directory).startsWith('..')
        ? join(basename(dirname(directory)), basename(directory))
        : basename(directory);
const names = new Set<string>();
for (const directory of directories) {
    const name = location(directory).toLowerCase();
    if (names.has(name)) throw new Error(`Duplicate scene directory: ${basename(directory)}`);
    names.add(name);
    const destination = join(out, location(directory));
    if (directory === destination || directory.startsWith(`${out}${sep}`))
        throw new Error('Source and output must be separate');
    if (existsSync(destination)) throw new Error(`Output already exists: ${destination}`);
}
mkdirSync(out, { recursive: true });
const encoder = new TextEncoder();
const catalog: SsfCatalogEntry[] = [];
const reports = [];
for (const directory of directories) {
    const original = readSsfScene(directory);
    const name = location(directory).split(sep).join('/');
    const scene = { ...original, slug: name.replace(/\.synScene$/, '').replaceAll('/', '_') };
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
    mkdirSync(dirname(join(out, name)), { recursive: true });
    cpSync(directory, join(out, name), { recursive: true, errorOnExist: true, force: false });
    if (supported)
        catalog.push({
            id: converted.manifest.id,
            title: converted.manifest.title,
            description: converted.manifest.description,
            collection: relative(builtinRoot, directory).startsWith('..') ? 'community' : 'builtin',
            scene: `effects/${name}/scene.json`,
            files: [...scene.files.keys()].sort(),
        });
    reports.push({
        scene: name,
        collection: relative(resolve(roots[0]), directory).startsWith('..') ? 'community' : 'builtin',
        listed: supported,
        ...converted.report,
        findings: validation.findings,
    });
}
const catalogPath = join(out, 'catalog.json');
const existing = existsSync(catalogPath)
    ? (JSON.parse(readFileSync(catalogPath, 'utf8')) as { packages: Array<string | SsfCatalogEntry> })
    : { packages: [] };
const retained = existing.packages.filter(
    entry => typeof entry === 'string' && !entry.includes('audio_indicators.blinkfx')
);
writeFileSync(catalogPath, `${JSON.stringify({ packages: [...retained, ...catalog] }, null, 2)}\n`);
writeFileSync(join(out, 'ssf-import-report.json'), `${JSON.stringify(reports, null, 2)}\n`);
console.log(
    `${directories.length} original scenes copied; ${catalog.length} listed; ${directories.length - catalog.length} blocked by missing dependencies or runtime limits.`
);
for (const report of reports.filter(row => !row.listed))
    console.log(
        `${report.scene}: ${[...report.issues, ...report.findings]
            .filter(issue => issue.severity === 'error')
            .map(issue => issue.message)
            .join('; ')}`
    );
