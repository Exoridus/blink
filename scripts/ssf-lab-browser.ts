/* global document */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const option = <T extends string | null>(name: string, fallback: T): string | T => {
    const index = process.argv.indexOf(name);
    return index < 0 ? fallback : process.argv[index + 1];
};
const modulePath = option('--playwright', null);
const playwright =
    modulePath === null
        ? await import('playwright')
        : ((await import(pathToFileURL(resolve(modulePath)).href)) as typeof import('playwright'));
const output = resolve(option('--output', '.'));
await mkdir(output, { recursive: true });
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
});
const checks = [];
const status = () => page.locator('[data-status]').textContent();
const waitFrame = async (frame: number) => {
    await page.waitForFunction(
        value => document.querySelector('[data-status]')?.textContent?.startsWith(`Frame ${value} `),
        frame
    );
};
const capture = async () => {
    await page.locator('[data-passes]').evaluate(element => {
        element.textContent = '';
    });
    await page.locator('[data-capture]').click();
    await page.waitForFunction(() => document.querySelector('[data-passes]')!.textContent!.includes('maxAbs'));
    return (
        JSON.parse((await page.locator('[data-passes]').textContent())!) as {
            passes: Array<{ format: string; diff: { maxAbs: number }; hashA: string }>;
        }
    ).passes;
};
try {
    await page.goto(`${option('--url', 'http://127.0.0.1:8080/')}?lab=audio`);
    await waitFrame(0);
    assert.equal(await page.locator('[data-signals] tr').count(), 51);
    assert.equal(await page.locator('iframe[sandbox="allow-scripts"]').count(), 2);
    assert.doesNotMatch((await status())!, /SCRIPT_ABORTED/);
    checks.push('51 sources; isolated Original/Original marker previews render');
    await page.getByText('Passes / GPU-Diff', { exact: true }).click();
    const passDiff = await capture();
    assert.equal(passDiff.length, 1);
    assert.equal(passDiff[0].format, 'rgba32f');
    assert.equal(passDiff[0].diff.maxAbs, 0);
    checks.push('marker RGBA32F pass readback exact A/B equality');
    const gain = page.locator('.lab-control').filter({ hasText: 'gain' }).locator('input');
    await gain.fill('0.8');
    await gain.press('Tab');
    await waitFrame(1);
    assert.equal((await capture())[0].diff.maxAbs, 0);
    assert.match((await page.locator('[data-control="gain"]').textContent())!, /A 0.8 · B 0.8/);
    checks.push('shared scene control propagated in identical order');
    await page.locator('[data-control-lane]').selectOption('b');
    await gain.fill('0.1');
    await gain.press('Tab');
    await waitFrame(2);
    assert.match((await status())!, /CONTROL_MISMATCH/);
    const override = await capture();
    assert.ok(override[0].diff.maxAbs > 0);
    const pixels = override[0].hashA;
    await page.locator('[data-seek]').fill('2');
    await page.locator('[data-scrub]').click();
    await page.waitForFunction(() => document.querySelector('[data-status]')!.textContent!.includes('Epoch 1'));
    assert.equal((await capture())[0].hashA, pixels);
    checks.push('override labelled; seek reconstructs original marker pixels');
    await page.locator('[data-profile]').selectOption('enhanced');
    await waitFrame(0);
    assert.match((await status())!, /ORIGINAL_FALLBACK/);
    checks.push('Enhanced replay fallback explicitly labelled');
    await page.locator('[data-play]').click();
    await page.waitForTimeout(1800);
    await page.locator('[data-play]').click();
    await page.waitForFunction(() => document.querySelector('[data-play]')!.textContent === 'Play');
    assert.equal(await page.locator('[data-play]').textContent(), 'Play');
    assert.match((await page.locator('[data-beats]').textContent())!, /MUSICAL_ACCURACY: UNKNOWN/);
    checks.push('ExoJS worklet playback/pause runs without musical-quality promotion');
    let sandboxChecks = null;
    let samplerChecks: Array<{ x: number; actual: number[]; expected: number[]; maxAbs: number }> = [];
    let alphaProbe = null;
    let feedbackProbe = null;
    let coordinateProbe = null;
    if (!process.argv.includes('--production')) {
        const sandboxPage = await browser.newPage();
        await sandboxPage.goto(option('--url', 'http://127.0.0.1:8080/'));
        alphaProbe = await sandboxPage.evaluate(async () => {
            const [{ convertSsfScene }, { loadBlinkFx }, { LabRenderSurface }] = await Promise.all([
                import('/src/packages/ssf/convert/convertSsfScene.ts' as string) as Promise<
                    typeof import('../src/packages/ssf/convert/convertSsfScene.ts')
                >,
                import('/src/packages/blinkfx/loader.ts' as string) as Promise<
                    typeof import('../src/packages/blinkfx/loader.ts')
                >,
                import('/src/runtime/lab/LabRenderSurface.ts' as string) as Promise<
                    typeof import('../src/runtime/lab/LabRenderSurface.ts')
                >,
            ]);
            const converted = convertSsfScene({
                slug: 'hdr_alpha_marker',
                sceneJson: { PASSES: [{ TARGET: 'hdr', FLOAT: true, DOUBLE_BUFFER: true }] },
                mainGlsl: 'vec4 renderMain(){return vec4(0.25,0.125,0.0,2.0);}',
                files: new Map(),
            });
            const effect = loadBlinkFx(converted.manifest, 'hdr-marker');
            const canvas = document.createElement('canvas');
            document.body.append(canvas);
            const surface = new LabRenderSurface(canvas, effect, converted);
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
                    controls: {},
                    uniforms: {},
                    analysisMs: 0,
                    scriptMs: 0,
                },
                { frame: 0, time: 0, delta: 1 / 60 }
            );
            const passes = await surface.capturePasses();
            const actual = [...passes[0].data.slice(0, 4)];
            await surface.destroy();
            canvas.remove();
            const expected = [0.25, 0.125, 0, 2];
            const maxAbs = Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
            return {
                actual,
                expected,
                maxAbs,
                status: maxAbs === 0 ? 'QUALIFIED_MARKER_PASS' : 'DECLARED_ALPHA_PIPELINE_DEVIATION',
            };
        });
        feedbackProbe = await sandboxPage.evaluate(async () => {
            const [{ convertSsfScene }, { loadBlinkFx }, { LabRenderSurface }] = await Promise.all([
                import('/src/packages/ssf/convert/convertSsfScene.ts' as string) as Promise<
                    typeof import('../src/packages/ssf/convert/convertSsfScene.ts')
                >,
                import('/src/packages/blinkfx/loader.ts' as string) as Promise<
                    typeof import('../src/packages/blinkfx/loader.ts')
                >,
                import('/src/runtime/lab/LabRenderSurface.ts' as string) as Promise<
                    typeof import('../src/runtime/lab/LabRenderSurface.ts')
                >,
            ]);
            const converted = convertSsfScene({
                slug: 'feedback_marker',
                sceneJson: { PASSES: [{ TARGET: 'history', FLOAT: true, DOUBLE_BUFFER: true }] },
                mainGlsl:
                    'vec4 renderMain(){vec4 prev=texture(history,_uv);return vec4(prev.rgb+vec3(0.25,0.125,0.0),FRAMECOUNT+1.0);}',
                files: new Map(),
            });
            const effect = loadBlinkFx(converted.manifest, 'feedback-marker');
            const canvas = document.createElement('canvas');
            document.body.append(canvas);
            const surface = new LabRenderSurface(canvas, effect, converted);
            await surface.init();
            const input = {
                snapshot: {
                    spectrum: new Float32Array(4096),
                    levelTrail: new Float32Array(1600),
                    profile: 'ssf-1.25.2-original' as const,
                    instant: { sourceEpoch: 0, sampleIndex: 0, audioTimeSec: 0, analysisSequence: 0 },
                    nativeTempo: { bpm: 0, confidence: 0 },
                    signals: new Map(),
                    diagnostics: {},
                },
                controls: {},
                uniforms: {},
                analysisMs: 0,
                scriptMs: 0,
            };
            const frames = [];
            for (let frame = 0; frame < 2; frame++) {
                await surface.render(input, { frame, time: frame / 60, delta: 1 / 60 });
                frames.push([...(await surface.capturePasses())[0].data.slice(0, 4)]);
            }
            await surface.reset();
            await surface.render(input, { frame: 0, time: 0, delta: 1 / 60 });
            const reset = [...(await surface.capturePasses())[0].data.slice(0, 4)];
            await surface.destroy();
            canvas.remove();
            return {
                frames,
                reset,
                expected: [
                    [0.25, 0.125, 0, 1],
                    [0.5, 0.25, 0, 2],
                ],
                scope: 'controlled marker matches supplied native GPU lifecycle capture; not arbitrary original app frames',
            };
        });
        assert.deepEqual(feedbackProbe.frames, feedbackProbe.expected);
        assert.deepEqual(feedbackProbe.reset, feedbackProbe.expected[0]);
        checks.push(
            'controlled native two-frame RGBA32F feedback marker, float FRAMECOUNT and reset match recorded native fixture'
        );
        coordinateProbe = await sandboxPage.evaluate(async () => {
            const [{ convertSsfScene }, { loadBlinkFx }, { LabRenderSurface }] = await Promise.all([
                import('/src/packages/ssf/convert/convertSsfScene.ts' as string) as Promise<
                    typeof import('../src/packages/ssf/convert/convertSsfScene.ts')
                >,
                import('/src/packages/blinkfx/loader.ts' as string) as Promise<
                    typeof import('../src/packages/blinkfx/loader.ts')
                >,
                import('/src/runtime/lab/LabRenderSurface.ts' as string) as Promise<
                    typeof import('../src/runtime/lab/LabRenderSurface.ts')
                >,
            ]);
            const converted = convertSsfScene({
                slug: 'coordinate_marker',
                sceneJson: { PASSES: [{ TARGET: 'coords', FLOAT: true, DOUBLE_BUFFER: true, WIDTH: 8, HEIGHT: 8 }] },
                mainGlsl: 'vec4 renderMain(){return vec4(_uv,_uvc);}',
                files: new Map(),
            });
            const effect = loadBlinkFx(converted.manifest, 'coordinate-marker');
            const canvas = document.createElement('canvas');
            document.body.append(canvas);
            const surface = new LabRenderSurface(canvas, effect, converted);
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
                    controls: {},
                    uniforms: {},
                    analysisMs: 0,
                    scriptMs: 0,
                },
                { frame: 0, time: 0, delta: 1 / 60 }
            );
            const actual = [...(await surface.capturePasses())[0].data.slice(0, 4)];
            await surface.destroy();
            canvas.remove();
            const f = Math.fround;
            const expected = [f(0.5 / 8), f(7.5 / 8), f(f(0.5 / 8) - 0.5), f(f(7.5 / 8) - 0.5)];
            return {
                actual,
                expected,
                maxAbs: Math.max(...actual.map((value, index) => Math.abs(value - expected[index]))),
                screen: [1920, 1080],
                target: [8, 8],
            };
        });
        assert.ok(coordinateProbe.maxAbs <= 1e-7, JSON.stringify(coordinateProbe));
        checks.push('sized-pass _uv/_uvc use pass-sized RENDERSIZE; native pixel parity remains unqualified');
        samplerChecks = await sandboxPage.evaluate(async () => {
            const [{ convertSsfScene }, { loadBlinkFx }, { LabRenderSurface }, { sampleSsf1D }] = await Promise.all([
                import('/src/packages/ssf/convert/convertSsfScene.ts' as string) as Promise<
                    typeof import('../src/packages/ssf/convert/convertSsfScene.ts')
                >,
                import('/src/packages/blinkfx/loader.ts' as string) as Promise<
                    typeof import('../src/packages/blinkfx/loader.ts')
                >,
                import('/src/runtime/lab/LabRenderSurface.ts' as string) as Promise<
                    typeof import('../src/runtime/lab/LabRenderSurface.ts')
                >,
                import('/src/packages/ssf/original/sampling.ts' as string) as Promise<
                    typeof import('../src/packages/ssf/original/sampling.ts')
                >,
            ]);
            const converted = convertSsfScene({
                slug: 'sampler_marker',
                sceneJson: {
                    CONTROLS: [{ NAME: 'sample_x', TYPE: 'slider', MIN: -2, MAX: 2, DEFAULT: 0 }],
                    PASSES: [{ TARGET: 'sampled', FLOAT: true, DOUBLE_BUFFER: true }],
                },
                mainGlsl: 'vec4 renderMain(){return vec4(texture(syn_Spectrum,sample_x).rgb,1.0);}',
                files: new Map(),
            });
            const effect = loadBlinkFx(converted.manifest, 'sampler-marker');
            const canvas = document.createElement('canvas');
            document.body.append(canvas);
            const surface = new LabRenderSurface(canvas, effect, converted);
            await surface.init();
            const spectrum = new Float32Array(4096);
            for (let i = 0; i < 1024; i++) {
                spectrum[i * 4] = i / 1024;
                spectrum[i * 4 + 1] = (i % 2) * 0.5;
                spectrum[i * 4 + 2] = 0.25;
                spectrum[i * 4 + 3] = 1;
            }
            const checks = [];
            for (const x of [0, 1, -1, 0.5 / 1024, 1023.5 / 1024, 0.25 / 1024, -0.25 / 1024]) {
                await surface.render(
                    {
                        snapshot: {
                            spectrum,
                            levelTrail: new Float32Array(1600),
                            profile: 'ssf-1.25.2-original' as const,
                            instant: { sourceEpoch: 0, sampleIndex: 0, audioTimeSec: 0, analysisSequence: 0 },
                            nativeTempo: { bpm: 0, confidence: 0 },
                            signals: new Map(),
                            diagnostics: {},
                        },
                        controls: { sample_x: x },
                        uniforms: {},
                        analysisMs: 0,
                        scriptMs: 0,
                    },
                    { frame: 0, time: 0, delta: 1 / 60 }
                );
                const passes = await surface.capturePasses();
                const actual = [...passes[0].data.slice(0, 3)];
                const expected = sampleSsf1D(spectrum, x).slice(0, 3);
                checks.push({
                    x,
                    actual,
                    expected,
                    maxAbs: Math.max(...actual.map((v, i) => Math.abs(v - expected[i]))),
                });
            }
            await surface.destroy();
            canvas.remove();
            return checks;
        });
        for (const check of samplerChecks) assert.ok(check.maxAbs <= 1e-7, JSON.stringify(check));
        checks.push('seven real GPU LINEAR/REPEAT sampler seam, wrap and texel-center probes match CPU oracle');
        sandboxChecks = await sandboxPage.evaluate(async () => {
            const { SsfScriptSandbox } = await (import(
                '/src/packages/ssf/script/SsfScriptSandbox.ts' as string
            ) as Promise<typeof import('../src/packages/ssf/script/SsfScriptSandbox.ts')>);
            const sandbox = new SsfScriptSandbox();
            const source = `var calls=0; function update(dt){calls++;setUniform('calls',calls);setUniform('dt',dt);setUniform('levelSeen',level);}`;
            const init = await sandbox.init(source, [], new Map([['level', 0.25]]), {}, {});
            const frame = await sandbox.step({ dt: Math.fround(1 / 60), values: new Map([['level', 0.75]]) }, {});
            sandbox.dispose();
            const stuck = new SsfScriptSandbox(300);
            let timeout = '';
            try {
                await stuck.init('function update(){while(true){}}', [], new Map(), {}, {});
            } catch (error) {
                timeout = String(error);
            }
            stuck.dispose();
            const network = new SsfScriptSandbox();
            const blocked = await network.init(
                `var blocked=0; [].constructor.constructor('return fetch')()('https://example.com').catch(function(){blocked=1}); function update(){setUniform('blocked',blocked);setUniform('noDocument',[].constructor.constructor('return typeof document')()==='undefined'?1:0);}`,
                [],
                new Map(),
                {},
                {}
            );
            await new Promise(resolve => setTimeout(resolve, 100));
            const isolated = await network.step({ dt: 0.02, values: new Map() }, {});
            network.dispose();
            return { init, frame, timeout, blocked, isolated, iframes: document.querySelectorAll('iframe').length };
        });
        await sandboxPage.close();
        assert.equal(sandboxChecks.init.uniforms.calls, 1);
        assert.equal(sandboxChecks.frame.uniforms.calls, 2);
        assert.equal(sandboxChecks.frame.uniforms.levelSeen, 0.75);
        assert.match(sandboxChecks.timeout, /timeout/);
        assert.equal(sandboxChecks.isolated.uniforms.blocked, 1);
        assert.equal(sandboxChecks.isolated.uniforms.noDocument, 1);
        assert.equal(sandboxChecks.iframes, 0);
        checks.push(
            'opaque script workers: native priming, frame inputs, CSP network denial, infinite-loop termination and disposal'
        );
    }
    const finalPassDiff = await capture();
    assert.match((await page.locator('[data-capture-info]').textContent())!, /Passaufnahme: Frame/);
    assert.equal(finalPassDiff[0].diff.maxAbs, 0);
    assert.deepEqual(errors, []);
    const gpu = await page.locator('[data-a]').evaluate((canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext('webgl2')!;
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            version: gl.getParameter(gl.VERSION),
            renderer: extension === null ? 'unavailable' : gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
        };
    });
    const report = {
        checks,
        status: await status(),
        gpu,
        browser: await browser.version(),
        exoVersion: '0.19.1',
        build: process.argv.includes('--production') ? 'production bundle' : 'development modules',
        nativePixelParity: 'INCONCLUSIVE; marker lane equivalence only',
        musicalAccuracy: 'UNKNOWN',
        errors,
        passDiff,
        finalPassDiff,
        sandboxChecks,
        samplerChecks,
        alphaProbe,
        feedbackProbe,
        coordinateProbe,
    };
    await writeFile(resolve(output, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    await page.screenshot({ path: resolve(output, 'lab-preview.png'), fullPage: true });
    console.log(JSON.stringify(report, null, 2));
} catch (error) {
    console.error(
        JSON.stringify(
            {
                completed: checks,
                status: await status(),
                errors,
                passes: await page.locator('[data-passes]').textContent(),
            },
            null,
            2
        )
    );
    await page.screenshot({ path: resolve(output, 'lab-failure.png'), fullPage: true });
    throw error;
} finally {
    await browser.close();
}
