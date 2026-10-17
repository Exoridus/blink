import { describe, expect, it } from 'vitest';

import { validateBlinkFxManifest } from '../validate';

function validMinimalManifest() {
    return {
        format: 'blinkfx/1',
        id: 'com.codexo.plasma',
        title: 'Plasma',
        shaders: { glsl: 'shaders/main.frag.glsl' },
    };
}

function validFullManifest() {
    return {
        format: 'blinkfx/1',
        id: 'com.codexo.hypercoil',
        title: 'Hypercoil',
        author: 'DIMA',
        description: 'Audio-reactive recursive tunnel.',
        license: 'MIT',
        thumbnail: 'thumbnail.webp',
        tags: ['tunnel', 'feedback'],
        controls: [
            {
                name: 'intensity',
                label: 'Intensity',
                type: 'float',
                default: 0.7,
                min: 0,
                max: 1,
                step: 0.01,
                group: 'Motion',
            },
            {
                name: 'palette',
                label: 'Palette',
                type: 'enum',
                default: 'aurora',
                options: ['aurora', 'inferno', 'mono'],
                group: 'Color',
            },
        ],
        assets: [
            {
                name: 'noise',
                type: 'texture2d',
                path: 'assets/noise.png',
                sampling: { filter: 'linear', wrap: 'repeat' },
            },
        ],
        passes: [
            {
                name: 'feedback',
                shader: 'feedback',
                inputs: ['feedback.previous', 'noise'],
                target: { name: 'feedback', scale: 0.5, format: 'rgba8', persistent: true },
            },
            {
                name: 'main',
                shader: 'main',
                inputs: ['feedback'],
                target: 'screen',
            },
        ],
        shaders: {
            glsl: { feedback: 'shaders/feedback.frag.glsl', main: 'shaders/main.frag.glsl' },
            wgsl: { feedback: 'shaders/feedback.frag.wgsl', main: 'shaders/main.frag.wgsl' },
        },
        presets: [
            { name: 'default', path: 'presets/default.json' },
            { name: 'intense', path: 'presets/intense.json' },
        ],
        script: {
            entry: 'script.ts',
            events: [{ input: 'palette', on: 'change', handler: 'onPaletteChange' }],
        },
    };
}

