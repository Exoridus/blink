import { workspacePath } from './lib/workspacePaths.ts';
/* global document */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const argument = (name: string, fallback: string) =>
    process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const output = resolve(argument('--out', workspacePath('artifacts/ssf-catalog-gpu.json')));
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
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    const url = argument('--url', 'http://127.0.0.1:8080/');
    await withoutHmr(page);
    await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto(url);
    const result = await page.evaluate(async only => {
        const [
            { BlinkFxService },
            { buildBlinkPrelude },
            { buildPassPrelude },
            { stripGlslPreamble },
            { upgradeFragmentShaderToGl300 },
            { ssfOriginalProfile },
            { fetchPackageFile },
        ] = await Promise.all([
            import('/src/services/BlinkFxService.ts' as string) as Promise<
                typeof import('../src/services/BlinkFxService.ts')
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
            import('/src/runtime/render/upgradeFragmentShaderToGl300.ts' as string) as Promise<
                typeof import('../src/runtime/render/upgradeFragmentShaderToGl300.ts')
            >,
            import('/src/packages/ssf/profile/SsfOriginalProfile.ts' as string) as Promise<
                typeof import('../src/packages/ssf/profile/SsfOriginalProfile.ts')
            >,
            import('/src/runtime/package/packageMount.ts' as string) as Promise<
                typeof import('../src/runtime/package/packageMount.ts')
            >,
        ]);
        const gl = document.createElement('canvas').getContext('webgl2')!;
        const service = new BlinkFxService();
        const rows = [];
        for (const pkg of (await service.getPackageList()).filter(
            p => p.sourceFiles && (only.length === 0 || only.some(id => p.id.includes(id)))
        )) {
            try {
                const ir = await service.loadPackage(pkg.id);
                const profile = ssfOriginalProfile.create(ir);
                const samplerNames = [...new Set(ir.passes.flatMap(p => p.inputs.map(i => i.uniform)))];
                const sources = [];
                for (const entry of Object.values(ir.shaders.glsl)) {
                    const fragment = await (await fetchPackageFile(entry.path!)).text();
                    const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
                    const code =
                        buildBlinkPrelude(ir.controls).source +
                        '\n' +
                        profile.prelude +
                        '\n' +
                        buildPassPrelude(samplerNames) +
                        '\n' +
                        stripGlslPreamble(upgradeFragmentShaderToGl300(fragment));
                    gl.shaderSource(shader, code);
                    gl.compileShader(shader);
                    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
                    const log = gl.getShaderInfoLog(shader);
                    sources.push({ success, log });
                    gl.deleteShader(shader);
                }
                profile.dispose?.();
                rows.push({ id: pkg.id, scene: pkg.basePath, success: sources.every(s => s.success), sources });
            } catch (error) {
                rows.push({ id: pkg.id, scene: pkg.basePath, success: false, error: String(error) });
            } finally {
                service.releasePackage(pkg.id);
            }
        }
        return rows;
    }, argument('--only', '').split(',').filter(Boolean));
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    console.log(result.length, 'checked;', result.filter(r => r.success).length, 'compiled');
    for (const row of result.filter(r => !r.success))
        console.log(row.id, (row.error ?? row.sources.map(s => s.log).join('\n')).split('\n')[0]);
    if (result.some(row => !row.success)) process.exitCode = 1;
} finally {
    await browser.close();
}
