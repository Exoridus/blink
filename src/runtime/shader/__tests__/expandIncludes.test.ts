import { describe, expect, it } from 'vitest';

import { expandShaderIncludes, ShaderIncludeError } from '../expandIncludes';

function reader(files: Record<string, string>): (path: string) => Promise<string> {
    return async path => {
        if (!Object.hasOwn(files, path)) {
            throw new Error(`missing ${path}`);
        }
        return files[path];
    };
}

const expand = (entry: string, files: Record<string, string>, options = {}): Promise<string> =>
    expandShaderIncludes(entry, reader(files), options);

describe('expandShaderIncludes', () => {
    it('returns a source without includes unchanged', async () => {
        const source = 'void main() {}\n';
        await expect(expand('shaders/main.frag.glsl', { 'shaders/main.frag.glsl': source })).resolves.toBe(source);
    });

    it('inlines an include relative to the including file', async () => {
        const out = await expand('shaders/main.frag.glsl', {
            'shaders/main.frag.glsl': 'a\n#include "lib/noise.glsl"\nb\n',
            'shaders/lib/noise.glsl': 'float n() { return 1.0; }\n',
        });
        expect(out).toBe('a\nfloat n() { return 1.0; }\n\nb\n');
    });

    it('resolves nested includes against each file in turn, including parent segments', async () => {
        const out = await expand('shaders/main.frag.glsl', {
            'shaders/main.frag.glsl': '#include "lib/a.glsl"',
            'shaders/lib/a.glsl': '#include "../common/b.glsl"',
            'shaders/common/b.glsl': 'B',
        });
        expect(out).toBe('B');
    });

    it('tolerates whitespace in the directive', async () => {
        const out = await expand('m.glsl', { 'm.glsl': '  #  include   "x.glsl"  \n', 'x.glsl': 'X' });
        expect(out).toBe('X\n');
    });

    it('allows the same file to be included twice when it is not a cycle', async () => {
        const out = await expand('m.glsl', {
            'm.glsl': '#include "x.glsl"\n#include "x.glsl"',
            'x.glsl': 'X',
        });
        expect(out).toBe('X\nX');
    });

    it('does not treat a commented-out include as a directive', async () => {
        const source = '// #include "missing.glsl"\nvoid main() {}';
        await expect(expand('m.glsl', { 'm.glsl': source })).resolves.toBe(source);
    });

    it('rejects a direct and an indirect cycle', async () => {
        await expect(expand('a.glsl', { 'a.glsl': '#include "a.glsl"' })).rejects.toThrow(/cycle/i);
        await expect(
            expand('a.glsl', { 'a.glsl': '#include "b.glsl"', 'b.glsl': '#include "a.glsl"' })
        ).rejects.toThrow(/cycle/i);
    });

    it('rejects paths that leave the package root', async () => {
        for (const target of [
            '../secret.glsl',
            'lib/../../secret.glsl',
            '/etc/passwd',
            'https://evil.test/x.glsl',
            'C:/x.glsl',
            'a\\b.glsl',
        ]) {
            await expect(
                expand('shaders/main.glsl', { 'shaders/main.glsl': `#include "${target}"` }),
                target
            ).rejects.toThrow(ShaderIncludeError);
        }
    });

    it('rejects angle-bracket and malformed includes', async () => {
        await expect(expand('m.glsl', { 'm.glsl': '#include <x.glsl>' })).rejects.toThrow(ShaderIncludeError);
        await expect(expand('m.glsl', { 'm.glsl': '#include x.glsl' })).rejects.toThrow(ShaderIncludeError);
        await expect(expand('m.glsl', { 'm.glsl': '#include ""' })).rejects.toThrow(ShaderIncludeError);
    });

    it('names the including file when an include cannot be read', async () => {
        await expect(expand('m.glsl', { 'm.glsl': '#include "gone.glsl"' })).rejects.toThrow(/m\.glsl.*gone\.glsl/s);
    });

    it('enforces a depth limit', async () => {
        const files: Record<string, string> = {};
        for (let i = 0; i < 40; i++) {
            files[`f${i}.glsl`] = `#include "f${i + 1}.glsl"`;
        }
        files['f40.glsl'] = 'end';
        await expect(expand('f0.glsl', files)).rejects.toThrow(/depth/i);
        await expect(expand('f0.glsl', files, { maxDepth: 64 })).resolves.toBe('end');
    });

    it('enforces a total size limit so an include bomb cannot exhaust memory', async () => {
        const files = {
            'm.glsl': '#include "a.glsl"\n'.repeat(10),
            'a.glsl': '#include "b.glsl"\n'.repeat(10),
            'b.glsl': 'x'.repeat(1000),
        };
        await expect(expand('m.glsl', files, { maxBytes: 50_000 })).rejects.toThrow(/size/i);
    });
});
