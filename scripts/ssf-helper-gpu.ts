/* global document */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = <T extends string | undefined>(name: string, fallback: T): string | T =>
    process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
interface Probe {
    name: string;
    expression: string;
    prefix: string;
    setup: string;
}
type PixelValue = number | 'NaN' | '+Inf' | '-Inf';
interface Variant {
    pixels?: PixelValue[];
    error?: string;
    expression?: string;
}
interface ProbeRow {
    name: string;
    expression: string;
    variants: Partial<Record<'reference' | 'current', Variant>>;
}
interface Failure {
    index: number;
    name: string;
    error?: string;
    differences?: Array<{ component: number; expected: PixelValue; actual: PixelValue }>;
}
const probes: Probe[] = JSON.parse(
    await readFile(new URL('./fixtures/ssf-helper-probes.json', import.meta.url), 'utf8')
);
const referencePath = arg('--reference', undefined);
const reference = referencePath ? await readFile(referencePath, 'utf8') : undefined;
const oracle: { rows: Variant[] } | undefined = reference
    ? undefined
    : JSON.parse(await readFile(new URL('./fixtures/ssf-helper-native-1.25.2.json', import.meta.url), 'utf8'));
const playwright = (await import(
    arg('--playwright', '') ? pathToFileURL(resolve(arg('--playwright', ''))).href : 'playwright'
)) as typeof import('playwright');
const browser = await playwright.chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    await page.goto(arg('--url', 'http://127.0.0.1:8080/'), { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(
        async ({ probes, reference }) => {
            const [{ SSF_HELPER_BLOCKS }, { floatifyIntegerLiterals }, { tokenize, detokenize, findFunctions }] =
                await Promise.all([
                    import('/src/packages/ssf/profile/helperLibrary.ts' as string) as Promise<
                        typeof import('../src/packages/ssf/profile/helperLibrary.ts')
                    >,
                    import('/src/packages/ssf/convert/glslAdapt.ts' as string) as Promise<
                        typeof import('../src/packages/ssf/convert/glslAdapt.ts')
                    >,
                    import('/src/packages/ssf/convert/glslText.ts' as string) as Promise<
                        typeof import('../src/packages/ssf/convert/glslText.ts')
                    >,
                ]);
            const defaults = {
                syn_MediaType: 3,
                _Fit_or_Fill: 0,
                _Hor_Flip: 0,
                _Vert_Flip: 0,
                _Media_Scale: 1.2,
                _Media_Contrast: 1.4,
                _Invert_Media: 0.2,
                _Media_Invert: 0.2,
                _Contrast: 1.3,
            };
            const referenceBlocks: import('../src/packages/ssf/profile/helperLibrary.ts').HelperBlock[] = [];
            if (reference) {
                const tokens = tokenize(reference);
                for (const fn of findFunctions(tokens)) {
                    if (fn.bodyStart < 0 || fn.name === 'main') continue;
                    let start = fn.bodyStart;
                    while (start >= 0 && tokens[start].text !== fn.name) start--;
                    while (start >= 0 && tokens[start].text !== fn.returnType) start--;
                    referenceBlocks.push({
                        provides: [fn.name],
                        code: detokenize(tokens.slice(start, fn.bodyEnd + 1)),
                    });
                }
            }
            const gl = document.createElement('canvas').getContext('webgl2')!;
            if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 RGBA32F readback required');
            const compile = (type: number, source: string) => {
                const shader = gl.createShader(type)!;
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)!);
                return shader;
            };
            const vertex = compile(
                gl.VERTEX_SHADER,
                '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}'
            );
            const makeTexture = (
                width: number,
                height: number,
                unit: number,
                data: Float32Array<ArrayBuffer> | null
            ) => {
                gl.activeTexture(gl.TEXTURE0 + unit);
                const texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                return texture;
            };
            const ramp = (width: number, height: number, bias: number) =>
                Float32Array.from({ length: width * height * 4 }, (_, i) => {
                    const pixel = Math.floor(i / 4),
                        channel = i % 4;
                    return channel === 0
                        ? (pixel % width) / width + bias
                        : channel === 1
                          ? Math.floor(pixel / width) / height
                          : channel === 2
                            ? 0.25
                            : 0.3;
                });
            const target = makeTexture(4, 4, 3, null);
            const framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                throw new Error('Incomplete RGBA32F framebuffer');
            makeTexture(8, 4, 0, ramp(8, 4, 0));
            makeTexture(4, 8, 1, ramp(4, 8, 0.1));
            makeTexture(1, 1, 2, new Float32Array(4));
            gl.viewport(0, 0, 4, 4);
            const rows: ProbeRow[] = [];
            for (const probe of probes) {
                const row: ProbeRow = { name: probe.name, expression: probe.expression, variants: {} };
                for (const variant of reference ? (['reference', 'current'] as const) : (['current'] as const)) {
                    try {
                        const blocks = variant === 'reference' ? referenceBlocks : SSF_HELPER_BLOCKS;
                        const ordered: string[] = [],
                            visiting = new Set<import('../src/packages/ssf/profile/helperLibrary.ts').HelperBlock>();
                        const visit = (name: string): void => {
                            for (const block of blocks.filter(b => b.provides.includes(name))) {
                                if (visiting.has(block)) continue;
                                visiting.add(block);
                                const deps =
                                    variant === 'reference'
                                        ? [...block.code.matchAll(/\b(_\w+)\s*\(/g)].map(m => m[1])
                                        : (block.requires ?? []);
                                for (const dep of deps) if (!block.provides.includes(dep)) visit(dep);
                                ordered.push(block.code);
                            }
                        };
                        visit(probe.name);
                        let code = ordered.join('\n');
                        if (variant === 'reference') {
                            const tokens = tokenize(code);
                            floatifyIntegerLiterals(tokens);
                            code = detokenize(tokens);
                        }
                        const constants = Object.entries(defaults)
                            .filter(([name]) => !probe.prefix.includes(`float ${name}=`))
                            .map(([name, value]) => `const float ${name}=${value.toFixed(2)};`)
                            .join('\n');
                        const fragment = compile(
                            gl.FRAGMENT_SHADER,
                            `#version 300 es\nprecision highp float;precision highp int;\n#define PI 3.14159265358979\nconst vec2 RENDERSIZE=vec2(4.0);const vec2 bl_resolution=vec2(4.0);vec2 _uv;vec2 _xy;uniform sampler2D syn_Media;uniform sampler2D syn_UserImage;uniform sampler2D emptyTexture;out vec4 result;\n${probe.prefix}\n${constants}\n${code}\nvoid main(){_xy=gl_FragCoord.xy;_uv=_xy/RENDERSIZE;${probe.setup}result=${probe.expression};}`
                        );
                        const program = gl.createProgram()!;
                        gl.attachShader(program, vertex);
                        gl.attachShader(program, fragment);
                        gl.linkProgram(program);
                        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
                            throw new Error(gl.getProgramInfoLog(program)!);
                        gl.useProgram(program);
                        for (const [name, unit] of [
                            ['syn_Media', 0],
                            ['syn_UserImage', 1],
                            ['emptyTexture', 2],
                        ] as const)
                            gl.uniform1i(gl.getUniformLocation(program, name), unit);
                        gl.drawArrays(gl.TRIANGLES, 0, 3);
                        const pixels = new Float32Array(64);
                        gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.FLOAT, pixels);
                        row.variants[variant] = {
                            pixels: Array.from(pixels, value =>
                                Number.isNaN(value)
                                    ? 'NaN'
                                    : value === Infinity
                                      ? '+Inf'
                                      : value === -Infinity
                                        ? '-Inf'
                                        : value
                            ),
                        };
                        gl.deleteProgram(program);
                        gl.deleteShader(fragment);
                    } catch (error) {
                        row.variants[variant] = { error: String(error) };
                    }
                }
                rows.push(row);
            }
            return { renderer: gl.getParameter(gl.RENDERER), gpuError: gl.getError(), rows };
        },
        { probes, reference }
    );
    if (reference) {
        const failures = result.rows.filter(row => row.variants.reference!.error);
        assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 3)));
        const output = arg('--oracle-output', undefined);
        if (output)
            await writeFile(
                output,
                JSON.stringify(
                    {
                        reference: 'Recovered Synesthesia 1.25.2 arithmetic on WebGL2; not a native host replay',
                        sourceSha256: createHash('sha256').update(reference).digest('hex'),
                        renderer: result.renderer,
                        rows: result.rows.map(row => {
                            const pixels = row.variants.reference!.pixels!;
                            const constant = pixels.every((value, index) => value === pixels[index % 4]);
                            return {
                                name: row.name,
                                expression: row.expression,
                                pixels: constant ? pixels.slice(0, 4) : pixels,
                            };
                        }),
                    },
                    null,
                    2
                ) + '\n'
            );
    }
    const failures = result.rows.flatMap<Failure>((row, index) => {
        const expected = reference ? row.variants.reference! : oracle!.rows[index];
        assert.equal(expected.expression ?? row.expression, row.expression, 'Oracle/probe order differs');
        const actual = row.variants.current!;
        if (actual.error) return [{ index, name: row.name, error: actual.error }];
        const differences = actual.pixels!.flatMap((value, i) => {
            const expectedValue = expected.pixels![expected.pixels!.length === 4 ? i % 4 : i];
            return typeof value === 'number' && typeof expectedValue === 'number'
                ? Math.abs(value - expectedValue) <= 1e-5 * Math.max(1, Math.abs(expectedValue))
                    ? []
                    : [{ component: i, expected: expectedValue, actual: value }]
                : value === expectedValue
                  ? []
                  : [{ component: i, expected: expectedValue, actual: value }];
        });
        return differences.length ? [{ index, name: row.name, differences: differences.slice(0, 4) }] : [];
    });
    const output = arg('--output', undefined);
    if (output) await writeFile(output, JSON.stringify({ ...result, failures }, null, 2) + '\n');
    console.log(
        JSON.stringify({
            probes: result.rows.length,
            failed: failures.length,
            gpuError: result.gpuError,
            failures: failures.slice(0, 8),
        })
    );
    assert.equal(result.gpuError, 0);
    assert.equal(failures.length, 0, 'SSF helper GPU numerical regressions');
} finally {
    await browser.close();
}
