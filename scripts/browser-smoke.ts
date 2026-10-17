// Loads every catalog effect in a real headless Chrome (software GL) and reports shader
// compile/link errors, console errors and whether the canvas actually shows something.
//
//   node scripts/browser-smoke.ts [--url http://localhost:8080] [--chrome <path>]
//        [--out <dir>] [--only <comma separated effect id suffixes>] [--wait <ms>] [--eval <js expression>] [--verbose 1] [--catalog <url path to a catalog.json>]
//        [--install-check 1] [--chrome-flags "<extra flags, space separated>"]
//        [--probe-capture <out.zip>] [--probe-seconds 99] [--backend webgpu] [--parity-check <effect id suffix>]
//
// --probe-capture records a probe session: the audio_debug effect plays the deterministic probe
// master while the surface recorder runs, and the session archive is written to the given file,
// ready for `npm run audio-parity` to compare against a stored baseline. The capture is real time:
// the probe's length plus a few seconds of margin.
//
// --parity-check runs one effect on WebGL2 and on WebGPU and compares the two pictures pixel by
// pixel, with the shell hidden so only the canvas is compared. The effect needs both a GLSL and a
// WGSL program. WebGPU needs a real adapter: pass `--chrome-flags "--use-angle=d3d11
// --enable-unsafe-webgpu"`.
//
// --install-check runs one scenario instead of the catalog: install a package archive from the
// shell's file picker, switch to it, check it renders from IndexedDB, and check it is listed again
// after a reload.
//
// Needs a running dev server (`npm run dev`) and a Chrome/Edge install. It has no npm
// dependencies: Chrome is driven over the DevTools protocol with Node's built-in WebSocket.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

type PackageEntry = { id: string; title: string | null };
interface GlStats {
    draws: number;
    screenDraws: number;
    shaderErrors: string[];
    failed: Array<{ log: string; source: string }>;
    linkErrors: string[];
    glErrors: Record<string, number>;
    screenPixel: number[] | null;
}
interface ExceptionDetails {
    text: string;
    exception?: { description?: string };
}
interface EvaluationResult {
    result: { value?: unknown };
    exceptionDetails?: ExceptionDetails;
}
type DevtoolsMessage =
    | { id: number; result: unknown; error?: { message: string } }
    | {
          id?: undefined;
          method: 'Runtime.consoleAPICalled';
          params: { type: string; args: Array<{ value?: unknown; description?: string }> };
      }
    | { id?: undefined; method: 'Runtime.exceptionThrown'; params: { exceptionDetails: ExceptionDetails } }
    | { id?: undefined; method: 'Log.entryAdded'; params: { entry: { level: string; text: string } } };
interface ReportEntry {
    id: string;
    loaded: boolean;
    status: string;
    litFraction: number;
    distinctColors: number;
    meanRgb?: number[];
    gl: GlStats;
    messages: string[];
}

const args = new Map<string, string | undefined>();
for (let i = 2; i < process.argv.length; i += 2) {
    args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}

const baseUrl = args.get('url') ?? 'http://localhost:8080';
const catalog = args.get('catalog');
const backend = args.get('backend');
const query = [
    catalog === undefined ? null : `catalog=${encodeURIComponent(catalog)}`,
    backend === undefined ? null : `backend=${backend}`,
]
    .filter(Boolean)
    .join('&');
const pageUrl = query === '' ? baseUrl : `${baseUrl}/?${query}`;
const outDir = args.get('out') ?? join(tmpdir(), 'blink-smoke');
const only = args.get('only');
const verbose = args.get('verbose') === '1';
const probeExpression = args.get('eval');
const settleMs = Number(args.get('wait') ?? 2500);
const extraChromeFlags = (args.get('chrome-flags') ?? '').split(' ').filter(Boolean);
const probeAudio = '/docs/research/audio/probes/ssf_audio_probe_master_v1.wav';

