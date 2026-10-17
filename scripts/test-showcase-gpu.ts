import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

import { workspacePath } from './lib/workspacePaths.ts';

const root = resolve(import.meta.dirname, '..');
const packages = ['prism_orbit', 'spectral_city', 'ink_current'];
const output = workspacePath('showcase-gpu');
const width = 320;
const height = 180;
const time = 2;
const frame = 120;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const urlIndex = process.argv.indexOf('--url');
let url = urlIndex < 0 ? undefined : process.argv[urlIndex + 1];
if (urlIndex >= 0 && url === undefined) throw new Error('Missing --url value');
let server: ChildProcess | undefined;

async function freePort(): Promise<number> {
    const listener = createServer();
    await new Promise<void>((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(0, '127.0.0.1', resolve);
    });
    const address = listener.address();
    assert.ok(address !== null && typeof address === 'object');
    await new Promise<void>((resolve, reject) => listener.close(error => (error ? reject(error) : resolve())));
    return address.port;
}

if (url === undefined) {
    const port = await freePort();
    url = `http://127.0.0.1:${port}/`;
    server = spawn(
        process.execPath,
        [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
        {
            cwd: root,
            windowsHide: true,
            stdio: 'ignore',
            env: { ...process.env, BLINK_BASE: '/' },
        }
    );
}

mkdirSync(output, { recursive: true });
const results = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
function persist(status: 'running' | 'passed' | 'failed', rows: readonly object[], error?: string): void {
    writeFileSync(
        join(output, 'report.json'),
        JSON.stringify(
            { status, width, height, time, frame, browser: browser?.version(), results: rows, error },
            null,
            2
        ) + '\n'
    );
}
persist('running', []);
try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
        if (server?.exitCode !== null && server?.exitCode !== undefined)
            throw new Error('Local showcase server exited');
        try {
            ready = (
                await fetch(new URL('effects/prism_orbit.blinkfx/manifest.json', url), {
                    signal: AbortSignal.timeout(1000),
                })
            ).ok;
        } catch {
            /* The local Vite process can still be starting. */
        }
        if (ready) break;
        await sleep(100);
    }
    if (!ready) throw new Error(`Showcase server unavailable: ${url}`);
    browser = await chromium.launch({
        headless: true,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(30_000);
    await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto(url);
    for (const name of packages) {
        const result = await page.evaluate(
            async ({ name, width, height, time, frame }) => {
                const [
                    { loadBlinkFx },
                    { validateBlinkFxManifest },
                    { buildBlinkPrelude, buildDefaultUniformValues },
                    { buildPassPrelude },
                    { stripGlslPreamble },
                ] = await Promise.all([
                    import('/src/packages/blinkfx/loader.ts' as string) as Promise<
                        typeof import('../src/packages/blinkfx/loader.ts')
                    >,
                    import('/src/packages/blinkfx/validate.ts' as string) as Promise<
                        typeof import('../src/packages/blinkfx/validate.ts')
                    >,
                    import('/src/runtime/render/BlinkPrelude.ts' as string) as Promise<
                        typeof import('../src/runtime/render/BlinkPrelude.ts')
                    >,
                    import('/src/runtime/render/pass/buildPassPrelude.ts' as string) as Promise<
                        typeof import('../src/runtime/render/pass/buildPassPrelude.ts')
                    >,
                    import('/src/runtime/render/stripGlslPreamble.ts' as string) as Promise<
                        typeof import('../src/runtime/render/stripGlslPreamble.ts')
                    >,
                ]);
                const path = `/effects/${name}.blinkfx`;
                const response = await fetch(`${path}/manifest.json`);
                if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
                const manifest: unknown = await response.json();
                const validation = validateBlinkFxManifest(manifest);
                if (!validation.valid) throw new Error(validation.errors.join('; '));
                const effect = loadBlinkFx(
                    manifest as import('../src/packages/blinkfx/manifest.ts').BlinkFxManifest,
                    path
                );
                const entry = effect.shaders.glsl.main;
                if (
                    entry === undefined ||
                    entry.path === null ||
                    effect.passes.length !== 1 ||
                    effect.passes[0].inputs.length !== 0
                ) {
                    throw new Error('Showcase check expects a single native visual pass without samplers');
                }
                const shaderResponse = await fetch(entry.path);
                if (!shaderResponse.ok) throw new Error(`Shader HTTP ${shaderResponse.status}`);
                const source =
                    buildBlinkPrelude(effect.controls).source +
                    buildPassPrelude([]) +
                    stripGlslPreamble(await shaderResponse.text());
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const gl = canvas.getContext('webgl2', { antialias: false });
                if (gl === null || !gl.getExtension('EXT_color_buffer_float'))
                    throw new Error('WebGL2 RGBA32F rendering required');
                const compile = (type: number, code: string) => {
                    const shader = gl.createShader(type);
                    if (shader === null) throw new Error('Shader allocation failed');
                    gl.shaderSource(shader, code);
                    gl.compileShader(shader);
                    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
                        throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed');
                    return shader;
                };
                const vertex = compile(
                    gl.VERTEX_SHADER,
                    '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}'
                );
                const fragment = compile(gl.FRAGMENT_SHADER, source);
                const program = gl.createProgram();
                const target = gl.createTexture();
                const framebuffer = gl.createFramebuffer();
                if (program === null || target === null || framebuffer === null)
                    throw new Error('GPU resource allocation failed');
                try {
                    gl.attachShader(program, vertex);
                    gl.attachShader(program, fragment);
                    gl.linkProgram(program);
                    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
                        throw new Error(gl.getProgramInfoLog(program) ?? 'Program linking failed');
                    gl.useProgram(program);
                    gl.bindTexture(gl.TEXTURE_2D, target);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
                    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                        throw new Error('Incomplete float framebuffer');
                    gl.viewport(0, 0, width, height);
                    const activeUniforms = new Map<string, number>();
                    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
                    for (let index = 0; index < count; index++) {
                        const uniform = gl.getActiveUniform(program, index);
                        if (uniform !== null) activeUniforms.set(uniform.name, uniform.type);
                    }
                    for (const [name, value] of Object.entries(buildDefaultUniformValues(effect.controls))) {
                        const location = gl.getUniformLocation(program, name);
                        const type = activeUniforms.get(name);
                        if (type === undefined) continue;
                        if (typeof value === 'number') {
                            if (type === gl.INT || type === gl.BOOL) gl.uniform1i(location, value);
                            else gl.uniform1f(location, value);
                        } else if (value.length === 2) gl.uniform2fv(location, value);
                        else if (value.length === 4) gl.uniform4fv(location, value);
                        else throw new Error(`Unsupported control shape: ${name}`);
                    }
                    gl.uniform1f(gl.getUniformLocation(program, 'bl_time'), time);
                    gl.uniform1i(gl.getUniformLocation(program, 'bl_frame'), frame);
                    gl.uniform2f(gl.getUniformLocation(program, 'bl_resolution'), width, height);
                    gl.uniform1f(gl.getUniformLocation(program, 'bl_deltaTime'), 1 / 60);
                    gl.uniform1i(gl.getUniformLocation(program, 'bl_pass'), 0);
                    const render = (bass: number, mid: number, high: number) => {
                        gl.uniform1f(gl.getUniformLocation(program, 'au_bass'), bass);
                        gl.uniform1f(gl.getUniformLocation(program, 'au_mid'), mid);
                        gl.uniform1f(gl.getUniformLocation(program, 'au_high'), high);
                        gl.drawArrays(gl.TRIANGLES, 0, 3);
                        const pixels = new Float32Array(width * height * 4);
                        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
                        if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL error during float render/readback');
                        if (!pixels.every(Number.isFinite)) throw new Error('Nonfinite float output');
                        return pixels;
                    };
                    const difference = (first: Float32Array, second: Float32Array) => {
                        let sum = 0;
                        let changedPixels = 0;
                        for (let offset = 0; offset < first.length; offset += 4) {
                            let changed = false;
                            for (let channel = 0; channel < 3; channel++) {
                                const delta = Math.abs(first[offset + channel] - second[offset + channel]);
                                sum += delta;
                                changed ||= delta > 1e-4;
                            }
                            if (changed) changedPixels++;
                        }
                        return {
                            meanAbs: sum / (width * height * 3),
                            changedFraction: changedPixels / (width * height),
                        };
                    };
                    const silent = render(0, 0, 0);
                    let litPixels = 0;
                    const colors = new Set<number>();
                    for (let offset = 0; offset < silent.length; offset += 4) {
                        if (silent[offset] + silent[offset + 1] + silent[offset + 2] > 0.03) litPixels++;
                        const channels = [0, 1, 2].map(channel =>
                            Math.min(31, Math.max(0, Math.floor(silent[offset + channel] * 32)))
                        );
                        colors.add((channels[0] << 10) | (channels[1] << 5) | channels[2]);
                    }
                    const bass = difference(silent, render(0.8, 0, 0));
                    const mid = difference(silent, render(0, 0.8, 0));
                    const high = difference(silent, render(0, 0, 0.8));
                    const mixed = difference(silent, render(0.8, 0.5, 0.7));
                    const repeat = difference(silent, render(0, 0, 0));
                    gl.uniform1f(gl.getUniformLocation(program, 'sensitivity'), 0);
                    const muted = render(0, 0, 0);
                    const disabledResponse = difference(muted, render(0.8, 0.5, 0.7));
                    const debug = gl.getExtension('WEBGL_debug_renderer_info');
                    return {
                        id: effect.metadata.id,
                        floatFormat: 'rgba32f',
                        finite: true,
                        litFraction: litPixels / (width * height),
                        distinctColors: colors.size,
                        bass,
                        mid,
                        high,
                        mixed,
                        repeat,
                        disabledResponse,
                        renderer: String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
                        shaderLog: gl.getShaderInfoLog(fragment),
                        programLog: gl.getProgramInfoLog(program),
                    };
                } finally {
                    gl.deleteFramebuffer(framebuffer);
                    gl.deleteTexture(target);
                    gl.deleteProgram(program);
                    gl.deleteShader(vertex);
                    gl.deleteShader(fragment);
                    gl.getExtension('WEBGL_lose_context')?.loseContext();
                }
            },
            { name, width, height, time, frame }
        );
        results.push(result);
        persist('running', results);
        assert.ok(result.litFraction > 0.05, `${name}: blank silence image`);
        assert.ok(result.distinctColors > 8, `${name}: insufficient image variation`);
        for (const band of ['bass', 'mid', 'high', 'mixed'] as const) {
            assert.ok(
                result[band].meanAbs > 1e-4 && result[band].changedFraction > 0.01,
                `${name}: ${band} has no measurable response`
            );
        }
        assert.equal(result.repeat.meanAbs, 0, `${name}: fixed-time silence is nondeterministic`);
        assert.equal(result.disabledResponse.meanAbs, 0, `${name}: sensitivity zero still responds to audio`);
        console.log(
            `PASS ${name}: finite RGBA32F; silence lit=${result.litFraction.toFixed(3)}; band differences=${[result.bass, result.mid, result.high].map(band => band.meanAbs.toFixed(4)).join(',')}`
        );
    }
    persist('passed', results);
} catch (error) {
    persist('failed', results, String(error));
    throw error;
} finally {
    await browser?.close();
    server?.kill();
}
console.log(`Showcase GPU evidence: ${join(output, 'report.json')}`);