describe('validateBlinkFxManifest', () => {
    it('accepts a valid minimal manifest', () => {
        const result = validateBlinkFxManifest(validMinimalManifest());
        expect(result).toEqual({ valid: true });
    });

    it('accepts a valid full manifest', () => {
        const result = validateBlinkFxManifest(validFullManifest());
        expect(result).toEqual({ valid: true });
    });

    it('rejects non-object input', () => {
        const result = validateBlinkFxManifest(null);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('manifest: must be an object');
        }
    });

    it('rejects missing format', () => {
        const m = validMinimalManifest();
        delete (m as Record<string, unknown>).format;
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('format: must be "blinkfx/1"');
        }
    });

    it('rejects wrong format', () => {
        const m = { ...validMinimalManifest(), format: 'blinkfx/2' };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('format: must be "blinkfx/1"');
        }
    });

    it('rejects missing id', () => {
        const m = validMinimalManifest();
        delete (m as Record<string, unknown>).id;
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('id: must be a non-empty string');
        }
    });

    it('rejects empty id', () => {
        const m = { ...validMinimalManifest(), id: '' };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('id: must be a non-empty string');
        }
    });

    it('rejects missing title', () => {
        const m = validMinimalManifest();
        delete (m as Record<string, unknown>).title;
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('title: must be a non-empty string');
        }
    });

    it('rejects empty title', () => {
        const m = { ...validMinimalManifest(), title: '' };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('title: must be a non-empty string');
        }
    });

    it('rejects missing shaders', () => {
        const m = validMinimalManifest();
        delete (m as Record<string, unknown>).shaders;
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('shaders: must be an object');
        }
    });

    it('rejects shaders with neither glsl nor wgsl', () => {
        const m = { ...validMinimalManifest(), shaders: {} };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('shaders: must contain at least one of "glsl" or "wgsl"');
        }
    });

    it('rejects shaders.glsl as non-string non-record', () => {
        const m = { ...validMinimalManifest(), shaders: { glsl: 42 } };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.startsWith('shaders.glsl:'))).toBe(true);
        }
    });

    it('rejects invalid control type', () => {
        const m = {
            ...validMinimalManifest(),
            controls: [{ name: 'foo', type: 'unknown', default: 0 }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('type:'))).toBe(true);
        }
    });

    it('rejects float control with missing default', () => {
        const m = {
            ...validMinimalManifest(),
            controls: [{ name: 'foo', type: 'float' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('default:'))).toBe(true);
        }
    });

    it('rejects bool control with non-boolean default', () => {
        const m = {
            ...validMinimalManifest(),
            controls: [{ name: 'foo', type: 'bool', default: 42 }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('default:'))).toBe(true);
        }
    });

    it('rejects enum control with missing options', () => {
        const m = {
            ...validMinimalManifest(),
            controls: [{ name: 'foo', type: 'enum', default: 'bar' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('options:'))).toBe(true);
        }
    });

    it('rejects color control with wrong default shape', () => {
        const m = {
            ...validMinimalManifest(),
            controls: [{ name: 'foo', type: 'color', default: [1, 2, 3] }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('default:'))).toBe(true);
        }
    });

    it('rejects point2d control with wrong default shape', () => {
        const m = {
            ...validMinimalManifest(),
            controls: [{ name: 'foo', type: 'point2d', default: [1] }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('default:'))).toBe(true);
        }
    });

    it('rejects asset with wrong type', () => {
        const m = {
            ...validMinimalManifest(),
            assets: [{ name: 'img', type: 'texture3d', path: 'a.png' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('type:'))).toBe(true);
        }
    });

    it('rejects asset with missing path', () => {
        const m = {
            ...validMinimalManifest(),
            assets: [{ name: 'img', type: 'texture2d' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('path:'))).toBe(true);
        }
    });

    it('rejects pass with missing name', () => {
        const m = {
            ...validMinimalManifest(),
            passes: [{ shader: 'main' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('name:'))).toBe(true);
        }
    });

    it('rejects pass with missing shader', () => {
        const m = {
            ...validMinimalManifest(),
            passes: [{ name: 'main' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('shader:'))).toBe(true);
        }
    });

    it('rejects preset with missing name', () => {
        const m = {
            ...validMinimalManifest(),
            presets: [{ path: 'p.json' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('name:'))).toBe(true);
        }
    });

    it('rejects preset with missing path', () => {
        const m = {
            ...validMinimalManifest(),
            presets: [{ name: 'default' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('path:'))).toBe(true);
        }
    });

    it('rejects script with missing entry', () => {
        const m = {
            ...validMinimalManifest(),
            script: { events: [] },
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('entry:'))).toBe(true);
        }
    });

    it('rejects invalid script event binding', () => {
        const m = {
            ...validMinimalManifest(),
            script: {
                entry: 'script.ts',
                events: [{ input: 'x', on: 'invalid', handler: 'h' }],
            },
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('on:'))).toBe(true);
        }
    });

    it('rejects tags that are not a string array', () => {
        const m = {
            ...validMinimalManifest(),
            tags: [1, 2, 3],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('tags:'))).toBe(true);
        }
    });

    it('rejects wrong type for optional string fields', () => {
        const m = {
            ...validMinimalManifest(),
            author: 42,
            description: true,
            license: [],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toHaveLength(3);
        }
    });

    it('accepts manifest with only wgsl shaders', () => {
        const m = {
            format: 'blinkfx/1',
            id: 'test',
            title: 'Test',
            shaders: { wgsl: 'shaders/main.frag.wgsl' },
        };
        const result = validateBlinkFxManifest(m);
        expect(result).toEqual({ valid: true });
    });

    it('accepts manifest with both glsl and wgsl', () => {
        const m = {
            format: 'blinkfx/1',
            id: 'test',
            title: 'Test',
            shaders: {
                glsl: 'shaders/main.frag.glsl',
                wgsl: 'shaders/main.frag.wgsl',
            },
        };
        const result = validateBlinkFxManifest(m);
        expect(result).toEqual({ valid: true });
    });

    it('accepts int control', () => {
        const m = {
            ...validMinimalManifest(),
            controls: [{ name: 'steps', type: 'int', default: 5 }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result).toEqual({ valid: true });
    });

    it('accepts point2d control', () => {
        const m = {
            ...validMinimalManifest(),
            controls: [{ name: 'center', type: 'point2d', default: [0.5, 0.5] }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result).toEqual({ valid: true });
    });

    it('accepts bang control', () => {
        const m = {
            ...validMinimalManifest(),
            controls: [{ name: 'reset', type: 'bang' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result).toEqual({ valid: true });
    });

    it('accepts script without events', () => {
        const m = {
            ...validMinimalManifest(),
            script: { entry: 'script.ts' },
        };
        const result = validateBlinkFxManifest(m);
        expect(result).toEqual({ valid: true });
    });

    it('rejects script events that are not an array', () => {
        const m = {
            ...validMinimalManifest(),
            script: { entry: 'script.ts', events: 'not-an-array' },
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('events:'))).toBe(true);
        }
    });

    it('rejects pass with non-boolean clear', () => {
        const m = {
            ...validMinimalManifest(),
            passes: [{ name: 'main', shader: 'main', clear: 'yes' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('clear:'))).toBe(true);
        }
    });

    it('rejects pass with non-string inputs', () => {
        const m = {
            ...validMinimalManifest(),
            passes: [{ name: 'main', shader: 'main', inputs: [1, 2, 3] }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('inputs['))).toBe(true);
        }
    });

    it('accepts pass with explicit source/uniform input form', () => {
        const m = {
            ...validMinimalManifest(),
            assets: [{ name: 'noise', type: 'texture2d', path: 'assets/noise.png' }],
            passes: [
                {
                    name: 'main',
                    shader: 'main',
                    inputs: [{ source: 'asset.noise', uniform: 'uTex' }],
                    target: 'screen',
                },
            ],
        };
        const result = validateBlinkFxManifest(m);
        expect(result).toEqual({ valid: true });
    });

    it('rejects explicit input object missing source', () => {
        const m = {
            ...validMinimalManifest(),
            passes: [{ name: 'main', shader: 'main', inputs: [{ uniform: 'uTex' }] }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('inputs[0].source:'))).toBe(true);
        }
    });

    it('rejects explicit input object missing uniform', () => {
        const m = {
            ...validMinimalManifest(),
            passes: [{ name: 'main', shader: 'main', inputs: [{ source: 'asset.noise' }] }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('inputs[0].uniform:'))).toBe(true);
        }
    });

    it('accepts manifest with valid host inputs', () => {
        const m = {
            ...validMinimalManifest(),
            inputs: [
                { name: 'mic', type: 'audio' },
                { name: 'fft', type: 'audioTexture', samples: 512, representation: 'spectrum-waveform' },
            ],
        };
        const result = validateBlinkFxManifest(m);
        expect(result).toEqual({ valid: true });
    });

    it('rejects host input with missing name', () => {
        const m = {
            ...validMinimalManifest(),
            inputs: [{ type: 'audio' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('inputs[0].name:'))).toBe(true);
        }
    });

    it('rejects host input with duplicate name', () => {
        const m = {
            ...validMinimalManifest(),
            inputs: [
                { name: 'mic', type: 'audio' },
                { name: 'mic', type: 'audioFFT' },
            ],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('inputs[1].name: "mic" is already used');
        }
    });

    it('rejects host input with invalid type', () => {
        const m = {
            ...validMinimalManifest(),
            inputs: [{ name: 'mic', type: 'unknown' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('inputs[0].type:'))).toBe(true);
        }
    });

    it('rejects host input with non-integer samples', () => {
        const m = {
            ...validMinimalManifest(),
            inputs: [{ name: 'fft', type: 'audioFFT', samples: 1.5 }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('inputs[0].samples:'))).toBe(true);
        }
    });

    it('rejects host input representation on a non-audioTexture type', () => {
        const m = {
            ...validMinimalManifest(),
            inputs: [{ name: 'fft', type: 'audioFFT', representation: 'spectrum-waveform' }],
        };
        const result = validateBlinkFxManifest(m);
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.includes('inputs[0].representation:'))).toBe(true);
        }
    });
    it('accepts the R2 additive metadata fields', () => {
        const m = {
            ...validMinimalManifest(),
            version: '1.2.0',
            kind: 'transition',
            compatibility: {
                source: { format: 'isf', version: '2.0' },
                profile: 'isf/2',
                mode: 'preserve',
                converter: 'blinkfx-cli/1.0.0',
            },
            diagnostics: { sourceWarnings: ['dropped VSN key'] },
            script: { entry: 'scripts/main.js', abi: 'ssf/1' },
        };
        expect(validateBlinkFxManifest(m)).toEqual({ valid: true });
    });

    it('rejects a non-string version', () => {
        const result = validateBlinkFxManifest({ ...validMinimalManifest(), version: 2 });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.startsWith('version:'))).toBe(true);
        }
    });

    it('rejects an unknown kind', () => {
        const result = validateBlinkFxManifest({ ...validMinimalManifest(), kind: 'overlay' });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.startsWith('kind:'))).toBe(true);
        }
    });

    it('rejects a compatibility source without a format', () => {
        const result = validateBlinkFxManifest({
            ...validMinimalManifest(),
            compatibility: { source: { version: '2.0' } },
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('compatibility.source.format: must be a non-empty string');
        }
    });

    it('rejects an unknown compatibility mode', () => {
        const result = validateBlinkFxManifest({
            ...validMinimalManifest(),
            compatibility: { mode: 'rewrite' },
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors.some(e => e.startsWith('compatibility.mode:'))).toBe(true);
        }
    });

    it('rejects a diagnostics block that is not an object', () => {
        const result = validateBlinkFxManifest({ ...validMinimalManifest(), diagnostics: ['note'] });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('diagnostics: must be an object');
        }
    });

    it('rejects an empty script ABI', () => {
        const result = validateBlinkFxManifest({
            ...validMinimalManifest(),
            script: { entry: 'scripts/main.js', abi: '' },
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('script.abi: must be a non-empty string');
        }
    });

    it('still accepts a manifest carrying none of the R2 additive fields', () => {
        expect(validateBlinkFxManifest(validMinimalManifest())).toEqual({ valid: true });
    });

    it('ignores unknown top-level fields for additive forward compatibility', () => {
        const m = { ...validMinimalManifest(), somethingFuture: 42 };
        expect(validateBlinkFxManifest(m)).toEqual({ valid: true });
    });
});

