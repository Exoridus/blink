import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

import { chromium, type Browser, type Page } from 'playwright';
import { DEMO_MUSIC } from '../src/data/demoMusic.ts';

import { normalizeBase } from './lib/staticBuild.ts';
import { workspacePath } from './lib/workspacePaths.ts';

declare global {
    interface Window {
        __blinkSmokeDraws: number;
        __blinkSmokeGpuSubmits: number;
        __blinkSmokeGpuErrors: (string | null)[];
        __blinkSmokeAudio?: HTMLMediaElement;
        __blinkSmokeAudioPeak: number;
    }
}

const artifact = resolve(process.env.BLINK_SMOKE_ARTIFACT ?? 'dist/pages');
const base = normalizeBase(process.env.BLINK_SMOKE_BASE ?? '/blink/');
const backend = process.env.BLINK_SMOKE_BACKEND ?? 'webgl2';
const source = process.env.BLINK_SMOKE_SOURCE ?? 'mic';
if (!['mic', 'demo'].includes(source)) throw new Error('Unsupported smoke audio source');
const demoTrack = process.env.BLINK_SMOKE_TRACK ?? 'chiptune-stage-1';
if (!['webgl2', 'webgpu'].includes(backend)) throw new Error('Unsupported smoke backend');
if (source === 'demo' && backend !== 'webgl2')
    throw new Error('Demo music smoke requires WebGL2 audio-uniform instrumentation');
