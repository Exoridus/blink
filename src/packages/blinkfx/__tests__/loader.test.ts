import { describe, expect, it } from 'vitest';

import { loadBlinkFx } from '../loader';
import type { BlinkFxManifest } from '../manifest';

const BASE_PATH = 'effects/test.blinkfx';

function minimalManifest(): BlinkFxManifest {
    return {
        format: 'blinkfx/1',
        id: 'com.test.minimal',
        title: 'Minimal',
        shaders: { glsl: 'shaders/main.frag.glsl' },
    };
}

function fullManifest(): BlinkFxManifest {
    return {
        format: 'blinkfx/1',
        id: 'com.test.full',
        title: 'Full Effect',
        author: 'Test Author',
        description: 'A test effect.',
        license: 'MIT',
        thumbnail: 'thumb.png',
        tags: ['test', 'demo'],
        controls: [
            {
                name: 'speed',
                label: 'Speed',
                type: 'float',
                default: 0.5,
                min: 0,
                max: 1,
                step: 0.1,
                group: 'Motion',
            },
            {
                name: 'enabled',
                type: 'bool',
                default: true,
            },
            {
                name: 'tint',
                type: 'color',
                default: [1, 0, 0, 1],
            },
            {
                name: 'mode',
                type: 'enum',
                default: 'a',
                options: ['a', 'b', 'c'],
            },
            {
                name: 'offset',
                type: 'point2d',
                default: [0.5, 0.5],
                min: [0, 0],
                max: [1, 1],
            },
            {
                name: 'trigger',
                type: 'bang',
            },
            {
                name: 'count',
                type: 'int',
                default: 3,
                min: 1,
                max: 10,
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
                target: {
                    name: 'feedback',
                    scale: 0.5,
                    format: 'rgba8',
                    persistent: true,
                },
            },
            {
                name: 'main',
                shader: 'main',
                inputs: ['feedback'],
                target: 'screen',
                clear: false,
            },
        ],
        shaders: {
            glsl: {
                feedback: 'shaders/feedback.frag.glsl',
                main: 'shaders/main.frag.glsl',
            },
            wgsl: {
                feedback: 'shaders/feedback.frag.wgsl',
                main: 'shaders/main.frag.wgsl',
            },
        },
        presets: [
            { name: 'default', path: 'presets/default.json' },
            { name: 'fast', path: 'presets/fast.json' },
        ],
        script: {
            entry: 'script.ts',
            events: [{ input: 'trigger', on: 'change', handler: 'onTrigger' }],
        },
    };
}

