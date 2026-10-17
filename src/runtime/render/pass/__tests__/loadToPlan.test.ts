import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import fullManifest from '../../../../../public/effects/full.blinkfx/manifest.json';
import { loadBlinkFx } from '../../../../packages/blinkfx/loader';
import type { BlinkFxManifest } from '../../../../packages/blinkfx/manifest';
import { validateBlinkFxManifest } from '../../../../packages/blinkfx/validate';
import { buildBlinkPrelude } from '../../BlinkPrelude';
import { buildPassPrelude } from '../buildPassPrelude';
import { planPasses } from '../planPasses';

const manifest: BlinkFxManifest = {
    format: 'blinkfx/1',
    id: 'com.test.multipass',
    title: 'Multipass Probe',
    shaders: { glsl: 'shaders/main.frag.glsl' },
    passes: [
        { name: 'write', shader: 'main', target: { name: 'buf', persistent: false }, clear: true },
        { name: 'present', shader: 'main', inputs: ['buf'], target: 'screen', clear: true },
    ],
};

describe('loadBlinkFx → planPasses (multipass)', () => {
    it('produces a transient buffer pass then a screen pass reading it', () => {
        const ir = loadBlinkFx(manifest, 'effects/multipass_probe.blinkfx');
        const plan = planPasses(ir);
        expect(plan.renderTargets.map(rt => rt.name)).toEqual(['buf']);
        expect(plan.renderTargets[0].persistent).toBe(false);
        expect(plan.passes.map(p => p.name)).toEqual(['write', 'present']);
        expect(plan.passes[1].inputs).toEqual([
            { uniform: 'buf', source: { kind: 'target', name: 'buf', previous: false } },
        ]);
    });
});

/** `public/` as an absolute path, so the manifest's resolved paths can be checked against the real package on disk. */
const PUBLIC_DIR = fileURLToPath(new URL('../../../../../public/', import.meta.url));

function readPackageFile(resolvedPath: string | null): Buffer {
    if (resolvedPath === null) {
        throw new Error('readPackageFile: the shader entry carries inline source, not a package path');
    }
    return readFileSync(PUBLIC_DIR + resolvedPath);
}

