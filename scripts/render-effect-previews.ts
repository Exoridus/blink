import { workspacePath } from './lib/workspacePaths.ts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const argument = (name: string, fallback: string) =>
    process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const root = resolve(import.meta.dirname, '..');
const width = 320;
const height = 180;
const framesToRender = Number(argument('--frames', '6'));
const timeoutMs = Number(argument('--timeout-ms', '120000'));
if (!Number.isSafeInteger(framesToRender) || framesToRender < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000)
    throw new Error('Invalid preview frame count or timeout');
const url = argument('--url', 'http://127.0.0.1:8080/');
const only = argument('--only', '').split(',').filter(Boolean);
const directory = join(root, 'public/effects/previews');
const manifestPath = join(directory, 'manifest.json');
const reportPath = resolve(root, argument('--report', workspacePath('artifacts/effect-previews/report.json')));
mkdirSync(directory, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });
const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          version: number;
          previews: Record<string, { path: string; fingerprint: string; source: string }>;
      })
    : { version: 1, previews: {} };
if (manifest.version !== 1 || typeof manifest.previews !== 'object' || manifest.previews === null)
    throw new Error('Unsupported preview manifest');
interface PreviewRow {
    id: string;
    cached?: boolean;
    source?: string;
    litPixels?: number;
    frames?: number;
    gpuError?: number;
    elapsedMs?: number;
    error?: string;
}
const report: PreviewRow[] = [];