const chromeCandidates = [
    args.get('chrome'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter((path): path is string => Boolean(path));
const chromePath = chromeCandidates.find(path => existsSync(path));
if (chromePath === undefined) {
    throw new Error('No Chrome/Edge executable found; pass --chrome <path>');
}

mkdirSync(outDir, { recursive: true });
const profileDir = mkdtempSync(join(tmpdir(), 'blink-smoke-profile-'));
const port = 9300 + Math.floor(Math.random() * 500);
const CALL_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let chrome: import('node:child_process').ChildProcess | null = null;
let socket: WebSocket | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let messages: string[] = [];

const handleMessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as DevtoolsMessage;
    if (message.id !== undefined) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (entry === undefined) return;
        if (message.error) {
            entry.reject(new Error(message.error.message));
        } else {
            entry.resolve(message.result);
        }
        return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
        const { type, args: callArgs } = message.params;
        if (verbose || type === 'error' || type === 'warning') {
            messages.push(`${type}: ${callArgs.map(arg => arg.value ?? arg.description ?? '').join(' ')}`);
        }
    } else if (message.method === 'Runtime.exceptionThrown') {
        const detail = message.params.exceptionDetails;
        messages.push(`exception: ${detail.exception?.description ?? detail.text}`);
    } else if (message.method === 'Log.entryAdded') {
        const { level, text } = message.params.entry;
        if (level === 'error' || level === 'warning') {
            messages.push(`${level}: ${text}`);
        }
    }
};

const send = <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`DevTools call ${method} timed out after ${CALL_TIMEOUT_MS} ms`));
        }, CALL_TIMEOUT_MS);
        pending.set(id, {
            resolve: value => {
                clearTimeout(timer);
                resolve(value as T);
            },
            reject: error => {
                clearTimeout(timer);
                reject(error);
            },
        });
        socket!.send(JSON.stringify({ id, method, params }));
    });

const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const result = await send<EvaluationResult>('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value as T;
};

const connect = async () => {
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Array<{
                type: string;
                webSocketDebuggerUrl: string;
            }>;
            const page = targets.find(target => target.type === 'page');
            if (page !== undefined) {
                return page.webSocketDebuggerUrl;
            }
        } catch {
            // Chrome is still starting.
        }
        await sleep(200);
    }
    throw new Error('Chrome DevTools endpoint did not come up');
};