describe('validateBlinkFxManifest - outputs, requirements, fallbacks', () => {
    const errorsOf = (manifest: unknown): string[] => {
        const result = validateBlinkFxManifest(manifest);
        return result.valid ? [] : result.errors;
    };

    it('accepts the documented shapes', () => {
        const m = {
            ...validMinimalManifest(),
            outputs: {
                visual: false,
                audio: { shader: 'main', abi: 'blink-audio/1', channels: 2, sampleRate: 'device' },
            },
            requirements: { features: ['float-targets', 'script:blink/1'], backends: ['webgl2', 'webgpu'] },
            fallbacks: { 'float-targets': 'rgba8', script: 'fail' },
        };
        expect(validateBlinkFxManifest(m)).toEqual({ valid: true });
    });

    it('rejects a non-boolean outputs.visual', () => {
        const m = { ...validMinimalManifest(), outputs: { visual: 'yes' } };
        expect(errorsOf(m)).toContain('outputs.visual: must be a boolean');
    });

    it('rejects an audio output without a shader', () => {
        const m = { ...validMinimalManifest(), outputs: { audio: { channels: 2 } } };
        expect(errorsOf(m)).toContain('outputs.audio.shader: must be a non-empty string');
    });

    it('rejects a fractional channel count', () => {
        const m = { ...validMinimalManifest(), outputs: { audio: { shader: 'sound', channels: 1.5 } } };
        expect(errorsOf(m)).toContain('outputs.audio.channels: must be a positive integer');
    });

    // A misspelled identifier would otherwise be checked against nothing, and the package would
    // load as though it had required nothing at all.
    it('rejects an unknown feature identifier instead of ignoring it', () => {
        const m = { ...validMinimalManifest(), requirements: { features: ['float-target'] } };
        expect(errorsOf(m)).toContain('requirements.features: unknown feature "float-target"');
    });

    it('rejects an unknown backend', () => {
        const m = { ...validMinimalManifest(), requirements: { backends: ['vulkan'] } };
        expect(errorsOf(m)).toContain('requirements.backends: unknown backend "vulkan"');
    });

    it('rejects an unknown fallback strategy', () => {
        const m = { ...validMinimalManifest(), fallbacks: { 'float-targets': 'downgrade' } };
        expect(errorsOf(m)).toContain('fallbacks.float-targets: must be one of fail, disable, rgba8, approximate');
    });

    it('rejects a fallback keyed by an unknown feature', () => {
        const m = { ...validMinimalManifest(), fallbacks: { 'flat-targets': 'rgba8' } };
        expect(errorsOf(m)).toContain('fallbacks: unknown feature "flat-targets"');
    });
});

