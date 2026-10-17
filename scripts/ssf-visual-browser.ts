import { workspacePath } from './lib/workspacePaths.ts';
/* global document */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = <T extends string | undefined>(name: string, fallback: T): string | T =>
    process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const playwright = (await import(
    arg('--playwright', '') ? pathToFileURL(resolve(arg('--playwright', ''))).href : 'playwright'
)) as typeof import('playwright');
const output = resolve(arg('--output', workspacePath('artifacts/ssf-visual-parity')));
await mkdir(output, { recursive: true });
const browser = await playwright.chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${arg('--url', 'http://127.0.0.1:8081/')}?lab=audio`);
    await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent!.startsWith('Frame 0 '));
    await page.getByText('Passes / GPU-Diff', { exact: true }).click();
    await page.locator('[data-pass-view]').selectOption('a');
    await page.waitForTimeout(100);
    assert.deepEqual(errors, []);
    const dimensions = () =>
        page.locator('[data-a]').evaluate((canvas: HTMLCanvasElement) => ({
            width: canvas.width,
            height: canvas.height,
            fit: getComputedStyle(canvas).objectFit,
        }));
    assert.deepEqual(await dimensions(), { width: 1920, height: 1080, fit: 'contain' });
    await page.setViewportSize({ width: 750, height: 900 });
    assert.equal((await dimensions()).width, 1920);
    await page.locator('[data-step]').click();
    await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent!.startsWith('Frame 1 '));
    await page.locator('[data-output-fit]').selectOption('cover');
    await page.locator('[data-output-scale]').selectOption('1.5');
    await page.locator('[data-output-apply]').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-a]')!).objectFit === 'cover');
    assert.deepEqual(await dimensions(), { width: 1920, height: 1080, fit: 'cover' });
    assert.match((await page.locator('[data-status]').textContent())!, /^Frame 1 /);

    await page.locator('[data-visual-debug]').selectOption('quadrants');
    await page.waitForFunction(() => document.querySelector('[data-status]')?.textContent!.startsWith('Frame 0 '));
    const png = await page.locator('[data-a]').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL('image/png'));
    await page.locator('[data-reference]').setInputFiles({
        name: 'self-test.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png.split(',')[1], 'base64'),
    });
    await page.waitForFunction(() =>
        document.querySelector('[data-pixel-metrics]')?.textContent!.includes('Reference self-test.png')
    );
    await page.getByText('Native image comparison (presentation bytes)', { exact: true }).click();
    await page.locator('[data-pixel-compare]').click();
    await page.waitForFunction(() =>
        document.querySelector('[data-pixel-metrics]')?.textContent!.includes('comparedPixels')
    );
    const imageComparison = JSON.parse((await page.locator('[data-pixel-metrics]').textContent())!) as {
        metrics: { maxAbs: number; comparedPixels: number };
    };
    assert.equal(imageComparison.metrics.maxAbs, 0);
    assert.equal(imageComparison.metrics.comparedPixels, 1920 * 1080);
    assert.match((await page.locator('[data-status]').textContent())!, /^Frame 0 /);
    const probes = await page.evaluate(async () => {
        const [
            { diagnosticScene, diagnosticRamp },
            { convertSsfScene },
            { loadBlinkFx },
            { LabRenderSurface },
            { DEFAULT_OUTPUT },
            { sampleSsf1D },
        ] = await Promise.all([
            import('/src/runtime/lab/visualDiagnostics.ts' as string) as Promise<
                typeof import('../src/runtime/lab/visualDiagnostics.ts')
            >,
            import('/src/packages/ssf/convert/convertSsfScene.ts' as string) as Promise<
                typeof import('../src/packages/ssf/convert/convertSsfScene.ts')
            >,
            import('/src/packages/blinkfx/loader.ts' as string) as Promise<
                typeof import('../src/packages/blinkfx/loader.ts')
            >,
            import('/src/runtime/lab/LabRenderSurface.ts' as string) as Promise<
                typeof import('../src/runtime/lab/LabRenderSurface.ts')
            >,
            import('/src/runtime/render/outputSettings.ts' as string) as Promise<
                typeof import('../src/runtime/render/outputSettings.ts')
            >,
            import('/src/packages/ssf/original/sampling.ts' as string) as Promise<
                typeof import('../src/packages/ssf/original/sampling.ts')
            >,
        ]);
        const results = [];
        for (const mode of ['quadrants', 'coordinates', 'color', 'spectrum', 'trail'] as const) {
            const diagnostic = diagnosticScene(mode === 'color' ? 'quadrants' : mode);
            const scene =
                mode === 'color'
                    ? { ...diagnostic, mainGlsl: 'vec4 renderMain(){return vec4(0.25,0.5,0.75,1.0);}' }
                    : diagnostic;
            const converted = convertSsfScene(scene);
            const effect = loadBlinkFx(converted.manifest, 'visual-probe');
            const canvas = document.createElement('canvas');
            canvas.style.width = '600px';
            canvas.style.height = '600px';
            document.body.append(canvas);
            const surface = new LabRenderSurface(
                canvas,
                effect,
                converted,
                DEFAULT_OUTPUT,
                mode === 'spectrum' || mode === 'trail'
            );
            await surface.init();
            await surface.render(
                {
                    snapshot: {
                        spectrum: new Float32Array(4096),
                        levelTrail: new Float32Array(1600),
                        profile: 'ssf-1.25.2-original' as const,
                        instant: { sourceEpoch: 0, sampleIndex: 0, audioTimeSec: 0, analysisSequence: 0 },
                        nativeTempo: { bpm: 0, confidence: 0 },
                        signals: new Map(),
                        diagnostics: {},
                    },
                    uniforms: {},
                    controls: {},
                    analysisMs: 0,
                    scriptMs: 0,
                },
                { frame: 0, time: 0, delta: 1 / 144 }
            );
            const [pass] = await surface.capturePasses();
            const sample = (x: number, y: number) =>
                Array.from(pass.data.slice((y * pass.width + x) * 4, (y * pass.width + x) * 4 + 4));
            const sampleRamp = (coordinate: number) => {
                const width = mode === 'spectrum' ? 1024 : 400;
                const texelCoordinate = Math.fround(Math.fround(coordinate) * width);
                return sampleSsf1D(diagnosticRamp(width), texelCoordinate / width);
            };
            const gl = canvas.getContext('webgl2')!;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            const pixel = new Uint8Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            results.push({
                mode,
                width: pass.width,
                height: pass.height,
                format: pass.format,
                corners: [
                    sample(0, 0),
                    sample(pass.width - 1, 0),
                    sample(0, pass.height - 1),
                    sample(pass.width - 1, pass.height - 1),
                ],
                channelSamples:
                    mode === 'spectrum' || mode === 'trail'
                        ? [0, 1, 2, 3].map(row => ({
                              actual: sample(
                                  Math.floor(pass.width / 2),
                                  Math.floor((pass.height * (row + 0.5)) / 4)
                              )[0],
                              expected: sampleRamp((Math.floor(pass.width / 2) + 0.5) / pass.width)[3 - row],
                          }))
                        : [],
                expectedRampCorners:
                    mode === 'spectrum' || mode === 'trail'
                        ? [
                              sampleRamp(0.5 / pass.width)[3],
                              sampleRamp((pass.width - 0.5) / pass.width)[3],
                              sampleRamp(0.5 / pass.width)[0],
                              sampleRamp((pass.width - 0.5) / pass.width)[0],
                          ]
                        : null,
                presentedBottomLeft: Array.from(pixel),
                uniforms: surface.inspectUniforms(),
                gpu: gl.getParameter(gl.RENDERER),
            });
            await surface.destroy();
            canvas.remove();
        }
        return results;
    });
    assert.deepEqual(probes[0].corners, [
        [0, 0, 1, 1],
        [1, 1, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 0, 1],
    ]);
    for (const probe of probes) assert.deepEqual([probe.width, probe.height, probe.format], [1920, 1080, 'rgba32f']);
    assert.ok(Math.abs(probes[1].corners[0][0] - 0.5 / 1920) < 1e-7);
    assert.ok(Math.abs(probes[1].corners[0][1] - 1079.5 / 1080) < 1e-7);
    assert.deepEqual(probes[2].corners[0], [0.25, 0.5, 0.75, 1]);
    assert.deepEqual(probes[2].presentedBottomLeft, [64, 128, 191, 255]);
    for (const probe of probes.filter(probe => probe.expectedRampCorners !== null))
        for (let corner = 0; corner < 4; corner++)
            assert.ok(
                Math.abs(probe.corners[corner][0] - probe.expectedRampCorners![corner]) < 1e-6,
                JSON.stringify(probe)
            );
    for (const probe of probes)
        for (const channel of probe.channelSamples)
            assert.ok(Math.abs(channel.actual - channel.expected) < 1e-6, JSON.stringify(channel));
    assert.deepEqual(errors, []);
    await page.locator('[data-output-fit]').selectOption('contain');
    await page.locator('[data-output-scale]').selectOption('1');
    await page.locator('[data-output-apply]').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-a]')!).objectFit === 'contain');
    await page.screenshot({ path: resolve(output, 'visual-preview.png'), fullPage: true });
    const report = {
        browser: await browser.version(),
        result: 'PASS',
        referenceVersion: '1.25.2.185',
        comparisonVersion: '1.25.4.189 (user reported)',
        checks: [
            '1920x1080 at DPR 2',
            'preview resize leaves target unchanged',
            'fitting/UI scale preserves frame and output',
            'GPU quadrant corners',
            'GPU UV pixel centers',
            'RGBA32F color channels',
            'Spectrum and LevelTrail RGBA ramp direction',
            'PNG comparison without advancing feedback',
        ],
        probes,
        imageComparison,
        errors,
        nativePixelParity: 'INCONCLUSIVE: no native image capture supplied',
    };
    await writeFile(resolve(output, 'visual-browser-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ result: report.result, checks: report.checks, color: probes[2].presentedBottomLeft }));
} finally {
    await browser.close();
}
