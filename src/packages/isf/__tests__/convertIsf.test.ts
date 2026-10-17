import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateBlinkFxManifest } from '../../blinkfx/validate';
import type { IsfSource } from '../convert/convertIsf';
import { convertIsf } from '../convert/convertIsf';
import { splitIsf } from '../convert/parseIsf';
import { translateSizeExpression } from '../convert/sizeExpression';
import { isfDate, isfProfile } from '../profile/IsfProfile';

const FIXTURES = join(__dirname, 'fixtures');

function source(text: string, files = new Map<string, Uint8Array>()): IsfSource {
    return { slug: 'Test Shader', text, files };
}

const shaderOf = (result: ReturnType<typeof convertIsf>): string => String(result.files.get('shaders/main.frag.glsl'));

describe('splitIsf', () => {
    it('parses the leading comment and keeps line numbers', () => {
        const parts = splitIsf('/*{ "DESCRIPTION": "d" }*/\nvoid main() {}\n');

        expect(parts.header).toEqual({ DESCRIPTION: 'd' });
        expect(parts.body.split('\n')).toHaveLength(3);
        expect(parts.body).toContain('void main()');
        expect(parts.body).not.toContain('DESCRIPTION');
    });

    it('tolerates line comments and trailing commas', () => {
        const parts = splitIsf('/*{\n // note\n "INPUTS": [ { "NAME": "a", "TYPE": "float", }, ],\n}*/ void main() {}');
        expect(parts.header).toMatchObject({ INPUTS: [{ NAME: 'a' }] });
    });

    it('reports a broken header and still returns the body', () => {
        const parts = splitIsf('/* { not json */ void main() {}');
        expect(parts.header).toBeNull();
        expect(parts.headerError).toMatch(/not valid JSON/);
        expect(parts.body).toContain('void main()');
    });

    it('treats a file without a header as plain GLSL', () => {
        expect(splitIsf('void main() {}')).toMatchObject({ header: null, headerError: null });
    });
});

describe('translateSizeExpression', () => {
    const controls = new Set(['scale']);

    it('passes numbers and numeric strings through as pixel counts', () => {
        expect(translateSizeExpression(512, controls)).toEqual({ value: 512, dynamic: false });
        expect(translateSizeExpression('256', controls)).toEqual({ value: 256, dynamic: false });
        expect(translateSizeExpression(undefined, controls)).toEqual({ value: null, dynamic: false });
    });

    it('keeps an equation over the screen and numeric inputs', () => {
        expect(translateSizeExpression('max(16, floor($WIDTH * $scale))', controls)).toEqual({
            value: 'max(16, floor($WIDTH * $scale))',
            dynamic: true,
        });
    });

    it('reports a function outside the grammar and an input that is not numeric', () => {
        expect(translateSizeExpression('sqrt($WIDTH)', controls).error).toMatch(/sqrt/);
        expect(translateSizeExpression('$WIDTH * $missing', controls).error).toMatch(/\$missing/);
    });
});