const effect = process.env.BLINK_SMOKE_EFFECT ?? (backend === 'webgpu' ? 'com.codexo.wgsl_probe' : 'com.codexo.aurora');
if (!/^[A-Za-z0-9._-]+$/.test(effect)) throw new Error('Invalid smoke effect identifier');
const evidence = workspacePath(
    'artifacts',
    'browser',
    backend,
    base === '/' ? 'local' : 'pages',
    effect,
    source === 'demo' ? demoTrack : source
);
mkdirSync(evidence, { recursive: true });
const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.glsl': 'text/plain',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
};
const server = createServer((request, response) => {
    try {
        let pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        if (!pathname.startsWith(base)) {
            response.writeHead(404).end();
            return;
        }
        if (pathname.endsWith('/')) pathname += 'index.html';
        const file = resolve(artifact, pathname.slice(base.length));
        if (!file.startsWith(`${artifact}${sep}`) || !existsSync(file) || !statSync(file).isFile()) {
            response.writeHead(404).end();
            return;
        }
        const size = statSync(file).size;
        const headers = {
            'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
            'Accept-Ranges': 'bytes',
        };
        const range = request.headers.range;
        if (range) {
            const match = /^bytes=(\d+)-(\d*)$/.exec(range);
            const start = match ? Number(match[1]) : -1;
            const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
            if (start < 0 || start >= size || end < start) {
                response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
                return;
            }
            response.writeHead(206, {
                ...headers,
                'Content-Length': end - start + 1,
                'Content-Range': `bytes ${start}-${end}/${size}`,
            });
            createReadStream(file, { start, end }).pipe(response);
        } else {
            response.writeHead(200, { ...headers, 'Content-Length': size });
            createReadStream(file).pipe(response);
        }
    } catch {
        response.writeHead(400).end();
    }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}${base}?backend=${backend}`;
let browser: Browser | undefined;
let page: Page | undefined;
const errors: string[] = [];
const failedResponses: { url: string; status: number }[] = [];
try {
    browser = await chromium.launch({
        headless: true,
        args: [
            ...(source === 'mic' ? ['--autoplay-policy=no-user-gesture-required'] : []),
            ...(backend === 'webgl2'
                ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
                : ['--enable-unsafe-webgpu']),
        ],
    });
    page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() });
    });
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript(() => {
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
            window.__blinkSmokeAudio = this;
            return play.call(this);
        };
        window.__blinkSmokeDraws = 0;
        window.__blinkSmokeGpuSubmits = 0;
        window.__blinkSmokeGpuErrors = [];
        window.__blinkSmokeAudioPeak = 0;
        const audioLocations = new WeakSet<WebGLUniformLocation>();
        const getLocation = WebGL2RenderingContext.prototype.getUniformLocation;
        WebGL2RenderingContext.prototype.getUniformLocation = function (program, name) {
            const location = getLocation.call(this, program, name);
            if (location && /^au_(?:level|bass|mid|midHigh|high)$/.test(name)) audioLocations.add(location);
            return location;
        };
        const observeAudio = (location: WebGLUniformLocation | null, value: number): void => {
            if (location && audioLocations.has(location) && Number.isFinite(value))
                window.__blinkSmokeAudioPeak = Math.max(window.__blinkSmokeAudioPeak, value);
        };
        const uniform1f = WebGL2RenderingContext.prototype.uniform1f;
        WebGL2RenderingContext.prototype.uniform1f = function (location, value) {
            observeAudio(location, value);
            uniform1f.call(this, location, value);
        };
        const uniform1fv = WebGL2RenderingContext.prototype.uniform1fv;
        WebGL2RenderingContext.prototype.uniform1fv = function (location, values, offset, length) {
            const data = Array.from(values);
            observeAudio(location, data[offset ?? 0]);
            uniform1fv.call(this, location, data, offset, length);
        };
        if (typeof GPUQueue !== 'undefined') {
            const submit = GPUQueue.prototype.submit;
            GPUQueue.prototype.submit = function (this: GPUQueue, ...args: Parameters<GPUQueue['submit']>) {
                window.__blinkSmokeGpuSubmits++;
                return submit.apply(this, args);
            };
            const requestDevice = GPUAdapter.prototype.requestDevice;
            GPUAdapter.prototype.requestDevice = async function (
                this: GPUAdapter,
                ...args: Parameters<GPUAdapter['requestDevice']>
            ) {
                const device = await requestDevice.apply(this, args);
                device.addEventListener('uncapturederror', event =>
                    window.__blinkSmokeGpuErrors.push(event.error.message)
                );
                return device;
            };
        }
        const drawArrays = WebGL2RenderingContext.prototype.drawArrays;
        WebGL2RenderingContext.prototype.drawArrays = function (mode, first, count) {
            window.__blinkSmokeDraws++;
            return drawArrays.call(this, mode, first, count);
        };
        const drawElements = WebGL2RenderingContext.prototype.drawElements;
        WebGL2RenderingContext.prototype.drawElements = function (mode, count, type, offset) {
            window.__blinkSmokeDraws++;
            return drawElements.call(this, mode, count, type, offset);
        };
        const compile = WebGL2RenderingContext.prototype.compileShader;
        WebGL2RenderingContext.prototype.compileShader = function (shader) {
            compile.call(this, shader);
            if (!this.getShaderParameter(shader, this.COMPILE_STATUS))
                window.__blinkSmokeGpuErrors.push(this.getShaderInfoLog(shader));
        };
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
            value: async () => {
                const context = new AudioContext();
                await context.resume();
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                const destination = context.createMediaStreamDestination();
                oscillator.frequency.value = 80;
                gain.gain.value = 0.1;
                oscillator.connect(gain).connect(destination);
                oscillator.start();
                return destination.stream;
            },
        });
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.start-screen').waitFor();
    if (backend === 'webgpu') {
        assert.ok(
            await page.evaluate(async () => Boolean(navigator.gpu && (await navigator.gpu.requestAdapter()))),
            'WebGPU adapter unavailable'
        );
    }
    if (source === 'demo') await page.locator('[data-demo-music]').selectOption(demoTrack);
    else await page.locator('[data-source-tile="mic"] button').first().click();
    await page.locator(`[data-effect-id="${effect}"]`).click();
    await page.locator('.start-screen').waitFor({ state: 'detached', timeout: 30_000 });
    if (source === 'demo') {
        await page.waitForFunction(
            () =>
                window.__blinkSmokeAudio !== undefined &&
                !window.__blinkSmokeAudio.paused &&
                window.__blinkSmokeAudio.currentTime > 0.1
        );
        const audio = await page.evaluate(() => ({
            src: window.__blinkSmokeAudio?.currentSrc,
            duration: window.__blinkSmokeAudio?.duration,
        }));
        assert.ok(audio.src?.startsWith(`http://127.0.0.1:${address.port}${base}audio/demo/`));
        assert.ok(audio.duration !== undefined && audio.duration > 1);
        const index = DEMO_MUSIC.findIndex(track => track.id === demoTrack);
        assert.ok(index >= 0, 'Unknown demo track');
        const next = DEMO_MUSIC[(index + 1) % DEMO_MUSIC.length];
        const transport = await page.evaluate(async nextUrl => {
            const audio = window.__blinkSmokeAudio;
            if (!audio) throw new Error('Missing active music element');
            const waitFor = async (ready: () => boolean): Promise<void> => {
                const deadline = performance.now() + 5000;
                while (!ready()) {
                    if (performance.now() > deadline) throw new Error('Music transport timed out');
                    await new Promise(resolve => setTimeout(resolve, 25));
                }
            };
            audio.pause();
            const pausedAt = audio.currentTime;
            await new Promise(resolve => setTimeout(resolve, 150));
            if (!audio.paused || Math.abs(audio.currentTime - pausedAt) > 0.01)
                throw new Error('Paused music advanced');
            await audio.play();
            await waitFor(() => audio.currentTime > pausedAt + 0.05);
            if (!audio.loop) throw new Error('Demo music is not looped');
            audio.currentTime = audio.duration - 0.15;
            await waitFor(() => audio.currentTime < 1 && !audio.paused);
            audio.pause();
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => finish(new Error('Music switch timed out')), 5000);
                const finish = (error?: Error): void => {
                    clearTimeout(timeout);
                    audio.removeEventListener('canplay', ready);
                    audio.removeEventListener('error', failed);
                    if (error) reject(error);
                    else resolve();
                };
                const ready = () => finish();
                const failed = () => finish(new Error('Switched music failed to decode'));
                audio.addEventListener('canplay', ready);
                audio.addEventListener('error', failed);
                audio.src = nextUrl;
                audio.load();
            });
            await audio.play();
            await waitFor(() => audio.currentTime > 0.1 && !audio.paused);
            return { paused: true, resumed: true, looped: true, switched: audio.currentSrc === nextUrl };
        }, `http://127.0.0.1:${address.port}${base}${next.path}`);
        assert.deepEqual(transport, { paused: true, resumed: true, looped: true, switched: true });
        const drawsBeforeSwitch = await page.evaluate(() => window.__blinkSmokeDraws);
        await page
            .locator('[data-shell-id="effect-panel"] .effect-panel__item')
            .filter({ hasText: 'Prism Orbit' })
            .click();
        await page.waitForFunction(before => window.__blinkSmokeDraws > before + 5, drawsBeforeSwitch);
        assert.equal(
            await page.evaluate(() => window.__blinkSmokeAudio?.paused),
            false,
            'Effect switch interrupted playback'
        );
        assert.ok(
            await page.evaluate(() => window.__blinkSmokeAudioPeak > 0),
            'Decoded music did not reach native audio uniforms'
        );
    }
    if (backend === 'webgl2') await page.waitForFunction(() => window.__blinkSmokeDraws > 5, null, { timeout: 15_000 });
    else await page.waitForFunction(() => window.__blinkSmokeGpuSubmits > 5, null, { timeout: 15_000 });
    const result = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#view');
        if (!canvas) throw new Error('Missing smoke canvas');
        return {
            draws: window.__blinkSmokeDraws,
            gpuSubmits: window.__blinkSmokeGpuSubmits,
            shaderErrors: window.__blinkSmokeGpuErrors,
            audioPeak: window.__blinkSmokeAudioPeak,
            canvas: { width: canvas.width, height: canvas.height },
        };
    });
    assert.deepEqual(errors, [], 'Browser errors');
    assert.deepEqual(failedResponses, [], 'Missing build resources');
    assert.deepEqual(result.shaderErrors, [], 'GPU compile errors');
    assert.ok(result.canvas.width > 0 && result.canvas.height > 0);
    await page.screenshot({ path: `${evidence}/frame.png` });
    writeFileSync(`${evidence}/result.json`, JSON.stringify({ backend, base, effect, source, ...result }, null, 2));
    console.log(`Browser smoke passed: ${backend}, ${base}, ${result.draws} WebGL draws`);
} catch (error) {
    if (page) await page.screenshot({ path: `${evidence}/failure.png` }).catch(() => {});
    writeFileSync(
        `${evidence}/failure.json`,
        JSON.stringify({ backend, base, error: String(error), errors, failedResponses }, null, 2)
    );
    throw error;
} finally {
    await browser?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
}