/** Starts a fresh browser; a page that hangs the GPU process takes the whole browser with it. */
const launchBrowser = async () => {
    chrome?.kill();
    socket?.close();
    pending.clear();
    chrome = spawn(
        chromePath,
        [
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${profileDir}`,
            '--headless=new',
            '--no-first-run',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
            '--autoplay-policy=no-user-gesture-required',
            '--window-size=1280,720',
            ...extraChromeFlags,
            'about:blank',
        ],
        { stdio: 'ignore' }
    );
    await sleep(500);
    socket = new WebSocket(await connect());
    await new Promise<Event>((resolve, reject) => {
        socket!.addEventListener('open', resolve, { once: true });
        socket!.addEventListener('error', reject, { once: true });
    });
    socket!.addEventListener('message', handleMessage);
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: glHook });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
};

// Minimal 8-bit RGBA/RGB PNG decoder, enough to measure what the canvas shows.
const decodePng = (buffer: Buffer) => {
    let offset = 8;
    let width = 0;
    let height = 0;
    let channels = 4;
    const idat: Buffer[] = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            channels = data[9] === 2 ? 3 : 4;
        } else if (type === 'IDAT') {
            idat.push(data);
        }
        offset += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const pixels = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? pixels[y * stride + x - channels] : 0;
            const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
            const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
            let predictor = 0;
            if (filter === 1) predictor = left;
            else if (filter === 2) predictor = up;
            else if (filter === 3) predictor = (left + up) >> 1;
            else if (filter === 4) {
                const p = left + up - upLeft;
                const pa = Math.abs(p - left);
                const pb = Math.abs(p - up);
                const pc = Math.abs(p - upLeft);
                predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
            }
            pixels[y * stride + x] = (line[x] + predictor) & 0xff;
        }
    }
    return { width, height, channels, pixels };
};

const measure = (png: Buffer) => {
    const { width, height, channels, pixels } = decodePng(png);
    let lit = 0;
    const sum = [0, 0, 0];
    const distinct = new Set();
    const count = width * height;
    for (let i = 0; i < count; i++) {
        const r = pixels[i * channels];
        const g = pixels[i * channels + 1];
        const b = pixels[i * channels + 2];
        if (r + g + b > 24) lit++;
        sum[0] += r;
        sum[1] += g;
        sum[2] += b;
        distinct.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    }
    return {
        litFraction: Number((lit / count).toFixed(3)),
        meanRgb: sum.map(value => Math.round(value / count)),
        distinctColors: distinct.size,
    };
};

// Installed before the app runs: records what the GL context was asked to do, because a black
// canvas alone cannot tell a failed shader from an effect that legitimately draws black.
const glHook = `(() => {
    const stats = { draws: 0, screenDraws: 0, shaderErrors: [], failed: [], linkErrors: [], glErrors: {}, screenPixel: null, programs: 0, sources: [], programDraws: {} };
    window.__smoke = stats;
    stats.rafErrors = [];
    stats.rafCalls = 0;
    const nativeRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback =>
        nativeRaf(timestamp => {
            stats.rafCalls++;
            try {
                callback(timestamp);
            } catch (error) {
                stats.rafErrors.push(String(error && error.stack || error).slice(0, 600));
                throw error;
            }
        });
    const proto = WebGL2RenderingContext.prototype;
    const wrap = (name, after) => {
        const original = proto[name];
        proto[name] = function (...callArgs) {
            const result = original.apply(this, callArgs);
            after(this, callArgs, result);
            return result;
        };
    };
    wrap('shaderSource', (gl, [shader, source]) => {
        const text = String(source);
        gl.__lastSource = gl.__lastSource ?? new WeakMap();
        gl.__lastSource.set(shader, text);
        stats.sources.push(text.includes('bl_') ? 'BLINK-SHADER ' + text.length : text.slice(0, 60));
    });
    wrap('compileShader', (gl, [shader]) => {
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            stats.shaderErrors.push(String(gl.getShaderInfoLog(shader)).slice(0, 400));
            if (stats.failed.length < 2) stats.failed.push({ log: String(gl.getShaderInfoLog(shader)), source: gl.__lastSource?.get(shader) ?? '' });
        }
    });
    wrap('linkProgram', (gl, [program]) => {
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            stats.linkErrors.push(String(gl.getProgramInfoLog(program)).slice(0, 400));
        }
    });
    const afterDraw = gl => {
        stats.draws++;
        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        const key = String(program && (program.__id ??= ++stats.programs));
        stats.programDraws[key] = (stats.programDraws[key] ?? 0) + 1;
        if (gl.getParameter(gl.FRAMEBUFFER_BINDING) === null) {
            stats.screenDraws++;
            const pixels = new Uint8Array(4);
            gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            stats.screenPixel = [...pixels];
        }
    };
    wrap('drawArrays', afterDraw);
    wrap('drawElements', afterDraw);
    wrap('drawArraysInstanced', afterDraw);
    wrap('drawElementsInstanced', afterDraw);
    wrap('getError', (gl, _args, code) => {
        if (code !== 0) stats.glErrors[code] = (stats.glErrors[code] ?? 0) + 1;
    });
})()`;

const readPackages = () =>
    evaluate<PackageEntry[]>(
        `[...document.querySelectorAll('select[name="package"] option')].map(o => ({ id: o.value, title: o.textContent }))`
    );

const waitForPackages = async (attempts: number) => {
    let found: PackageEntry[] = [];
    for (let attempt = 0; attempt < attempts && found.length === 0; attempt++) {
        await sleep(250);
        found = await readPackages();
    }
    return found;
};

const runPackage = async (pkg: PackageEntry) => {
    messages = [];
    await send('Page.navigate', { url: pageUrl });
    await waitForPackages(60);
    const submitted = await evaluate<boolean>(`(() => {
        const select = document.querySelector('select[name="package"]');
        select.value = ${JSON.stringify(pkg.id)};
        const tile = document.querySelector('[data-source-tile="url"]');
        const input = tile.querySelector('input');
        input.value = ${JSON.stringify(baseUrl + probeAudio)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        tile.querySelector('button').click();
        return true;
    })()`);
    await sleep(settleMs);
    const status = await evaluate<{ startScreenOpen: boolean; status: string }>(`(() => {
        const screen = document.querySelector('.start-screen');
        const status = document.querySelector('[data-status]');
        return { startScreenOpen: screen !== null, status: status ? status.textContent : '' };
    })()`);
    if (probeExpression !== undefined) {
        console.log('eval:', JSON.stringify(await evaluate(probeExpression)));
    }
    const gl = await evaluate<GlStats>('window.__smoke');
    const shot = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(shot.data, 'base64');
    writeFileSync(join(outDir, `${pkg.id.replaceAll(/[^\w.-]+/g, '_')}.png`), png);
    return {
        id: pkg.id,
        loaded: submitted && !status.startScreenOpen && gl.shaderErrors.length === 0 && gl.linkErrors.length === 0,
        status: status.status,
        ...measure(png),
        gl,
        messages: [...new Set(messages)].slice(0, 12),
    };
};

// The installed package: a shader that includes a sibling file and fills the screen with red.
const INSTALL_ID = 'com.test.installed_red';
const installPageScript = `(async () => {
    const { writePackageArchive, MemoryPackageFiles } = await import('/src/packages/blinkfx/packageReader.ts');
    const encode = text => new TextEncoder().encode(text);
    const manifest = { format: 'blinkfx/1', id: ${JSON.stringify(INSTALL_ID)}, title: 'Installed Red', description: 'Smoke test', shaders: { glsl: 'shaders/main.frag.glsl' } };
    const bytes = writePackageArchive(new MemoryPackageFiles(new Map([
        ['manifest.json', encode(JSON.stringify(manifest))],
        ['shaders/main.frag.glsl', encode('#include "lib/red.glsl"\\nvoid main() { fragColor = red(); }')],
        ['shaders/lib/red.glsl', encode('vec4 red() { return vec4(1.0, 0.0, 0.0, 1.0); }')],
    ])));
    const input = document.querySelector('[data-shell-id="effect-panel"] input[type="file"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'installed_red.blinkfx'));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    return bytes.length;
})()`;

/** Polls a page expression until it is truthy; the software renderer makes every step slow. */
const waitUntil = async (expression: string, seconds = 30) => {
    for (let attempt = 0; attempt < seconds * 4; attempt++) {
        if (await evaluate(expression)) return true;
        await sleep(250);
    }
    return false;
};

/** Mean absolute difference per channel, and the share of pixels that differ by more than `threshold`. */
const comparePictures = (a: Buffer, b: Buffer, threshold: number) => {
    const first = decodePng(a);
    const second = decodePng(b);
    if (first.width !== second.width || first.height !== second.height) {
        throw new Error(
            `pictures differ in size: ${first.width}x${first.height} against ${second.width}x${second.height}`
        );
    }
    const count = first.width * first.height;
    let sum = 0;
    let over = 0;
    for (let i = 0; i < count; i++) {
        let largest = 0;
        for (let channel = 0; channel < 3; channel++) {
            const difference = Math.abs(
                first.pixels[i * first.channels + channel] - second.pixels[i * second.channels + channel]
            );
            sum += difference;
            largest = Math.max(largest, difference);
        }
        if (largest > threshold) over++;
    }
    return { mad: sum / (count * 3), overFraction: over / count };
};

/** One effect on one backend, as a screenshot of the canvas alone. */
const pictureOn = async (backendName: string, suffix: string) => {
    await launchBrowser();
    const url = `${baseUrl}/?${[catalog === undefined ? null : `catalog=${encodeURIComponent(catalog)}`, `backend=${backendName}`].filter(Boolean).join('&')}`;
    messages = [];
    await send('Page.navigate', { url });
    const packages = await waitForPackages(120);
    const pkg = packages.find(candidate => candidate.id.endsWith(suffix) || candidate.id.includes(`.${suffix}`));
    if (pkg === undefined) throw new Error(`no package matching "${suffix}" is listed`);
    await evaluate(`(() => {
        document.querySelector('select[name="package"]').value = ${JSON.stringify(pkg.id)};
        const tile = document.querySelector('[data-source-tile="url"]');
        const input = tile.querySelector('input');
        input.value = ${JSON.stringify(baseUrl + probeAudio)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        tile.querySelector('button').click();
    })()`);
    await waitUntil(`document.querySelector('.start-screen') === null`, 60);
    await sleep(settleMs);
    // Everything but the canvas is hidden: the shell and the statistics overlay would differ by design.
    await evaluate(`(() => {
        let node = document.querySelector('#view');
        while (node !== document.body) {
            for (const sibling of node.parentElement.children) {
                if (sibling !== node) sibling.style.display = 'none';
            }
            node = node.parentElement;
        }
    })()`);
    await sleep(500);
    const shot = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(shot.data, 'base64');
    writeFileSync(join(outDir, `parity_${backendName}.png`), png);
    const errors = [...new Set(messages)].filter(
        message => message.startsWith('exception') || message.startsWith('error')
    );
    return { png, errors };
};

const runParityCheck = async (suffix: string) => {
    const results: boolean[] = [];
    const check = (name: string, ok: boolean, detail = '') => {
        results.push(ok);
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail === '' ? '' : `  ${detail}`}`);
    };
    const gl = await pictureOn('webgl2', suffix);
    const gpu = await pictureOn('webgpu', suffix);
    check('webgl2 ran without errors', gl.errors.length === 0, gl.errors.join(' | '));
    check('webgpu ran without errors', gpu.errors.length === 0, gpu.errors.join(' | '));
    const own = measure(gpu.png);
    check(
        'the webgpu picture is not blank',
        own.litFraction > 0.05 && own.distinctColors > 20,
        `lit=${own.litFraction} colors=${own.distinctColors}`
    );
    const difference = comparePictures(gl.png, gpu.png, 8);
    check(
        'the two backends draw the same picture',
        difference.mad < 2 && difference.overFraction < 0.02,
        `mean difference ${difference.mad.toFixed(2)}/255, ${(difference.overFraction * 100).toFixed(2)} % of pixels differ by more than 8`
    );
    return results.every(Boolean);
};

const runInstallCheck = async () => {
    const results: boolean[] = [];
    const check = (name: string, ok: boolean, detail = '') => {
        results.push(ok);
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail === '' ? '' : `  ${detail}`}`);
    };

    messages = [];
    await launchBrowser();
    await send('Page.navigate', { url: pageUrl });
    const packages = await waitForPackages(120);
    check('catalog is listed', packages.length > 0, `${packages.length} packages`);
    await runPackage(packages[0]);

    const archiveSize = await evaluate(installPageScript);
    await waitUntil(`(document.querySelector('.effect-panel__status')?.textContent ?? '').includes('installiert')`);
    const installStatus = await evaluate(`document.querySelector('.effect-panel__status')?.textContent ?? ''`);
    check(
        'install reports success',
        installStatus === '"Installed Red" installiert.',
        `status="${installStatus}" (${archiveSize} bytes)`
    );

    const clicked = await evaluate<boolean>(`(() => {
        const entry = [...document.querySelectorAll('.effect-panel__entry')].find(button => button.textContent === 'Installed Red');
        if (entry === undefined) return false;
        entry.click();
        return true;
    })()`);
    check('installed package is listed in the effect panel', clicked);
    await waitUntil(`document.querySelector('.effect-panel__entry--active')?.textContent === 'Installed Red'`);
    await sleep(settleMs);
    const pixel = await evaluate('window.__smoke.screenPixel');
    check(
        'installed package renders from the archive',
        Array.isArray(pixel) && pixel[0] > 200 && pixel[1] < 50 && pixel[2] < 50,
        `center pixel ${JSON.stringify(pixel)}`
    );
    const panelStatus = await evaluate<string>(`document.querySelector('.effect-panel__status')?.textContent ?? ''`);
    check('switching reports no error', !panelStatus.includes('konnte'), `status="${panelStatus}"`);

    messages = [];
    await send('Page.navigate', { url: pageUrl });
    const afterReload = await waitForPackages(120);
    check(
        'installed package is listed again after a reload',
        afterReload.some(pkg => pkg.id === INSTALL_ID),
        `${afterReload.length} packages`
    );

    const removed = await evaluate(`(async () => {
        const { IndexedDbPackageStore } = await import('/src/services/PackageStore.ts');
        await new IndexedDbPackageStore().remove(${JSON.stringify(INSTALL_ID)});
        return (await new IndexedDbPackageStore().list()).length;
    })()`);
    check('cleanup leaves no installed package behind', removed === 0, `${removed} left`);

    const errors = [...new Set(messages)].filter(
        message => message.startsWith('exception') || message.startsWith('error')
    );
    check('no console errors after the reload', errors.length === 0, errors.join(' | '));
    return results.every(Boolean);
};

const AUDIO_DEBUG_ID = 'com.codexo.audio_debug';
const BASE64_CHUNK_BYTES = 768 * 1024;

const runProbeCapture = async (outFile: string, seconds: number) => {
    await launchBrowser();
    // The recorder hands its archive to a download link; keep the blob instead of downloading it.
    await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
            const original = URL.createObjectURL.bind(URL);
            URL.createObjectURL = blob => {
                if (blob instanceof Blob && blob.type === 'application/zip') window.__probeZip = blob;
                return original(blob);
            };
        })()`,
    });
    messages = [];
    await send('Page.navigate', { url: `${baseUrl}/?probe=smoke-capture&dur=${seconds}` });
    const packages = await waitForPackages(120);
    if (!packages.some(pkg => pkg.id === AUDIO_DEBUG_ID)) {
        console.log(`FAIL ${AUDIO_DEBUG_ID} is not listed`);
        return false;
    }
    await evaluate(`(() => {
        document.querySelector('select[name="package"]').value = ${JSON.stringify(AUDIO_DEBUG_ID)};
        const tile = document.querySelector('[data-source-tile="url"]');
        const input = tile.querySelector('input');
        input.value = ${JSON.stringify(baseUrl + probeAudio)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        tile.querySelector('button').click();
    })()`);

    console.log(`capturing ${seconds + 4} s of the probe master...`);
    if (!(await waitUntil('window.__probeZip !== undefined', seconds + 90))) {
        console.log('FAIL the capture produced no archive');
        for (const message of new Set(messages)) console.log(`  ${message}`);
        return false;
    }
    const size = await evaluate<number>('window.__probeZip.size');
    const chunks = [];
    for (let offset = 0; offset < size; offset += BASE64_CHUNK_BYTES) {
        const encoded = await evaluate<string>(`(async () => {
            const bytes = new Uint8Array(await window.__probeZip.slice(${offset}, ${offset + BASE64_CHUNK_BYTES}).arrayBuffer());
            let text = '';
            for (const byte of bytes) text += String.fromCharCode(byte);
            return btoa(text);
        })()`);
        chunks.push(Buffer.from(encoded, 'base64'));
    }
    writeFileSync(outFile, Buffer.concat(chunks));
    console.log(`OK   wrote ${outFile} (${size} bytes)`);
    return true;
};

