import { describe, expect, it } from 'vitest';

import { MemoryPackageFiles } from '../packageReader';
import { MAX_TEXTURE_BINDINGS, validatePackage } from '../validatePackage';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function pack(manifest: unknown, extra: Record<string, string> = {}): MemoryPackageFiles {
    const entries: Record<string, string> = {
        'manifest.json': typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
        'shaders/main.frag.glsl': 'void main() {}',
        ...extra,
    };
    return new MemoryPackageFiles(new Map(Object.entries(entries).map(([path, text]) => [path, encode(text)])));
}

const base = {
    format: 'blinkfx/1',
    id: 'com.test.package',
    title: 'Package',
    shaders: { glsl: { main: 'shaders/main.frag.glsl' } },
};

const codes = (findings: readonly { code: string }[]): string[] => findings.map(finding => finding.code);

describe('validatePackage', () => {
    it('accepts a minimal package and measures it', async () => {
        const result = await validatePackage(pack(base));

        expect(result.valid).toBe(true);
        expect(result.findings).toEqual([]);
        expect(result.budget).toMatchObject({ passes: 0, maxTextureBindings: 0 });
    });

    it('checks a caller-specified renderer binding budget', async () => {
        const assets = Array.from({ length: 8 }, (_, i) => ({
            name: `image${i}`,
            path: 'image.png',
            type: 'texture2d',
        }));
        const files = pack(
            {
                ...base,
                assets,
                passes: [
                    {
                        name: 'main',
                        shader: 'main',
                        target: 'screen',
                        inputs: assets.map(a => ({ uniform: a.name, source: `asset.${a.name}` })),
                    },
                ],
            },
            { 'image.png': 'image' }
        );
        expect((await validatePackage(files)).valid).toBe(false);
        expect((await validatePackage(files, { maxTextureBindings: 16 })).valid).toBe(true);
        expect((await validatePackage(files, { maxTextureBindings: 4 })).valid).toBe(false);
    });

    it('reports a missing manifest as data', async () => {
        const result = await validatePackage(new MemoryPackageFiles(new Map()));

        expect(result.valid).toBe(false);
        expect(codes(result.findings)).toEqual(['manifest-missing']);
    });

    it('reports a manifest that is not JSON', async () => {
        const result = await validatePackage(pack('{ nope'));

        expect(codes(result.findings)).toEqual(['manifest-json']);
        expect(result.manifest).toBeNull();
    });

    it('reports a manifest that breaks the schema', async () => {
        const result = await validatePackage(pack({ format: 'blinkfx/1' }));

        expect(result.valid).toBe(false);
        expect(new Set(codes(result.findings))).toEqual(new Set(['manifest-invalid']));
    });

    it('reports a file the manifest names but the package lacks', async () => {
        const result = await validatePackage(pack({ ...base, thumbnail: 'thumb.png' }));

        expect(result.valid).toBe(false);
        expect(result.findings).toContainEqual(
            expect.objectContaining({ code: 'file-missing', message: expect.stringContaining('thumb.png') })
        );
    });

    it('reports an include that leaves the package', async () => {
        const result = await validatePackage(
            pack(base, { 'shaders/main.frag.glsl': '#include "../../outside.glsl"\nvoid main() {}' })
        );

        expect(result.valid).toBe(false);
        expect(codes(result.findings)).toContain('include-invalid');
    });

    it('resolves a package-local include', async () => {
        const result = await validatePackage(
            pack(base, {
                'shaders/main.frag.glsl': '#include "lib.glsl"\nvoid main() {}',
                'shaders/lib.glsl': 'float one() { return 1.0; }',
            })
        );

        expect(result.valid).toBe(true);
    });

    it('rejects a pass that binds more textures than a material holds', async () => {
        const inputs = Array.from({ length: MAX_TEXTURE_BINDINGS + 1 }, (_, index) => `t${index}`);
        const targets = inputs.map(name => ({ name, shader: 'main', target: { name }, inputs: [] as string[] }));
        const manifest = {
            ...base,
            passes: [...targets, { name: 'present', shader: 'main', target: 'screen', inputs }],
        };

        const result = await validatePackage(pack(manifest));

        expect(result.budget?.maxTextureBindings).toBe(MAX_TEXTURE_BINDINGS + 1);
        expect(codes(result.findings)).toContain('budget-texture-bindings');
        expect(result.valid).toBe(false);
    });

    it('counts a persistent target twice in the render-target budget', async () => {
        const pass = (persistent: boolean): unknown => ({
            ...base,
            passes: [{ name: 'a', shader: 'main', target: { name: 'buf', persistent, format: 'rgba16f' } }],
        });

        const transient = (await validatePackage(pack(pass(false)))).budget?.targetBytes ?? 0;
        const persistent = (await validatePackage(pack(pass(true)))).budget?.targetBytes ?? 0;

        expect(transient).toBe(1920 * 1080 * 8);
        expect(persistent).toBe(transient * 2);
    });

    it('warns, without failing, about a render-target budget over the limit', async () => {
        const manifest = {
            ...base,
            passes: [
                { name: 'a', shader: 'main', target: { name: 'huge', width: 16384, height: 16384, format: 'rgba32f' } },
            ],
        };

        const result = await validatePackage(pack(manifest));

        expect(result.findings).toContainEqual(
            expect.objectContaining({ code: 'budget-target-memory', severity: 'warning' })
        );
        expect(result.valid).toBe(true);
    });

    describe('WGSL programs', () => {
        const wgslManifest = { ...base, shaders: { wgsl: { main: 'shaders/main.wgsl' } } };
        const fragment =
            '@fragment\nfn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';

        it('accepts a program with its fragment entry point', async () => {
            const result = await validatePackage(pack(wgslManifest, { 'shaders/main.wgsl': fragment }));

            expect(result.findings).toEqual([]);
        });

        it('finds a program without the entry point the runtime calls', async () => {
            const result = await validatePackage(pack(wgslManifest, { 'shaders/main.wgsl': 'fn helper() {}' }));

            expect(codes(result.findings)).toEqual(['wgsl-entry-missing']);
            expect(result.valid).toBe(false);
        });

        it('does not count an entry point that only appears in a comment', async () => {
            const result = await validatePackage(
                pack(wgslManifest, {
                    'shaders/main.wgsl': `// @fragment fn fragmentMain
/* @fragment fn fragmentMain */
fn helper() {}`,
                })
            );

            expect(codes(result.findings)).toEqual(['wgsl-entry-missing']);
        });

        it.each([
            '@vertex fn vertexMain() {}',
            'struct BlinkVarying { x: f32 }',
            'struct BlinkUniforms { x: f32 }',
            'fn bl_fragCoord() {}',
        ])('finds a program that defines what the runtime defines: %s', async definition => {
            const result = await validatePackage(
                pack(wgslManifest, {
                    'shaders/main.wgsl': `${fragment}
${definition}`,
                })
            );

            expect(codes(result.findings)).toEqual(['wgsl-redefines-runtime']);
        });
    });
});
