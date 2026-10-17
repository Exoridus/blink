import { describe, expect, it } from 'vitest';

import type { BlinkEffectIR, BlinkFallbackStrategy, BlinkFeature, BlinkRenderTargetSpec } from '../../ir/types';
import { type BackendCapabilities, describeCapabilityFailures, resolveCapabilities } from '../resolveCapabilities';

function effect(overrides: Partial<BlinkEffectIR> = {}): BlinkEffectIR {
    return {
        format: 'blinkfx-ir/1',
        metadata: {
            id: 'com.test.fx',
            title: 'FX',
            version: null,
            author: null,
            description: null,
            license: null,
            thumbnail: null,
            tags: [],
        },
        kind: 'generator',
        controls: [],
        hostInputs: [],
        assets: [],
        renderTargets: [],
        passes: [],
        shaders: { glsl: {}, wgsl: {} },
        presets: [],
        script: null,
        outputs: { visual: true, audio: null },
        requirements: { features: [], backends: [] },
        fallbacks: {},
        compatibility: null,
        diagnostics: [],
        ...overrides,
    };
}

function target(overrides: Partial<BlinkRenderTargetSpec> = {}): BlinkRenderTargetSpec {
    return {
        name: 'feedback',
        width: null,
        height: null,
        scale: null,
        format: 'rgba8',
        persistent: false,
        ...overrides,
    } as BlinkRenderTargetSpec;
}

function backend(features: BlinkFeature[] = [], name: 'webgl2' | 'webgpu' = 'webgl2'): BackendCapabilities {
    return { backend: name, features: new Set(features) };
}

const statusOf = (resolution: ReturnType<typeof resolveCapabilities>, feature: BlinkFeature): string | undefined =>
    resolution.outcomes.find(o => o.feature === feature)?.status;