describe('loadBlinkFx', () => {
    describe('minimal manifest', () => {
        const ir = loadBlinkFx(minimalManifest(), BASE_PATH);

        it('sets format', () => {
            expect(ir.format).toBe('blinkfx-ir/1');
        });

        it('maps metadata', () => {
            expect(ir.metadata.id).toBe('com.test.minimal');
            expect(ir.metadata.title).toBe('Minimal');
            expect(ir.metadata.author).toBeNull();
            expect(ir.metadata.description).toBeNull();
            expect(ir.metadata.license).toBeNull();
            expect(ir.metadata.thumbnail).toBeNull();
            expect(ir.metadata.tags).toEqual([]);
        });

        it('has empty controls, assets, renderTargets, presets', () => {
            expect(ir.controls).toEqual([]);
            expect(ir.assets).toEqual([]);
            expect(ir.renderTargets).toEqual([]);
            expect(ir.presets).toEqual([]);
        });

        it('has null script', () => {
            expect(ir.script).toBeNull();
        });

        it('creates implicit single pass', () => {
            expect(ir.passes).toHaveLength(1);
            const pass = ir.passes[0];
            expect(pass.name).toBe('main');
            expect(pass.shader).toBe('main');
            expect(pass.inputs).toEqual([]);
            expect(pass.target).toEqual({ kind: 'screen' });
            expect(pass.clear).toBe(true);
        });

        it('normalizes string shader shorthand to main key', () => {
            expect(ir.shaders.glsl).toHaveProperty('main');
            expect(ir.shaders.glsl.main.path).toBe('effects/test.blinkfx/shaders/main.frag.glsl');
            expect(ir.shaders.glsl.main.source).toBeNull();
        });

        it('has empty wgsl shader map', () => {
            expect(ir.shaders.wgsl).toEqual({});
        });
    });

    describe('full manifest', () => {
        const ir = loadBlinkFx(fullManifest(), BASE_PATH);

        it('maps metadata with all optional fields', () => {
            expect(ir.metadata.id).toBe('com.test.full');
            expect(ir.metadata.title).toBe('Full Effect');
            expect(ir.metadata.author).toBe('Test Author');
            expect(ir.metadata.description).toBe('A test effect.');
            expect(ir.metadata.license).toBe('MIT');
            expect(ir.metadata.thumbnail).toBe('thumb.png');
            expect(ir.metadata.tags).toEqual(['test', 'demo']);
        });

        it('maps all control types to IR', () => {
            expect(ir.controls).toHaveLength(7);

            const floatCtrl = ir.controls.find(c => c.name === 'speed');
            expect(floatCtrl).toBeDefined();
            if (floatCtrl?.type === 'float') {
                expect(floatCtrl.default).toBe(0.5);
                expect(floatCtrl.min).toBe(0);
                expect(floatCtrl.max).toBe(1);
                expect(floatCtrl.step).toBe(0.1);
                expect(floatCtrl.label).toBe('Speed');
                expect(floatCtrl.group).toBe('Motion');
            }

            const boolCtrl = ir.controls.find(c => c.name === 'enabled');
            expect(boolCtrl).toBeDefined();
            if (boolCtrl?.type === 'bool') {
                expect(boolCtrl.default).toBe(true);
            }

            const colorCtrl = ir.controls.find(c => c.name === 'tint');
            expect(colorCtrl).toBeDefined();
            if (colorCtrl?.type === 'color') {
                expect(colorCtrl.default).toEqual([1, 0, 0, 1]);
            }

            const enumCtrl = ir.controls.find(c => c.name === 'mode');
            expect(enumCtrl).toBeDefined();
            if (enumCtrl?.type === 'enum') {
                expect(enumCtrl.default).toBe('a');
                expect(enumCtrl.options).toEqual(['a', 'b', 'c']);
            }

            const pointCtrl = ir.controls.find(c => c.name === 'offset');
            expect(pointCtrl).toBeDefined();
            if (pointCtrl?.type === 'point2d') {
                expect(pointCtrl.default).toEqual([0.5, 0.5]);
                expect(pointCtrl.min).toEqual([0, 0]);
                expect(pointCtrl.max).toEqual([1, 1]);
            }

            const bangCtrl = ir.controls.find(c => c.name === 'trigger');
            expect(bangCtrl).toBeDefined();
            if (bangCtrl) {
                expect(bangCtrl.type).toBe('bang');
            }

            const intCtrl = ir.controls.find(c => c.name === 'count');
            expect(intCtrl).toBeDefined();
            if (intCtrl?.type === 'int') {
                expect(intCtrl.default).toBe(3);
            }
        });

        it('maps assets with path resolution', () => {
            expect(ir.assets).toHaveLength(1);
            expect(ir.assets[0].name).toBe('noise');
            expect(ir.assets[0].type).toBe('texture2d');
            expect(ir.assets[0].path).toBe('effects/test.blinkfx/assets/noise.png');
            expect(ir.assets[0].sampling.filter).toBe('linear');
            expect(ir.assets[0].sampling.wrap).toBe('repeat');
        });

        it('maps passes with targets', () => {
            expect(ir.passes).toHaveLength(2);

            const feedbackPass = ir.passes.find(p => p.name === 'feedback')!;
            expect(feedbackPass.shader).toBe('feedback');
            expect(feedbackPass.inputs).toEqual([
                { source: { kind: 'target', name: 'feedback', previous: true }, uniform: 'feedback' },
                { source: { kind: 'asset', name: 'noise' }, uniform: 'noise' },
            ]);
            expect(feedbackPass.target).toEqual({ kind: 'renderTarget', name: 'feedback' });
            expect(feedbackPass.clear).toBe(true);

            const mainPass = ir.passes.find(p => p.name === 'main')!;
            expect(mainPass.shader).toBe('main');
            expect(mainPass.inputs).toEqual([
                { source: { kind: 'target', name: 'feedback', previous: false }, uniform: 'feedback' },
            ]);
            expect(mainPass.target).toEqual({ kind: 'screen' });
            expect(mainPass.clear).toBe(false);
        });

        it('extracts render targets from inline target objects', () => {
            expect(ir.renderTargets).toHaveLength(1);
            expect(ir.renderTargets[0].name).toBe('feedback');
            expect(ir.renderTargets[0].scale).toBe(0.5);
            expect(ir.renderTargets[0].format).toBe('rgba8');
            expect(ir.renderTargets[0].persistent).toBe(true);
        });

        it('maps glsl shader records with path resolution', () => {
            expect(ir.shaders.glsl.feedback.path).toBe('effects/test.blinkfx/shaders/feedback.frag.glsl');
            expect(ir.shaders.glsl.feedback.source).toBeNull();
            expect(ir.shaders.glsl.main.path).toBe('effects/test.blinkfx/shaders/main.frag.glsl');
        });

        it('maps wgsl shader records with path resolution', () => {
            expect(ir.shaders.wgsl.feedback.path).toBe('effects/test.blinkfx/shaders/feedback.frag.wgsl');
            expect(ir.shaders.wgsl.main.path).toBe('effects/test.blinkfx/shaders/main.frag.wgsl');
        });

        it('maps presets with path resolution', () => {
            expect(ir.presets).toHaveLength(2);
            expect(ir.presets[0].name).toBe('default');
            expect(ir.presets[0].path).toBe('effects/test.blinkfx/presets/default.json');
            expect(ir.presets[1].name).toBe('fast');
            expect(ir.presets[1].path).toBe('effects/test.blinkfx/presets/fast.json');
        });

        it('maps script spec', () => {
            expect(ir.script).not.toBeNull();
            expect(ir.script!.entry).toBe(`${BASE_PATH}/script.ts`);
            expect(ir.script!.events).toHaveLength(1);
            expect(ir.script!.events[0].input).toBe('trigger');
            expect(ir.script!.events[0].on).toBe('change');
            expect(ir.script!.events[0].handler).toBe('onTrigger');
        });
    });

    describe('shader shorthand', () => {
        it('maps string glsl to main key', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { glsl: 'shaders/s.frag.glsl' },
            };
            const ir = loadBlinkFx(m, 'pkg');
            expect(ir.shaders.glsl).toHaveProperty('main');
            expect(ir.shaders.glsl.main.path).toBe('pkg/shaders/s.frag.glsl');
        });

        it('maps string wgsl to main key', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { wgsl: 'shaders/s.frag.wgsl' },
            };
            const ir = loadBlinkFx(m, 'pkg');
            expect(ir.shaders.wgsl).toHaveProperty('main');
            expect(ir.shaders.wgsl.main.path).toBe('pkg/shaders/s.frag.wgsl');
        });
    });

    describe('pass with screen target', () => {
        it('does not create render target for screen target', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { glsl: 's.frag' },
                passes: [{ name: 'main', shader: 'main', target: 'screen' }],
            };
            const ir = loadBlinkFx(m, 'pkg');
            expect(ir.renderTargets).toHaveLength(0);
            expect(ir.passes[0].target).toEqual({ kind: 'screen' });
        });
    });

    describe('pass without explicit target', () => {
        it('defaults target to screen', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { glsl: 's.frag' },
                passes: [{ name: 'main', shader: 'main' }],
            };
            const ir = loadBlinkFx(m, 'pkg');
            expect(ir.passes[0].target).toEqual({ kind: 'screen' });
        });
    });

    describe('asset sampling defaults', () => {
        it('uses linear filter and clamp wrap when sampling is omitted', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { glsl: 's.frag' },
                assets: [{ name: 'tex', type: 'texture2d', path: 'a.png' }],
            };
            const ir = loadBlinkFx(m, 'pkg');
            expect(ir.assets[0].sampling.filter).toBe('linear');
            expect(ir.assets[0].sampling.wrap).toBe('clamp');
        });
    });

    describe('render target defaults', () => {
        it('uses default values for optional render target fields', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { glsl: 's.frag' },
                passes: [
                    {
                        name: 'rt',
                        shader: 's',
                        target: { name: 'myrt' },
                    },
                ],
            };
            const ir = loadBlinkFx(m, 'pkg');
            const rt = ir.renderTargets[0];
            expect(rt.name).toBe('myrt');
            expect(rt.width).toBeNull();
            expect(rt.height).toBeNull();
            expect(rt.scale).toBeNull();
            expect(rt.format).toBe('rgba8');
            expect(rt.persistent).toBe(false);
        });
    });

    describe('basePath resolution', () => {
        it('appends slash when basePath has no trailing slash', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { glsl: 'shaders/s.frag' },
                assets: [{ name: 't', type: 'texture2d', path: 'assets/a.png' }],
                presets: [{ name: 'd', path: 'presets/d.json' }],
            };
            const ir = loadBlinkFx(m, 'pkg');
            expect(ir.shaders.glsl.main.path).toBe('pkg/shaders/s.frag');
            expect(ir.assets[0].path).toBe('pkg/assets/a.png');
            expect(ir.presets[0].path).toBe('pkg/presets/d.json');
        });

        it('does not double append slash when basePath has trailing slash', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { glsl: 'shaders/s.frag' },
            };
            const ir = loadBlinkFx(m, 'pkg/');
            expect(ir.shaders.glsl.main.path).toBe('pkg/shaders/s.frag');
        });
    });

    describe('pass clear default', () => {
        it('defaults clear to true when not specified', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { glsl: 's.frag' },
                passes: [{ name: 'p', shader: 's', target: 'screen' }],
            };
            const ir = loadBlinkFx(m, 'pkg');
            expect(ir.passes[0].clear).toBe(true);
        });
    });

    describe('duplicate render targets', () => {
        it('deduplicates render targets by name', () => {
            const m: BlinkFxManifest = {
                format: 'blinkfx/1',
                id: 'test',
                title: 'Test',
                shaders: { glsl: 's.frag' },
                passes: [
                    { name: 'a', shader: 'a', target: { name: 'rt1' } },
                    { name: 'b', shader: 'b', target: { name: 'rt1' } },
                    { name: 'c', shader: 'c', target: { name: 'rt2' } },
                ],
            };
            const ir = loadBlinkFx(m, 'pkg');
            expect(ir.renderTargets).toHaveLength(2);
        });
    });

    describe('pass input normalization', () => {
        it('normalizes a legacy bare target name and a legacy .previous suffix', () => {
            const ir = loadBlinkFx(
                {
                    format: 'blinkfx/1',
                    id: 'com.test.legacy',
                    title: 'Legacy',
                    shaders: { glsl: { main: 'shaders/main.frag.glsl' } },
                    passes: [
                        {
                            name: 'sim',
                            shader: 'main',
                            inputs: ['fb.previous'],
                            target: { name: 'fb', persistent: true },
                        },
                        { name: 'present', shader: 'main', inputs: ['fb'], target: 'screen' },
                    ],
                },
                BASE_PATH
            );

            expect(ir.passes[0].inputs).toEqual([
                { source: { kind: 'target', name: 'fb', previous: true }, uniform: 'fb' },
            ]);
            expect(ir.passes[1].inputs).toEqual([
                { source: { kind: 'target', name: 'fb', previous: false }, uniform: 'fb' },
            ]);
        });

        it('normalizes a legacy bare asset name', () => {
            const ir = loadBlinkFx(
                {
                    format: 'blinkfx/1',
                    id: 'com.test.asset',
                    title: 'Asset',
                    shaders: { glsl: 'shaders/main.frag.glsl' },
                    assets: [{ name: 'noise', type: 'texture2d', path: 'assets/noise.png' }],
                    passes: [{ name: 'main', shader: 'main', inputs: ['noise'], target: 'screen' }],
                },
                BASE_PATH
            );

            expect(ir.passes[0].inputs).toEqual([{ source: { kind: 'asset', name: 'noise' }, uniform: 'noise' }]);
        });

        it('keeps the explicit form and its chosen uniform name', () => {
            const ir = loadBlinkFx(
                {
                    format: 'blinkfx/1',
                    id: 'com.test.explicit',
                    title: 'Explicit',
                    shaders: { glsl: 'shaders/main.frag.glsl' },
                    assets: [{ name: 'noise', type: 'texture2d', path: 'assets/noise.png' }],
                    passes: [
                        {
                            name: 'main',
                            shader: 'main',
                            inputs: [
                                { source: 'asset.noise', uniform: 'uNoise' },
                                { source: 'blink.audio.spectrum', uniform: 'uSpectrum' },
                            ],
                            target: 'screen',
                        },
                    ],
                },
                BASE_PATH
            );

            expect(ir.passes[0].inputs).toEqual([
                { source: { kind: 'asset', name: 'noise' }, uniform: 'uNoise' },
                { source: { kind: 'blinkAudio', surface: 'spectrum' }, uniform: 'uSpectrum' },
            ]);
        });

        it('throws with the manifest path when an input cannot be resolved', () => {
            expect(() =>
                loadBlinkFx(
                    {
                        format: 'blinkfx/1',
                        id: 'com.test.bad',
                        title: 'Bad',
                        shaders: { glsl: 'shaders/main.frag.glsl' },
                        passes: [{ name: 'main', shader: 'main', inputs: ['nope'], target: 'screen' }],
                    },
                    BASE_PATH
                )
            ).toThrow('passes[0].inputs[0]');
        });
    });
    describe('R2 additive metadata', () => {
        it('carries the R2 additive metadata into the IR with defaults', () => {
            const ir = loadBlinkFx(
                {
                    format: 'blinkfx/1',
                    id: 'com.test.meta',
                    title: 'Meta',
                    version: '1.2.0',
                    kind: 'filter',
                    shaders: { glsl: 'shaders/main.frag.glsl' },
                    inputs: [{ name: 'sourceImage', type: 'image', required: true }],
                    compatibility: { source: { format: 'isf', version: '2.0' }, profile: 'isf/2', mode: 'preserve' },
                    script: { entry: 'scripts/main.js', abi: 'ssf/1' },
                },
                BASE_PATH
            );

            expect(ir.metadata.version).toBe('1.2.0');
            expect(ir.kind).toBe('filter');
            expect(ir.hostInputs).toEqual([
                { name: 'sourceImage', type: 'image', required: true, samples: null, representation: null },
            ]);
            expect(ir.compatibility?.profile).toBe('isf/2');
            expect(ir.script?.abi).toBe('ssf/1');
        });

        it('defaults kind to generator and the script ABI to blink/1', () => {
            const ir = loadBlinkFx(
                {
                    format: 'blinkfx/1',
                    id: 'com.test.defaults',
                    title: 'Defaults',
                    shaders: { glsl: 'shaders/main.frag.glsl' },
                    script: { entry: 'scripts/main.js' },
                },
                BASE_PATH
            );

            expect(ir.kind).toBe('generator');
            expect(ir.metadata.version).toBeNull();
            expect(ir.script?.abi).toBe('blink/1');
            expect(ir.hostInputs).toEqual([]);
        });

        it('normalizes the compatibility block and leaves it null when absent', () => {
            const withBlock = loadBlinkFx(
                {
                    format: 'blinkfx/1',
                    id: 'com.test.compat',
                    title: 'Compat',
                    shaders: { glsl: 'shaders/main.frag.glsl' },
                    compatibility: { source: { format: 'shadertoy' }, converter: 'blinkfx-cli/1.0.0' },
                },
                BASE_PATH
            );

            expect(withBlock.compatibility).toEqual({
                source: { format: 'shadertoy', version: null },
                profile: null,
                mode: null,
                converter: 'blinkfx-cli/1.0.0',
                controls: {},
                scriptUniforms: {},
            });
            expect(loadBlinkFx(minimalManifest(), BASE_PATH).compatibility).toBeNull();
        });

        it('carries the tooling diagnostics block as opaque key/value entries', () => {
            const ir = loadBlinkFx(
                {
                    format: 'blinkfx/1',
                    id: 'com.test.diag',
                    title: 'Diag',
                    shaders: { glsl: 'shaders/main.frag.glsl' },
                    diagnostics: { sourceWarnings: ['dropped VSN key'], fixtureId: 'isf-042' },
                },
                BASE_PATH
            );

            expect(ir.diagnostics).toEqual([
                { key: 'sourceWarnings', value: ['dropped VSN key'] },
                { key: 'fixtureId', value: 'isf-042' },
            ]);
            expect(loadBlinkFx(minimalManifest(), BASE_PATH).diagnostics).toEqual([]);
        });

        it('normalizes optional host-input fields to explicit nulls and defaults', () => {
            const ir = loadBlinkFx(
                {
                    format: 'blinkfx/1',
                    id: 'com.test.inputs',
                    title: 'Inputs',
                    shaders: { glsl: 'shaders/main.frag.glsl' },
                    inputs: [
                        { name: 'mic', type: 'audio' },
                        { name: 'fft', type: 'audioTexture', samples: 512, representation: 'spectrum-waveform' },
                    ],
                },
                BASE_PATH
            );

            expect(ir.hostInputs).toEqual([
                { name: 'mic', type: 'audio', required: false, samples: null, representation: null },
                {
                    name: 'fft',
                    type: 'audioTexture',
                    required: false,
                    samples: 512,
                    representation: 'spectrum-waveform',
                },
            ]);
        });
    });
});