const emptyGl: GlStats = {
    draws: 0,
    screenDraws: 0,
    shaderErrors: [],
    failed: [],
    linkErrors: [],
    glErrors: {},
    screenPixel: null,
};

if (args.get('parity-check') !== undefined) {
    const passed = await runParityCheck(args.get('parity-check')!);
    socket!.close();
    chrome!.kill();
    await sleep(500);
    try {
        rmSync(profileDir, { recursive: true, force: true });
    } catch {
        // Chrome may still hold the profile; it lives in the temp directory anyway.
    }
    process.exit(passed ? 0 : 1);
}

if (args.get('probe-capture') !== undefined) {
    const passed = await runProbeCapture(args.get('probe-capture')!, Number(args.get('probe-seconds') ?? 99));
    socket!.close();
    chrome!.kill();
    await sleep(500);
    try {
        rmSync(profileDir, { recursive: true, force: true });
    } catch {
        // Chrome may still hold the profile; it lives in the temp directory anyway.
    }
    process.exit(passed ? 0 : 1);
}

if (args.get('install-check') === '1') {
    const passed = await runInstallCheck();
    socket!.close();
    chrome!.kill();
    await sleep(500);
    try {
        rmSync(profileDir, { recursive: true, force: true });
    } catch {
        // Chrome may still hold the profile; it lives in the temp directory anyway.
    }
    process.exit(passed ? 0 : 1);
}