describe('convertIsf', () => {
    it('converts a generator and declares the isf/2 profile', () => {
        const result = convertIsf(
            source(
                '/*{ "DESCRIPTION": "d", "CREDIT": "me", "CATEGORIES": ["Generator"] }*/\nvoid main() { gl_FragColor = vec4(isf_FragNormCoord, TIME, 1); }'
            )
        );

        expect(validateBlinkFxManifest(result.manifest).valid).toBe(true);
        expect(result.manifest).toMatchObject({
            id: 'com.codexo.isf.test_shader',
            author: 'me',
            description: 'd',
            tags: ['Generator'],
            kind: 'generator',
            compatibility: { source: { format: 'isf', version: '2.0' }, profile: 'isf/2', mode: 'preserve' },
        });
        const shader = shaderOf(result);
        expect(shader).toContain('fragColor = vec4(isf_FragNormCoord, TIME, 1.0);');
        expect(shader).toContain('isf_FragNormCoord = gl_FragCoord.xy / bl_resolution;');
    });

    it('maps each input type', () => {
        const result = convertIsf(
            source(`/*{ "INPUTS": [
        { "NAME": "f", "TYPE": "float", "DEFAULT": 2, "MIN": 0, "MAX": 4 },
        { "NAME": "b", "TYPE": "bool", "DEFAULT": true },
        { "NAME": "e", "TYPE": "event" },
        { "NAME": "l", "TYPE": "long", "VALUES": [10, 20], "LABELS": ["a", "b"], "DEFAULT": 20 },
        { "NAME": "p", "TYPE": "point2D", "DEFAULT": [0.25, 0.75] },
        { "NAME": "c", "TYPE": "color", "DEFAULT": [1, 0, 0, 1] },
        { "NAME": "img", "TYPE": "image" },
        { "NAME": "a", "TYPE": "audio" },
        { "NAME": "fft", "TYPE": "audioFFT", "MAX": 128 }
      ] }*/ void main() { gl_FragColor = vec4(1); }`)
        );

        expect(result.manifest.controls?.map(control => [control.name, control.type])).toEqual([
            ['f', 'float'],
            ['b', 'bool'],
            ['e', 'bool'],
            ['l', 'int'],
            ['p', 'point2d'],
            ['c', 'color'],
        ]);
        expect(result.manifest.controls?.find(control => control.name === 'l')).toMatchObject({
            default: 20,
            min: 10,
            max: 20,
        });
        expect(result.manifest.inputs).toEqual([
            { name: 'img', type: 'image', required: false },
            { name: 'a', type: 'audio' },
            { name: 'fft', type: 'audioFFT', samples: 128 },
        ]);
        expect(result.manifest.compatibility?.controls).toMatchObject({
            e: { type: 'event' },
            l: { labels: ['a', 'b'], values: [10, 20] },
        });
    });

    it('classifies filters and transitions by their conventional inputs', () => {
        const filter = convertIsf(
            source(
                '/*{ "INPUTS": [{ "NAME": "inputImage", "TYPE": "image" }] }*/ void main() { gl_FragColor = IMG_THIS_NORM_PIXEL(inputImage); }'
            )
        );
        expect(filter.manifest.kind).toBe('filter');
        expect(filter.manifest.passes?.[0].inputs).toEqual([{ source: 'input.inputImage', uniform: 'inputImage' }]);

        const transition = convertIsf(
            source(
                '/*{ "INPUTS": [{ "NAME": "startImage", "TYPE": "image" }, { "NAME": "endImage", "TYPE": "image" }, { "NAME": "progress", "TYPE": "float" }] }*/ void main() { gl_FragColor = mix(IMG_THIS_NORM_PIXEL(startImage), IMG_THIS_NORM_PIXEL(endImage), progress); }'
            )
        );
        expect(transition.manifest.kind).toBe('transition');
    });

    describe('passes', () => {
        it('keeps a targeted pass and writes the last untargeted one to the screen', () => {
            const { manifest } = convertIsf(
                source(`/*{ "PASSES": [ { "TARGET": "buf", "WIDTH": "$WIDTH/2", "HEIGHT": 100 }, { } ] }*/
          void main() { gl_FragColor = PASSINDEX == 0 ? vec4(1.0) : IMG_THIS_NORM_PIXEL(buf); }`)
            );

            expect(manifest.passes).toEqual([
                {
                    name: 'buf',
                    shader: 'main',
                    inputs: [],
                    target: { name: 'buf', width: '$WIDTH/2', height: 100, format: 'rgba8', persistent: false },
                    clear: true,
                },
                {
                    name: 'main',
                    shader: 'main',
                    inputs: [{ source: 'target.buf', uniform: 'buf' }],
                    target: 'screen',
                    clear: true,
                },
            ]);
        });

        it('reads a persistent buffer as the previous frame in its own pass and never clears it', () => {
            const { manifest } = convertIsf(
                source(`/*{ "PASSES": [ { "TARGET": "acc", "PERSISTENT": true, "FLOAT": true }, { } ] }*/
          void main() { gl_FragColor = IMG_THIS_NORM_PIXEL(acc); }`)
            );

            expect(manifest.passes?.[0]).toMatchObject({
                inputs: [{ source: 'target.acc.previous', uniform: 'acc' }],
                target: { format: 'rgba16f', persistent: true },
                clear: false,
            });
            expect(manifest.passes?.[1].inputs).toEqual([{ source: 'target.acc', uniform: 'acc' }]);
        });

        it('fails with a precise issue for an equation the grammar cannot express', () => {
            const result = convertIsf(
                source(
                    '/*{ "PASSES": [ { "TARGET": "b", "WIDTH": "sqrt($WIDTH)" }, { } ] }*/ void main() { gl_FragColor = vec4(1.0); }'
                )
            );

            expect(result.report.status).toBe('failed');
            expect(result.report.issues.find(issue => issue.code === 'size-expression-unsupported')?.message).toMatch(
                /sqrt/
            );
        });
    });

    describe('imported images', () => {
        const header =
            '/*{ "IMPORTED": { "tex": { "PATH": "noise.png" } } }*/ void main() { gl_FragColor = IMG_THIS_NORM_PIXEL(tex); }';

        it('packages a file that is present and binds it by canonical name', () => {
            const result = convertIsf(source(header, new Map([['noise.png', new Uint8Array([1, 2, 3])]])));

            expect(result.manifest.assets).toMatchObject([
                { name: 'tex', type: 'texture2d', path: 'assets/noise.png' },
            ]);
            expect(result.manifest.passes?.[0].inputs).toEqual([{ source: 'asset.tex', uniform: 'tex' }]);
            expect(result.files.get('assets/noise.png')).toEqual(new Uint8Array([1, 2, 3]));
        });

        it('fails rather than invent a missing asset', () => {
            const result = convertIsf(source(header));
            expect(result.report.status).toBe('failed');
            expect(result.report.issues.map(issue => issue.code)).toContain('asset-unresolved');
        });
    });

    it('warns about a companion vertex shader it does not run', () => {
        const result = convertIsf({
            ...source('void main() { gl_FragColor = vec4(1.0); }'),
            vertexText: 'void main() {}',
        });
        expect(result.report.status).toBe('approximate');
    });

    describe('the shipped fixtures', () => {
        for (const name of readdirSync(FIXTURES).filter(file => file.endsWith('.fs'))) {
            it(`${name} converts to a valid package`, () => {
                const result = convertIsf({
                    slug: name.replace('.fs', ''),
                    text: readFileSync(join(FIXTURES, name), 'utf8'),
                    files: new Map(),
                });

                expect(result.report.status).not.toBe('failed');
                expect(validateBlinkFxManifest(result.manifest).valid).toBe(true);
            });
        }
    });
});

describe('isf/2 profile', () => {
    it('formats DATE as year, 1-based month, day and seconds since midnight', () => {
        const date = isfDate(new Date(2026, 9, 5, 1, 2, 3, 500));
        expect([...date]).toEqual([2026, 10, 5, 3723.5]);
    });

    it('reads an event as true for exactly one frame after a rising edge', () => {
        const instance = isfProfile.create({
            compatibility: {
                source: null,
                profile: 'isf/2',
                mode: 'preserve',
                converter: null,
                controls: { go: { type: 'event' } },
                scriptUniforms: {},
            },
        } as never);

        const frames = [0, 1, 1, 0, 1].map(value => instance.processControls({ go: value }, 0.016).go);
        expect(frames).toEqual([0, 1, 0, 0, 1]);
    });
});