describe('loadBlinkFx - outputs, requirements, fallbacks', () => {
    it('defaults to a visual-only effect with no declared requirements or fallbacks', () => {
        const ir = loadBlinkFx(minimalManifest(), BASE_PATH);

        expect(ir.outputs).toEqual({ visual: true, audio: null });
        expect(ir.requirements).toEqual({ features: [], backends: [] });
        expect(ir.fallbacks).toEqual({});
    });

    it('carries declared requirements and fallbacks into the IR', () => {
        const ir = loadBlinkFx(
            {
                ...minimalManifest(),
                requirements: { features: ['float-targets'], backends: ['webgl2'] },
                fallbacks: { 'float-targets': 'rgba8' },
            },
            BASE_PATH
        );

        expect(ir.requirements).toEqual({ features: ['float-targets'], backends: ['webgl2'] });
        expect(ir.fallbacks).toEqual({ 'float-targets': 'rgba8' });
    });

    it('fills the audio output defaults the spec gives it', () => {
        const ir = loadBlinkFx(
            { ...minimalManifest(), outputs: { visual: false, audio: { shader: 'sound' } } },
            BASE_PATH
        );

        expect(ir.outputs.audio).toEqual({
            shader: 'sound',
            abi: 'blink-audio/1',
            channels: 2,
            sampleRate: 'device',
        });
    });

    // An audio-only package must not acquire a screen pass it never declared.
    it('suppresses the implicit main pass when the effect declares no visual output', () => {
        const ir = loadBlinkFx(
            { ...minimalManifest(), outputs: { visual: false, audio: { shader: 'sound' } } },
            BASE_PATH
        );

        expect(ir.passes).toEqual([]);
    });

    it('still builds the implicit main pass for a package that says nothing about outputs', () => {
        expect(loadBlinkFx(minimalManifest(), BASE_PATH).passes).toHaveLength(1);
    });
});