describe('loadBlinkFx → planPasses (full.blinkfx package)', () => {
    it('plans full.blinkfx with an asset sampler and a cross-target previous read', () => {
        const ir = loadBlinkFx(fullManifest as unknown as BlinkFxManifest, 'effects/full.blinkfx');
        const plan = planPasses(ir);

        expect(plan.passes[0].inputs).toEqual([
            { uniform: 'uPrevious', source: { kind: 'target', name: 'feedback', previous: true } },
            { uniform: 'uNoise', source: { kind: 'asset', name: 'noise' } },
        ]);
        expect(plan.passes[1].inputs).toEqual([
            { uniform: 'uFeedback', source: { kind: 'target', name: 'feedback', previous: false } },
        ]);
    });

    it('plans a half-scale persistent feedback target that the first pass does not clear', () => {
        const ir = loadBlinkFx(fullManifest as unknown as BlinkFxManifest, 'effects/full.blinkfx');
        const plan = planPasses(ir);

        expect(plan.passes.map(p => p.name)).toEqual(['feedback', 'main']);
        expect(plan.passes.map(p => p.shaderKey)).toEqual(['feedback', 'main']);
        expect(plan.passes.map(p => p.target)).toEqual([
            { kind: 'renderTarget', name: 'feedback' },
            { kind: 'screen' },
        ]);
        expect(plan.passes.map(p => p.clear)).toEqual([false, true]);
        expect(plan.renderTargets).toEqual([
            { name: 'feedback', width: null, height: null, scale: 0.5, format: 'rgba8', persistent: true },
        ]);
    });

    it('declares only GLSL shaders and a resolvable script entry', () => {
        const ir = loadBlinkFx(fullManifest as unknown as BlinkFxManifest, 'effects/full.blinkfx');

        expect(Object.keys(ir.shaders.glsl).sort()).toEqual(['feedback', 'main']);
        expect(Object.keys(ir.shaders.wgsl)).toEqual([]);
        expect(ir.script).toEqual({
            entry: 'effects/full.blinkfx/scripts/main.js',
            abi: 'blink/1',
            events: [{ input: 'palette', on: 'change', handler: 'onPaletteChange' }],
        });
    });

    it('passes manifest validation including cross-reference checks', () => {
        const result = validateBlinkFxManifest(fullManifest);
        expect(result.valid ? [] : result.errors).toEqual([]);
    });

    it('ships every file the manifest resolves to', () => {
        const ir = loadBlinkFx(fullManifest as unknown as BlinkFxManifest, 'effects/full.blinkfx');
        const declared = [
            ...Object.values(ir.shaders.glsl).map(s => s.path),
            ...ir.assets.map(a => a.path),
            ...ir.presets.map(p => p.path),
            ir.script?.entry ?? '',
        ];

        const missing = declared.filter(path => {
            try {
                readPackageFile(path);
                return false;
            } catch {
                return true;
            }
        });
        expect(missing).toEqual([]);
    });

    it('ships the noise asset as a 256x256 PNG', () => {
        const png = readPackageFile('effects/full.blinkfx/assets/noise.png');

        expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
        expect(png.readUInt32BE(16)).toBe(256);
        expect(png.readUInt32BE(20)).toBe(256);
        expect(png[24]).toBe(8); // bit depth
        expect(png[25]).toBe(6); // colour type RGBA
    });

    it('assembles both shaders with every referenced uniform declared exactly once', () => {
        const ir = loadBlinkFx(fullManifest as unknown as BlinkFxManifest, 'effects/full.blinkfx');
        const plan = planPasses(ir);
        const samplerNames = [...new Set(plan.passes.flatMap(p => p.inputs.map(i => i.uniform)))];
        const prelude = `${buildBlinkPrelude(ir.controls).source}\n${buildPassPrelude(samplerNames)}`;

        const declared = [...prelude.matchAll(/^uniform\s+\w+\s+(\w+)\s*;/gm)].map(m => m[1]);
        expect(declared.length).toBe(new Set(declared).size);

        const referenced = new Set<string>();
        for (const pass of plan.passes) {
            const body = readPackageFile(ir.shaders.glsl[pass.shaderKey].path).toString('utf8');
            // The prelude is the only uniform declaration site; a package that also
            // declares one produces a duplicate and the assembled shader fails to compile.
            expect(body).not.toMatch(/^\s*uniform\b/m);
            for (const m of body.matchAll(/\b(?:bl_|au_|syn_|fx_)\w+/g)) {
                referenced.add(m[0]);
            }
            for (const m of body.matchAll(/\btexture\(\s*(\w+)/g)) {
                referenced.add(m[1]);
            }
            for (const control of ir.controls) {
                if (new RegExp(String.raw`\b${control.name}\s*[)*+,;]`).test(body)) {
                    referenced.add(control.name);
                }
            }
        }

        expect([...referenced].filter(name => !declared.includes(name))).toEqual([]);
        expect(referenced).toContain('uPrevious');
        expect(referenced).toContain('uNoise');
        expect(referenced).toContain('uFeedback');
        expect(referenced).toContain('intensity');
    });

    it('binds each preset to the declared controls', () => {
        const ir = loadBlinkFx(fullManifest as unknown as BlinkFxManifest, 'effects/full.blinkfx');
        const controlNames = new Set(ir.controls.map(c => c.name));

        expect(ir.presets.map(p => p.name)).toEqual(['default', 'intense']);
        for (const preset of ir.presets) {
            const parsed = JSON.parse(readPackageFile(preset.path).toString('utf8')) as {
                name: string;
                values: Record<string, unknown>;
            };
            expect(Object.keys(parsed.values).every(key => controlNames.has(key))).toBe(true);
        }
    });
});
