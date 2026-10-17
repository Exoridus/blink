import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { openPackage } from '../../../../scripts/lib/packageDirectory';
import type { BlinkEffectIR } from '../../../runtime/ir/types';
import { loadBlinkFx } from '../loader';
import type { BlinkFxManifest } from '../manifest';
import { validateBlinkFxManifest } from '../validate';
import { validatePackage } from '../validatePackage';
import { ManifestWriteError, writeBlinkFxManifest } from '../writeManifest';

const EFFECTS = join(process.cwd(), 'public', 'effects');
/** Converted community scenes are previews; the strict native-package checks do not apply to them. */
const isCommunityPreview = (name: string): boolean =>
    (
        JSON.parse(readFileSync(join(EFFECTS, name, 'manifest.json'), 'utf8')) as { license?: string }
    ).license?.startsWith('Third-party preview:') === true;
const packages = existsSync(EFFECTS)
    ? readdirSync(EFFECTS).filter(name => name.endsWith('.blinkfx') && !isCommunityPreview(name))
    : [];

const BASE = 'effects/sample.blinkfx';

function loadFrom(manifest: BlinkFxManifest): BlinkEffectIR {
    return loadBlinkFx(manifest, BASE);
}

describe('native BlinkFX -> IR -> normalized BlinkFX', () => {
    it('finds the catalog', () => {
        expect(packages.length).toBeGreaterThan(0);
    });

    describe.each(packages)('%s', name => {
        it('reloads to an equal IR and reaches a fixed point', async () => {
            const result = await validatePackage(openPackage(join(EFFECTS, name)));
            expect(result.manifest).not.toBeNull();

            const original = loadFrom(result.manifest!);
            const written = writeBlinkFxManifest(original);

            expect(validateBlinkFxManifest(written).valid).toBe(true);
            const reloaded = loadFrom(written);
            expect(reloaded).toEqual(original);
            expect(writeBlinkFxManifest(reloaded)).toEqual(written);
            expect(JSON.parse(JSON.stringify(written))).toEqual(written);
        });
    });

    it('expands shorthand without changing meaning', () => {
        const shorthand: BlinkFxManifest = {
            format: 'blinkfx/1',
            id: 'com.test.shorthand',
            title: 'Shorthand',
            shaders: { glsl: 'main.frag.glsl' },
        };
        const written = writeBlinkFxManifest(loadFrom(shorthand));

        expect(written.shaders).toEqual({ glsl: { main: 'main.frag.glsl' } });
        expect(written.passes).toEqual([{ name: 'main', shader: 'main', inputs: [], target: 'screen', clear: true }]);
        expect(loadFrom(written)).toEqual(loadFrom(shorthand));
    });

    it('keeps size expressions, legacy inputs, custom vertex stages and audio outputs', () => {
        const manifest: BlinkFxManifest = {
            format: 'blinkfx/1',
            id: 'com.test.rich',
            title: 'Rich',
            controls: [{ name: 'half', type: 'float', default: 2, min: 1, max: 4 }],
            shaders: {
                glsl: { a: { fragment: 'a.frag', vertex: 'a.vert' }, b: 'b.frag', sound: { audio: 'sound.frag' } },
            },
            passes: [
                {
                    name: 'one',
                    shader: 'a',
                    target: {
                        name: 'buf',
                        width: '$WIDTH / $half',
                        height: 'max(1, ($HEIGHT - 4) * 2)',
                        format: 'rgba16f',
                        persistent: true,
                    },
                },
                {
                    name: 'two',
                    shader: 'b',
                    inputs: ['buf', { source: 'target.buf.previous', uniform: 'prev' }],
                    target: 'screen',
                    clear: false,
                },
            ],
            outputs: { visual: true, audio: { shader: 'sound', channels: 1, sampleRate: 44100 } },
            requirements: { features: ['float-targets', 'audio-generation'], backends: ['webgl2'] },
            fallbacks: { 'float-targets': 'rgba8' },
            compatibility: {
                source: { format: 'isf', version: '2' },
                profile: 'isf/2',
                mode: 'native',
                converter: 'test',
            },
            diagnostics: { note: { nested: [1, 2] } },
        };
        const original = loadFrom(manifest);
        const written = writeBlinkFxManifest(original);

        expect(loadFrom(written)).toEqual(original);
        expect(writeBlinkFxManifest(loadFrom(written))).toEqual(written);
    });

    it('refuses an effect a manifest cannot express', () => {
        const inline: BlinkEffectIR = {
            ...loadFrom({
                format: 'blinkfx/1',
                id: 'com.test.inline',
                title: 'Inline',
                shaders: { glsl: 'main.frag.glsl' },
            }),
            shaders: {
                glsl: { main: { path: null, source: 'void main() {}', vertex: null, stage: 'visual' } },
                wgsl: {},
            },
        };

        expect(() => writeBlinkFxManifest(inline)).toThrow(ManifestWriteError);
        expect(() => writeBlinkFxManifest({ ...inline, packageRoot: undefined })).toThrow(ManifestWriteError);
    });
});