describe('validateBlinkFxManifest - package containment', () => {
    const errorsOf = (manifest: unknown): string[] => {
        const result = validateBlinkFxManifest(manifest);
        return result.valid ? [] : result.errors;
    };

    // The runtime hands these paths to the module loader and to fetch, so a traversing one reaches
    // outside the package exactly as an asset path would.
    it('rejects a script entry that escapes the package root', () => {
        const m = { ...validMinimalManifest(), script: { entry: '../../evil.js' } };
        expect(errorsOf(m)).toContain('script.entry: "../../evil.js" escapes the package root');
    });

    it('rejects a preset path that escapes the package root', () => {
        const m = { ...validMinimalManifest(), presets: [{ name: 'x', path: '../secrets.json' }] };
        expect(errorsOf(m)).toContain('presets[0].path: "../secrets.json" escapes the package root');
    });

    it('rejects an audio output naming a shader the package does not declare', () => {
        const m = { ...validMinimalManifest(), outputs: { audio: { shader: 'sound' } } };
        expect(errorsOf(m)).toContain('outputs.audio.shader: "sound" is not declared in shaders.glsl or shaders.wgsl');
    });
});

describe('render target sizing', () => {
    function errorsOf(result: ReturnType<typeof validateBlinkFxManifest>): string {
        return result.valid ? '' : result.errors.join('\n');
    }

    function withTarget(target: Record<string, unknown>) {
        return {
            ...validMinimalManifest(),
            passes: [
                { name: 'sim', shader: 'main', target: { name: 'buf', ...target } },
                { name: 'out', shader: 'main', inputs: ['buf'], target: 'screen' },
            ],
            shaders: { glsl: { main: 'shaders/main.frag.glsl' } },
        };
    }

    it('accepts numbers, size expressions and scale', () => {
        expect(validateBlinkFxManifest(withTarget({ width: 64, height: 64 })).valid).toBe(true);
        expect(validateBlinkFxManifest(withTarget({ width: '$WIDTH / 2', height: 'max(1, $HEIGHT / 2)' })).valid).toBe(
            true
        );
        expect(validateBlinkFxManifest(withTarget({ scale: 0.5 })).valid).toBe(true);
        expect(validateBlinkFxManifest(withTarget({ width: 128 })).valid).toBe(true);
    });

    it('rejects a malformed size expression with the parser reason', () => {
        const result = validateBlinkFxManifest(withTarget({ width: '$WIDTH +', height: 64 }));
        expect(result.valid).toBe(false);
        expect(errorsOf(result)).toMatch(/passes\[0\]\.target\.width: invalid size expression/);
    });

    it('rejects expressions outside the language', () => {
        for (const width of ['window.innerWidth', 'foo(2)', '1; 2', 'a = 3']) {
            expect(validateBlinkFxManifest(withTarget({ width })).valid, width).toBe(false);
        }
    });

    it('rejects non-positive and non-finite numeric sizes and scales', () => {
        for (const bad of [
            { width: 0 },
            { height: -4 },
            { width: Number.NaN },
            { scale: 0 },
            { scale: -1 },
            { width: true },
        ]) {
            expect(validateBlinkFxManifest(withTarget(bad)).valid, JSON.stringify(bad)).toBe(false);
        }
    });

    it('rejects scale combined with width or height', () => {
        const result = validateBlinkFxManifest(withTarget({ scale: 0.5, width: 64 }));
        expect(result.valid).toBe(false);
        expect(errorsOf(result)).toMatch(/scale.*width|width.*scale/);
    });

    it('rejects an unknown format and a non-boolean persistent flag', () => {
        expect(validateBlinkFxManifest(withTarget({ format: 'rgb565' })).valid).toBe(false);
        expect(validateBlinkFxManifest(withTarget({ persistent: 'yes' })).valid).toBe(false);
        expect(validateBlinkFxManifest(withTarget({ format: 'rgba16f', persistent: true })).valid).toBe(true);
    });
});