describe('render target sizing', () => {
    it('parses size expression strings into the IR and keeps numbers as numbers', () => {
        const manifest: BlinkFxManifest = {
            ...minimalManifest(),
            shaders: { glsl: { main: 'shaders/main.frag.glsl' } },
            passes: [
                { name: 'a', shader: 'main', target: { name: 'half', width: '$WIDTH / 2', height: 64 } },
                { name: 'b', shader: 'main', inputs: ['half'], target: 'screen' },
            ],
        };

        const [half] = loadBlinkFx(manifest, BASE_PATH).renderTargets;

        expect(half.height).toBe(64);
        expect(half.width).toEqual({
            kind: 'binary',
            op: '/',
            left: { kind: 'variable', name: 'WIDTH' },
            right: { kind: 'number', value: 2 },
        });
    });
});

describe('shader descriptors', () => {
    it('normalizes strings and descriptors into entries with stage and optional vertex', () => {
        const manifest: BlinkFxManifest = {
            ...minimalManifest(),
            shaders: {
                glsl: {
                    plain: 'shaders/plain.frag',
                    custom: { fragment: 'shaders/c.frag', vertex: 'shaders/c.vert' },
                    sound: { audio: 'shaders/snd.glsl' },
                },
                wgsl: { plain: 'shaders/plain.wgsl' },
            },
        };

        const { glsl, wgsl } = loadBlinkFx(manifest, BASE_PATH).shaders;

        expect(glsl.plain).toEqual({
            path: `${BASE_PATH}/shaders/plain.frag`,
            source: null,
            vertex: null,
            stage: 'visual',
        });
        expect(glsl.custom).toEqual({
            path: `${BASE_PATH}/shaders/c.frag`,
            source: null,
            vertex: { path: `${BASE_PATH}/shaders/c.vert`, source: null },
            stage: 'visual',
        });
        expect(glsl.sound).toEqual({
            path: `${BASE_PATH}/shaders/snd.glsl`,
            source: null,
            vertex: null,
            stage: 'audio',
        });
        expect(wgsl.plain).toEqual({
            path: `${BASE_PATH}/shaders/plain.wgsl`,
            source: null,
            vertex: null,
            stage: 'visual',
        });
    });

    it('records the package root so shader includes can be confined to it', () => {
        expect(loadBlinkFx(minimalManifest(), BASE_PATH).packageRoot).toBe(BASE_PATH);
    });
});

describe('resource sampling', () => {
    it('carries optional host and target samplers into the common IR', () => {
        const ir = loadBlinkFx(
            {
                ...minimalManifest(),
                inputs: [{ name: 'media', type: 'image', sampling: { filter: 'nearest', wrap: 'mirror' } }],
                passes: [
                    {
                        name: 'main',
                        shader: 'main',
                        target: { name: 'buffer', sampling: { filter: 'linear', wrap: 'repeat' } },
                    },
                ],
            },
            BASE_PATH
        );
        expect(ir.hostInputs[0].sampling).toEqual({ filter: 'nearest', wrap: 'mirror' });
        expect(ir.renderTargets[0].sampling).toEqual({ filter: 'linear', wrap: 'repeat' });
        const legacy = loadBlinkFx(
            {
                ...minimalManifest(),
                inputs: [{ name: 'media', type: 'image' }],
                passes: [{ name: 'main', shader: 'main', target: { name: 'buffer' } }],
            },
            BASE_PATH
        );
        expect(legacy.hostInputs[0].sampling).toBeUndefined();
        expect(legacy.renderTargets[0].sampling).toBeUndefined();
    });
});