describe('resolveCapabilities', () => {
    it('reports a declared feature the backend has as available', () => {
        const resolution = resolveCapabilities(
            effect({ requirements: { features: ['float-targets'], backends: [] } }),
            backend(['float-targets'])
        );

        expect(statusOf(resolution, 'float-targets')).toBe('available');
        expect(resolution.failures).toEqual([]);
    });

    it('fails a required feature the backend lacks when no fallback permits otherwise', () => {
        const resolution = resolveCapabilities(
            effect({ requirements: { features: ['float-targets'], backends: [] } }),
            backend()
        );

        expect(statusOf(resolution, 'float-targets')).toBe('failed');
        expect(resolution.failures).toHaveLength(1);
        expect(resolution.failures[0].reason).toContain('permits no fallback');
    });

    // The spec's strict inferred set: a package that never declares float-targets but asks for an
    // rgba32f target still needs them.
    it('infers float targets from a float render target the package never declared', () => {
        const resolution = resolveCapabilities(effect({ renderTargets: [target({ format: 'rgba32f' })] }), backend());

        expect(statusOf(resolution, 'float-targets')).toBe('failed');
        expect(resolution.outcomes.find(o => o.feature === 'float-targets')?.source).toBe('inferred');
    });

    it('infers dynamic target size from a size expression but not from fixed or scaled targets', () => {
        const dynamic = resolveCapabilities(
            effect({ renderTargets: [target({ width: { kind: 'variable', name: 'WIDTH' } })] }),
            backend()
        );
        expect(statusOf(dynamic, 'dynamic-target-size')).toBe('failed');
        expect(dynamic.outcomes.find(o => o.feature === 'dynamic-target-size')?.source).toBe('inferred');

        const fixed = resolveCapabilities(
            effect({ renderTargets: [target({ width: 64, height: 64 }), target({ name: 'half', scale: 0.5 })] }),
            backend()
        );
        expect(statusOf(fixed, 'dynamic-target-size')).toBeUndefined();
    });

    it('infers persistent feedback from a persistent target', () => {
        const resolution = resolveCapabilities(
            effect({ renderTargets: [target({ persistent: true })] }),
            backend(['persistent-feedback'])
        );

        expect(statusOf(resolution, 'persistent-feedback')).toBe('available');
    });

    it('infers the script ABI as a feature so an unrunnable script fails the load', () => {
        const resolution = resolveCapabilities(
            effect({ script: { entry: 'scripts/main.js', abi: 'ssf/1', events: [] } }),
            backend(['script:blink/1'])
        );

        expect(statusOf(resolution, 'script:ssf/1' as BlinkFeature)).toBe('failed');
    });

    it('accepts the script shorthand fallback for either ABI', () => {
        const resolution = resolveCapabilities(
            effect({
                script: { entry: 'scripts/main.js', abi: 'blink/1', events: [] },
                fallbacks: { script: 'disable' } as Record<string, BlinkFallbackStrategy>,
            }),
            backend()
        );

        expect(statusOf(resolution, 'script:blink/1' as BlinkFeature)).toBe('disabled');
        expect(resolution.disabled.has('script:blink/1' as BlinkFeature)).toBe(true);
        expect(resolution.failures).toEqual([]);
    });

    it('permits the rgba8 downgrade only when the package declared it', () => {
        const withFallback = resolveCapabilities(
            effect({
                renderTargets: [target({ format: 'rgba16f' })],
                fallbacks: { 'float-targets': 'rgba8' },
            }),
            backend()
        );
        const withoutFallback = resolveCapabilities(
            effect({ renderTargets: [target({ format: 'rgba16f' })] }),
            backend()
        );

        expect(withFallback.allowFloatDowngrade).toBe(true);
        expect(withFallback.failures).toEqual([]);
        expect(withoutFallback.allowFloatDowngrade).toBe(false);
        expect(withoutFallback.failures).toHaveLength(1);
    });

    // rgba8 answers a render-target question. Letting it satisfy anything else would grant a
    // degradation the package never described.
    it('rejects an rgba8 fallback declared for a feature that is not a render target format', () => {
        const resolution = resolveCapabilities(
            effect({
                requirements: { features: ['pointer-input'], backends: [] },
                fallbacks: { 'pointer-input': 'rgba8' },
            }),
            backend()
        );

        expect(statusOf(resolution, 'pointer-input')).toBe('failed');
        expect(resolution.failures[0].reason).toContain('render target formats only');
    });

    it('treats an approximate fallback as a downgrade rather than a failure', () => {
        const resolution = resolveCapabilities(
            effect({
                requirements: { features: ['audio-spectrum'], backends: [] },
                fallbacks: { 'audio-spectrum': 'approximate' },
            }),
            backend()
        );

        expect(statusOf(resolution, 'audio-spectrum')).toBe('downgraded');
        expect(resolution.failures).toEqual([]);
    });

    it('fails a package that requires a backend other than the active one', () => {
        const resolution = resolveCapabilities(
            effect({ requirements: { features: [], backends: ['webgpu'] } }),
            backend([], 'webgl2')
        );

        expect(resolution.failures).toHaveLength(1);
        expect(resolution.failures[0].reason).toContain('the active backend is "webgl2"');
    });

    it('requires nothing from a package that uses nothing', () => {
        const resolution = resolveCapabilities(effect(), backend());

        expect(resolution.outcomes).toEqual([]);
        expect(resolution.failures).toEqual([]);
    });

    it('names every unmet requirement in the failure message', () => {
        const resolution = resolveCapabilities(
            effect({ requirements: { features: ['float-targets', 'pointer-input'], backends: [] } }),
            backend()
        );

        const message = describeCapabilityFailures(resolution, 'com.test.fx');

        expect(message).toContain('com.test.fx');
        expect(message).toContain('float-targets');
        expect(message).toContain('pointer-input');
    });
});