describe('shader descriptors', () => {
    const withShaders = (shaders: unknown) => ({ ...validMinimalManifest(), shaders });
    const errorsOf = (shaders: unknown): string => {
        const result = validateBlinkFxManifest(withShaders(shaders));
        return result.valid ? '' : result.errors.join('\n');
    };

    it('accepts fragment-only, fragment plus vertex, and audio descriptors', () => {
        expect(validateBlinkFxManifest(withShaders({ glsl: { main: { fragment: 'a.frag' } } })).valid).toBe(true);
        expect(
            validateBlinkFxManifest(withShaders({ glsl: { main: { fragment: 'a.frag', vertex: 'a.vert' } } })).valid
        ).toBe(true);
        expect(
            validateBlinkFxManifest(withShaders({ glsl: { main: 'a.frag', sound: { audio: 'snd.glsl' } } })).valid
        ).toBe(true);
        expect(validateBlinkFxManifest(withShaders({ glsl: { main: 'a.frag' }, wgsl: { main: 'a.wgsl' } })).valid).toBe(
            true
        );
    });

    it('rejects a descriptor with no stage, an unknown key, or a mix of audio and visual stages', () => {
        expect(errorsOf({ glsl: { main: {} } })).toContain('shaders.glsl.main');
        expect(errorsOf({ glsl: { main: { fragment: 'a', geometry: 'g' } } })).toContain('unknown key "geometry"');
        expect(errorsOf({ glsl: { main: { audio: 'a', fragment: 'f' } } })).toContain('shaders.glsl.main');
        expect(errorsOf({ glsl: { main: { vertex: 'v' } } })).toContain('shaders.glsl.main.fragment');
    });

    it('rejects non-string stage paths', () => {
        expect(errorsOf({ glsl: { main: { fragment: 3 } } })).toContain('shaders.glsl.main.fragment');
        expect(errorsOf({ glsl: { main: { fragment: 'a', vertex: '' } } })).toContain('shaders.glsl.main.vertex');
    });

    it('keeps wgsl entries plain strings', () => {
        expect(errorsOf({ wgsl: { main: { fragment: 'a.wgsl' } } })).toContain('shaders.wgsl');
    });
});

describe('resource sampling validation', () => {
    it.each(['assets', 'inputs', 'passes'])('rejects invalid sampling on %s', resource => {
        const manifest = {
            ...validMinimalManifest(),
            assets: [{ name: 'image', type: 'texture2d', path: 'image.png', sampling: { filter: 'bad', wrap: 'bad' } }],
            inputs: [{ name: 'media', type: 'image', sampling: { filter: 'bad', wrap: 'bad' } }],
            passes: [
                { name: 'main', shader: 'main', target: { name: 'buffer', sampling: { filter: 'bad', wrap: 'bad' } } },
            ],
        };
        for (const key of ['assets', 'inputs', 'passes'] as const)
            if (key !== resource) delete (manifest as Partial<typeof manifest>)[key];
        const result = validateBlinkFxManifest(manifest);
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors.join(' ')).toMatch(/sampling.*filter.*sampling.*wrap/);
    });

    it('rejects image sampling metadata on an audio input', () => {
        const result = validateBlinkFxManifest({
            ...validMinimalManifest(),
            inputs: [{ name: 'wave', type: 'audio', sampling: { filter: 'linear' } }],
        });
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.errors.join(' ')).toContain('only permitted when type is "image"');
    });
});