await launchBrowser();
await send('Page.navigate', { url: pageUrl });
const packages = await waitForPackages(120);
if (packages.length === 0) {
    console.log('no packages listed on the start screen; page messages:');
    for (const message of new Set(messages)) console.log(`  ${message}`);
}

const report: ReportEntry[] = [];
for (const pkg of packages) {
    if (only !== undefined && !only.split(',').some(part => pkg.id.endsWith(part) || pkg.id.includes(`.${part}`)))
        continue;
    let entry: ReportEntry;
    try {
        entry = await runPackage(pkg);
    } catch (error) {
        // A hung or crashed page: record it and continue with a fresh browser.
        entry = {
            id: pkg.id,
            loaded: false,
            status: `harness: ${(error as Error).message}`,
            gl: emptyGl,
            messages: [],
            litFraction: 0,
            distinctColors: 0,
        };
        await launchBrowser();
    }
    report.push(entry);
    const gl = entry.gl;
    console.log(
        `${entry.loaded ? 'OK  ' : 'FAIL'} ${entry.id}  lit=${entry.litFraction} colors=${entry.distinctColors}` +
            `  draws=${gl.draws} screenDraws=${gl.screenDraws} px=${JSON.stringify(gl.screenPixel)}` +
            (entry.status ? `  status="${entry.status}"` : '') +
            [...gl.shaderErrors, ...gl.linkErrors].map(error => `\n       GL: ${error}`).join('') +
            (entry.messages.length > 0 ? `\n       ${entry.messages.join('\n       ')}` : '')
    );
    // Written as it goes, so a run that is cut short still leaves what it measured.
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
}

console.log(`\nscreenshots + report.json in ${outDir}`);

socket!.close();
chrome!.kill();
await sleep(500);
try {
    rmSync(profileDir, { recursive: true, force: true });
} catch {
    // Chrome may still hold the profile; it lives in the temp directory anyway.
}
process.exit(report.some(entry => !entry.loaded) ? 1 : 0);