describe('resolveCapabilities - fallbacks that cannot apply', () => {
    // Accepting these would pass the cheap pre-fetch check and then throw inside the render
    // target pool, after the shaders and assets had been fetched.
    it.each(['disable', 'approximate'] as const)(
        'fails a float target whose only declared fallback is "%s"',
        strategy => {
            const resolution = resolveCapabilities(
                effect({
                    renderTargets: [target({ format: 'rgba16f' })],
                    fallbacks: { 'float-targets': strategy },
                }),
                backend()
            );

            expect(resolution.failures).toHaveLength(1);
            expect(resolution.allowFloatDowngrade).toBe(false);
        }
    );
});

describe('resolveCapabilities - inference from pass inputs', () => {
    const passWithAudio = (surface: 'spectrum' | 'levelTrail'): BlinkEffectIR['passes'] =>
        [
            {
                name: 'main',
                shader: 'main',
                target: 'screen',
                inputs: [{ source: { kind: 'blinkAudio', surface }, uniform: 'audioTex' }],
            },
        ] as unknown as BlinkEffectIR['passes'];

    // A package that binds an audio surface needs it whether or not it says so, or it would load
    // on a runtime without one and quietly sample nothing.
    it('infers the audio spectrum surface a pass binds', () => {
        const resolution = resolveCapabilities(effect({ passes: passWithAudio('spectrum') }), backend());

        expect(statusOf(resolution, 'audio-spectrum')).toBe('failed');
    });

    it('infers the level trail surface a pass binds', () => {
        const resolution = resolveCapabilities(effect({ passes: passWithAudio('levelTrail') }), backend());

        expect(statusOf(resolution, 'audio-level-trail')).toBe('failed');
    });
});

describe('resolveCapabilities - shader coverage per backend', () => {
    const entry = (stage: 'visual' | 'audio' = 'visual') => ({ path: 'x', source: null, vertex: null, stage });
    const pass = (name: string, shader = 'main') => ({
        name,
        shader,
        inputs: [],
        target: { kind: 'screen' as const },
        clear: true,
    });

    it('runs a package whose passes all have a glsl program on webgl2', () => {
        const resolution = resolveCapabilities(
            effect({ passes: [pass('p')], shaders: { glsl: { main: entry() }, wgsl: {} } }),
            backend()
        );
        expect(resolution.failures).toEqual([]);
    });

    it('fails a wgsl-only package on webgl2 and names the missing program', () => {
        const resolution = resolveCapabilities(
            effect({ passes: [pass('p')], shaders: { glsl: {}, wgsl: { main: entry() } } }),
            backend()
        );
        expect(resolution.failures).toHaveLength(1);
        expect(resolution.failures[0].feature).toBe('backend');
        expect(resolution.failures[0].reason).toMatch(/"p".*glsl.*webgl2/);
    });

    it('selects wgsl programs on webgpu and fails a glsl-only package there', () => {
        const wgslOnly = effect({ passes: [pass('p')], shaders: { glsl: {}, wgsl: { main: entry() } } });
        expect(resolveCapabilities(wgslOnly, backend([], 'webgpu')).failures).toEqual([]);

        const glslOnly = effect({ passes: [pass('p')], shaders: { glsl: { main: entry() }, wgsl: {} } });
        expect(resolveCapabilities(glslOnly, backend([], 'webgpu')).failures[0].reason).toMatch(/wgsl/);
    });

    it('allows a pass key to exist for one backend only as long as the running backend covers every pass', () => {
        const mixed = effect({
            passes: [pass('a', 'one'), pass('b', 'two')],
            shaders: { glsl: { one: entry(), two: entry() }, wgsl: { one: entry() } },
        });
        expect(resolveCapabilities(mixed, backend()).failures).toEqual([]);
        expect(resolveCapabilities(mixed, backend([], 'webgpu')).failures[0].reason).toContain('"b"');
    });

    it('does not run an audio-stage program as a visual pass', () => {
        const resolution = resolveCapabilities(
            effect({ passes: [pass('p', 'snd')], shaders: { glsl: { snd: entry('audio') }, wgsl: {} } }),
            backend()
        );
        expect(resolution.failures).toHaveLength(1);
    });
});
