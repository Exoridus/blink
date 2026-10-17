import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { build } from 'vite';

import { buildDocs } from './build-docs.ts';
import { normalizeBase, preparePublicAssets } from './lib/staticBuild.ts';

const mode = process.argv[2];
if (mode !== 'local' && mode !== 'pages') throw new Error('Build mode must be local or pages');
const base = normalizeBase(mode === 'pages' ? (process.env.BLINK_BASE ?? '/blink/') : '/');
const outDir = resolve('dist', mode);
const publicDir = mode === 'pages' ? mkdtempSync(join(tmpdir(), 'blink-public-')) : resolve('public');
try {
    if (mode === 'pages') {
        preparePublicAssets(
            resolve('public'),
            publicDir,
            (JSON.parse(readFileSync('public/release-effects.json', 'utf8')) as { packages: string[] }).packages
        );
    }
    await build({
        configFile: resolve('vite.config.ts'),
        base,
        publicDir,
        build: { outDir, emptyOutDir: true, sourcemap: false, minify: true },
    });
    if (mode === 'pages') buildDocs(join(outDir, 'docs'), `${base}docs/`);
} finally {
    if (mode === 'pages') rmSync(publicDir, { recursive: true, force: true });
}
