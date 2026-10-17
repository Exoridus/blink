import { describe, expect, it, vi } from 'vitest';

import type { BlinkShaderEntry } from '../../ir/types';
import { resolveVisualShader } from '../resolveShaderText';

function files(map: Record<string, string>): (url: string) => Promise<string> {
    return vi.fn(async (url: string) => {
        if (!Object.hasOwn(map, url)) {
            throw new Error(`404 ${url}`);
        }
        return map[url];
    });
}

const entry = (overrides: Partial<BlinkShaderEntry> = {}): BlinkShaderEntry => ({
    path: null,
    source: null,
    vertex: null,
    stage: 'visual',
    ...overrides,
});

describe('resolveVisualShader', () => {
    it('returns inline source untouched and fetches nothing', async () => {
        const fetchText = files({});
        const out = await resolveVisualShader(entry({ source: 'void main() {}' }), undefined, fetchText);
        expect(out).toEqual({ fragment: 'void main() {}', vertex: null });
        expect(fetchText).not.toHaveBeenCalled();
    });

    it('fetches the fragment path and expands includes inside the package root', async () => {
        const fetchText = files({
            'fx/pkg/shaders/main.frag': '#include "lib/n.glsl"\nvoid main() {}',
            'fx/pkg/shaders/lib/n.glsl': 'float n;',
        });
        const out = await resolveVisualShader(entry({ path: 'fx/pkg/shaders/main.frag' }), 'fx/pkg', fetchText);
        expect(out.fragment).toBe('float n;\nvoid main() {}');
        expect(out.vertex).toBeNull();
    });

    it('resolves a vertex stage the same way', async () => {
        const fetchText = files({
            'fx/pkg/a.frag': 'F',
            'fx/pkg/a.vert': '#include "common.glsl"\nV',
            'fx/pkg/common.glsl': 'C',
        });
        const out = await resolveVisualShader(
            entry({ path: 'fx/pkg/a.frag', vertex: { path: 'fx/pkg/a.vert', source: null } }),
            'fx/pkg/',
            fetchText
        );
        expect(out).toEqual({ fragment: 'F', vertex: 'C\nV' });
    });

    it('rejects an include that would leave the package root', async () => {
        const fetchText = files({ 'fx/pkg/s/m.frag': '#include "../../other/secret.glsl"' });
        await expect(resolveVisualShader(entry({ path: 'fx/pkg/s/m.frag' }), 'fx/pkg', fetchText)).rejects.toThrow(
            /not a relative path inside the package/
        );
    });

    it('does not expand includes when the package root is unknown', async () => {
        const fetchText = files({ 'x/m.frag': '#include "a.glsl"' });
        const out = await resolveVisualShader(entry({ path: 'x/m.frag' }), undefined, fetchText);
        expect(out.fragment).toBe('#include "a.glsl"');
    });

    it('reports a missing file with its url', async () => {
        await expect(resolveVisualShader(entry({ path: 'fx/pkg/m.frag' }), 'fx/pkg', files({}))).rejects.toThrow(
            /fx\/pkg\/m\.frag/
        );
    });

    it('refuses an entry with neither source nor path', async () => {
        await expect(resolveVisualShader(entry(), 'fx', files({}))).rejects.toThrow(/neither source nor path/);
    });

    it('refuses an audio-stage entry', async () => {
        await expect(resolveVisualShader(entry({ path: 'a', stage: 'audio' }), 'fx', files({}))).rejects.toThrow(
            /audio/
        );
    });
});