function filesIn(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => {
            const path = join(directory, entry.name);
            return entry.isDirectory() ? filesIn(path) : entry.isFile() ? [path] : [];
        })
        .sort();
}
function hashFiles(files: string[]) {
    const hash = createHash('sha256');
    for (const path of files) {
        const bytes = readFileSync(path);
        hash.update(relative(root, path).split(sep).join('/'));
        hash.update('\0');
        hash.update(String(bytes.length));
        hash.update('\0');
        hash.update(bytes);
    }
    return hash.digest('hex');
}
const runtimeFiles = [
    ...filesIn(join(root, 'src/packages')),
    ...filesIn(join(root, 'src/runtime')),
    ...[
        'src/services/RenderService.ts',
        'src/services/AudioService.ts',
        'src/services/SsfSceneLoader.ts',
        'src/classes/Application.ts',
        'src/types.ts',
        'package-lock.json',
        'scripts/render-effect-previews.ts',
        'scripts/lib/renderEffectPreview.ts',
    ].map(path => join(root, path)),
].filter(path => !path.includes(`${sep}__tests__${sep}`));
const runtimeHash = hashFiles(runtimeFiles);
const entries = (
    JSON.parse(readFileSync(join(root, 'public/effects/catalog.json'), 'utf8')) as {
        packages: Array<string | { id: string; title: string; scene: string; files: string[] }>;
    }
).packages;
const packages = entries.map(entry => {
    const source =
        typeof entry === 'string'
            ? (JSON.parse(readFileSync(join(root, 'public', entry), 'utf8')) as { id: string; title: string })
            : entry;
    const path = typeof entry === 'string' ? entry : entry.scene;
    return {
        id: source.id,
        title: source.title,
        basePath: `/${dirname(path).split(sep).join('/')}`,
        sourceFiles: typeof entry === 'string' ? undefined : entry.files,
    };
});
const selected = packages.filter(pkg => only.length === 0 || only.some(id => pkg.id.includes(id)));
if (selected.length === 0) throw new Error('No effects matched --only');
const ids = new Set(packages.map(pkg => pkg.id));
for (const id of Object.keys(manifest.previews)) if (!ids.has(id)) delete manifest.previews[id];
const persist = () => {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(
        reportPath,
        JSON.stringify({ version: 1, runtimeHash, width, height, framesToRender, results: report }, null, 2) + '\n'
    );
};
let server;
try {
    await fetch(new URL('effects/catalog.json', url), { signal: AbortSignal.timeout(2000) });
} catch {
    if (process.argv.includes('--url')) throw new Error(`Preview server unavailable: ${url}`);
    server = spawn(
        process.execPath,
        [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '8080', '--strictPort'],
        { cwd: root, windowsHide: true, stdio: 'ignore' }
    );
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            ready = (await fetch(new URL('effects/catalog.json', url), { signal: AbortSignal.timeout(1000) })).ok;
        } catch {
            /* Vite is still starting. */
        }
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) {
        server.kill();
        throw new Error('Could not start the local preview server');
    }
}
const { chromium } = (await import(
    argument('--playwright', '') ? pathToFileURL(resolve(root, argument('--playwright', ''))).href : 'playwright'
)) as typeof import('playwright');
const launch = () => chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
let browser;
try {
    browser = await launch();
    for (const [index, pkg] of selected.entries()) {
        const fingerprint = createHash('sha256')
            .update(runtimeHash)
            .update(hashFiles(filesIn(join(root, 'public', pkg.basePath.slice(1)))))
            .update(JSON.stringify({ id: pkg.id, sourceFiles: pkg.sourceFiles, width, height, framesToRender }))
            .digest('hex');
        const previous = manifest.previews[pkg.id];
        if (
            !process.argv.includes('--force') &&
            previous?.fingerprint === fingerprint &&
            existsSync(join(root, 'public', previous.path))
        ) {
            report.push({ id: pkg.id, cached: true, source: previous.source });
            persist();
            console.log(`${index + 1}/${selected.length} CACHED ${pkg.id}`);
            continue;
        }
        const page = await browser.newPage({ viewport: { width, height } });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const started = Date.now();
        let row: PreviewRow;
        try {
            await page.route('**/@vite/client', route =>
                route.fulfill({
                    contentType: 'application/javascript',
                    body: 'export const createHotContext=()=>({accept(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}});export const updateStyle=()=>{},removeStyle=()=>{},injectQuery=x=>x;',
                })
            );
            await page.route(url, route =>
                route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' })
            );
            await page.goto(url);
            const result = await Promise.race([
                page.evaluate(
                    async options =>
                        (
                            await (import('/scripts/lib/renderEffectPreview.ts' as string) as Promise<
                                typeof import('./lib/renderEffectPreview.ts')
                            >)
                        ).renderEffectPreview(options),
                    { pkg, framesToRender, timeoutMs, width, height }
                ),
                new Promise<never>((_, reject) => {
                    const timer = setTimeout(() => reject(new Error('Preview watchdog expired')), timeoutMs);
                    timer.unref();
                }),
            ]);
            if (errors.length > 0) throw new Error(errors.join('; '));
            const slug = pkg.id.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
            const path = `effects/previews/${slug}-${fingerprint.slice(0, 16)}.png`;
            writeFileSync(join(root, 'public', path), Buffer.from(result.dataUrl.split(',')[1], 'base64'));
            manifest.previews[pkg.id] = { path, fingerprint, source: result.source };
            row = {
                id: pkg.id,
                source: result.source,
                litPixels: result.litPixels,
                frames: result.frames,
                gpuError: result.gpuError,
                elapsedMs: Date.now() - started,
            };
        } catch (error) {
            row = { id: pkg.id, error: String(error), elapsedMs: Date.now() - started };
        } finally {
            await page.close({ runBeforeUnload: false }).catch(() => undefined);
        }
        report.push(row);
        persist();
        console.log(
            `${index + 1}/${selected.length} ${row.error ? 'FAIL' : row.source!.toUpperCase()} ${pkg.id} (${row.elapsedMs}ms)${row.error ? ` ${row.error}` : ''}`
        );
        if (process.argv.includes('--fresh-browser') || row.error) {
            await browser.close();
            browser = await launch();
        }
    }
} finally {
    await browser?.close();
    server?.kill();
}
persist();
console.log(`${Object.keys(manifest.previews).length}/${packages.length} previews available`);
if (report.some(row => row.error)) process.exitCode = 1;
