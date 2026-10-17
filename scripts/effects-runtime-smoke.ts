import { workspacePath } from './lib/workspacePaths.ts';
/* global document, window */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const argument = (name: string, fallback: string) =>
    process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const output = resolve(argument('--out', workspacePath('artifacts/effects-runtime-smoke.json')));
const url = argument('--url', 'http://127.0.0.1:8080/');
const framesToRender = Number(argument('--frames', '6'));
const timeoutMs = Number(argument('--timeout-ms', '120000'));
if (!Number.isSafeInteger(framesToRender) || framesToRender < 1 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000)
    throw new Error('Invalid smoke frame count or timeout');
const only = argument('--only', '').split(',').filter(Boolean);
const withoutHmr = async (page: import('playwright').Page) =>
    page.route('**/@vite/client', route =>
        route.fulfill({
            contentType: 'application/javascript',
            body: 'export const createHotContext = () => ({accept(){},dispose(){},prune(){},invalidate(){},on(){},off(){},send(){},data:{}}); export const updateStyle=()=>{},removeStyle=()=>{},injectQuery=x=>x;',
        })
    );
const { chromium } = (await import(
    argument('--playwright', '') ? pathToFileURL(resolve(argument('--playwright', ''))).href : 'playwright'
)) as typeof import('playwright');
let browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
interface SmokeResult {
    id: string;
    scene: string;
    collection: string;
    success: boolean;
    errors: string[];
    elapsedMs: number;
    error?: string;
    stage?: string;
    frames?: number;
    gpuError?: number;
    litPixels?: number;
    faults?: readonly import('../src/runtime/health/FaultGuard.ts').FaultRecord[];
}
const results: SmokeResult[] = [];
mkdirSync(dirname(output), { recursive: true });
try {
    const listing = await browser.newPage();
    await withoutHmr(listing);
    await listing.route(url, route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await listing.goto(url);
    const packages = await listing.evaluate(async () =>
        new (
            await (import('/src/services/BlinkFxService.ts' as string) as Promise<
                typeof import('../src/services/BlinkFxService.ts')
            >)
        ).BlinkFxService().getPackageList()
    );
    await listing.close();
    for (const pkg of packages.filter(p => only.length === 0 || only.some(id => p.id.includes(id)))) {
        const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
        const errors: string[] = [];
        let stage = 'loading';
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
            if (message.text().startsWith('[effect-smoke] ')) stage = message.text().slice(15);
        });
        const started = Date.now();
        try {
            await withoutHmr(page);
            await page.route(url, route =>
                route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' })
            );
            await page.goto(url);
            const result = await Promise.race([
                page.evaluate(
                    async ({ id, framesToRender, timeoutMs }) => {
                        const audioModule = await (await fetch('/src/services/AudioService.ts')).text();
                        const exoUrl = audioModule.match(/from ["']([^"']*exojs(?:\.js)?[^"']*)["']/)![1];
                        const [
                            { Application },
                            { RenderService },
                            { AudioService },
                            { EnvService },
                            { BlinkFxService },
                            { getAudioContext },
                            { UniformType: U },
                        ] = await Promise.all([
                            import('/src/classes/Application.ts' as string) as Promise<
                                typeof import('../src/classes/Application.ts')
                            >,
                            import('/src/services/RenderService.ts' as string) as Promise<
                                typeof import('../src/services/RenderService.ts')
                            >,
                            import('/src/services/AudioService.ts' as string) as Promise<
                                typeof import('../src/services/AudioService.ts')
                            >,
                            import('/src/services/EnvService.ts' as string) as Promise<
                                typeof import('../src/services/EnvService.ts')
                            >,
                            import('/src/services/BlinkFxService.ts' as string) as Promise<
                                typeof import('../src/services/BlinkFxService.ts')
                            >,
                            import(exoUrl) as Promise<typeof import('@codexo/exojs')>,
                            import('/src/types.ts' as string) as Promise<typeof import('../src/types.ts')>,
                        ]);
                        const canvas = document.createElement('canvas');
                        document.body.append(canvas);
                        const context = getAudioContext();
                        await context.resume();
                        const oscillator = context.createOscillator();
                        oscillator.frequency.value = 80;
                        const gain = context.createGain();
                        gain.gain.value = 0.1;
                        oscillator.connect(gain);
                        oscillator.start();
                        const audio = new AudioService(gain, 2048);
                        const uniforms: import('../src/types.ts').GlobalUniforms = {
                            TIME: U.FLOAT,
                            TIMEDELTA: U.FLOAT,
                            FRAMECOUNT: U.INT,
                            PASSINDEX: U.INT,
                            RESOLUTION: U.FLOAT_VEC2,
                            DATE: U.FLOAT_VEC4,
                            SURFACEPOSITION: U.FLOAT_VEC2,
                            MOUSE: U.FLOAT_VEC4,
                            BASS: U.FLOAT_VEC4,
                            MID: U.FLOAT_VEC4,
                            TREBLE: U.FLOAT_VEC4,
                            BASSTIME: U.FLOAT,
                            MIDTIME: U.FLOAT,
                            TREBLETIME: U.FLOAT,
                            BPM: U.INT,
                        };
                        const render = new RenderService(
                            audio,
                            {
                                view: canvas,
                                width: 320,
                                height: 180,
                                backgroundColor: 0,
                                backgroundAlpha: 1,
                                useContextAlpha: false,
                                antialias: false,
                                clearBeforeRender: true,
                                preserveDrawingBuffer: true,
                                powerPreference: 'high-performance',
                                backend: 'webgl2',
                            },
                            uniforms
                        );
                        render.setOutputSettings({
                            width: 320,
                            height: 180,
                            fitting: 'contain',
                            fpsCap: 60,
                            uiScale: 1,
                        });
                        const app = new Application(
                            new EnvService('production', 'smoke'),
                            render,
                            new BlinkFxService()
                        );
                        let faults: readonly import('../src/runtime/health/FaultGuard.ts').FaultRecord[] = [];
                        app.subscribeState(state => {
                            faults = state.faults ?? [];
                        });
                        try {
                            await app.init(id);
                            console.debug('[effect-smoke] activated');
                            let frames = 0;
                            await new Promise<void>((resolve, reject) => {
                                const deadline = window.setTimeout(
                                    () => reject(new Error('Timed out waiting for rendered frames')),
                                    timeoutMs - 1000
                                );
                                const observe = () => {
                                    frames++;
                                    console.debug('[effect-smoke] frame-' + frames);
                                    if (frames >= framesToRender || faults.length > 0) {
                                        window.clearTimeout(deadline);
                                        render.onUpdate.remove(observe);
                                        resolve();
                                    }
                                };
                                render.onUpdate.add(observe);
                            });
                            console.debug('[effect-smoke] gpu-readback');
                            const gl = canvas.getContext('webgl2')!;
                            gl.finish();
                            const pixels = new Uint8Array(320 * 180 * 4);
                            gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                            const gpuError = gl.getError();
                            let litPixels = 0;
                            for (let i = 0; i < pixels.length; i += 4)
                                if (pixels[i] || pixels[i + 1] || pixels[i + 2]) litPixels++;
                            return {
                                success: faults.length === 0 && gpuError === 0,
                                frames,
                                faults,
                                gpuError,
                                litPixels,
                            };
                        } finally {
                            await app.destroy();
                            oscillator.stop();
                            gain.disconnect();
                        }
                    },
                    { id: pkg.id, framesToRender, timeoutMs }
                ),
                new Promise<never>((_, reject) => {
                    const timer = setTimeout(() => reject(new Error('Browser scene watchdog expired')), timeoutMs);
                    timer.unref();
                }),
            ]);
            results.push({
                id: pkg.id,
                scene: pkg.basePath,
                collection: pkg.sourceCollection ?? 'blinkfx',
                ...result,
                errors,
                success: result.success && errors.length === 0,
                elapsedMs: Date.now() - started,
            });
        } catch (error) {
            results.push({
                id: pkg.id,
                scene: pkg.basePath,
                collection: pkg.sourceCollection ?? 'blinkfx',
                success: false,
                error: String(error),
                stage,
                errors,
                elapsedMs: Date.now() - started,
            });
        } finally {
            await page.close({ runBeforeUnload: false }).catch(() => undefined);
        }
        writeFileSync(output, JSON.stringify(results, null, 2) + '\n');
        const row = results.at(-1)!;
        if (
            !process.argv.includes('--reuse-browser') ||
            (!row.success && /watchdog|Timed out|context was destroyed/.test(row.error ?? ''))
        ) {
            await browser.close();
            browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
        }
        console.log(
            `${row.success ? 'PASS' : 'FAIL'} ${pkg.id} (${row.elapsedMs}ms) ${row.error ?? row.faults?.map(f => f.message).join('; ') ?? ''}`
        );
    }
} finally {
    await browser.close();
}
console.log(`${results.filter(r => r.success).length}/${results.length} passed`);
if (results.some(r => !r.success)) process.exitCode = 1;
