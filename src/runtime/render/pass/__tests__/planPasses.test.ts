import { describe, expect, it } from 'vitest';

import type { BlinkSourceRef } from '../../../ir/sourceRef';
import type { BlinkEffectIR, BlinkPassInputSpec, BlinkPassSpec, BlinkRenderTargetSpec } from '../../../ir/types';
import { planPasses } from '../planPasses';

function effect(passes: BlinkPassSpec[], renderTargets: BlinkRenderTargetSpec[]): BlinkEffectIR {
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
        renderTargets,
        passes,
        shaders: { glsl: {}, wgsl: {} },
        presets: [],
        outputs: { visual: true, audio: null },
        requirements: { features: [], backends: [] },
        fallbacks: {},
        script: null,
        compatibility: null,
        diagnostics: [],
    };
}

const RT = (name: string, persistent: boolean): BlinkRenderTargetSpec => ({
    name,
    width: null,
    height: null,
    scale: 1,
    format: 'rgba8',
    persistent,
});

const target = (name: string, previous = false): BlinkSourceRef => ({ kind: 'target', name, previous });
const input = (source: BlinkSourceRef, uniform: string): BlinkPassInputSpec => ({ source, uniform });

describe('planPasses', () => {
    it('plans a single screen pass with a sequential passIndex', () => {
        const plan = planPasses(
            effect([{ name: 'main', shader: 'main', inputs: [], target: { kind: 'screen' }, clear: true }], [])
        );
        expect(plan.passes).toHaveLength(1);
        expect(plan.passes[0].passIndex).toBe(0);
        expect(plan.passes[0].inputs).toEqual([]);
    });

    it('treats a pass reading its own target as a previous-frame read', () => {
        const plan = planPasses(
            effect(
                [
                    {
                        name: 'sim',
                        shader: 'main',
                        inputs: [input(target('fb'), 'fb')],
                        target: { kind: 'renderTarget', name: 'fb' },
                        clear: false,
                    },
                    {
                        name: 'present',
                        shader: 'main',
                        inputs: [input(target('fb'), 'fb')],
                        target: { kind: 'screen' },
                        clear: true,
                    },
                ],
                [RT('fb', true)]
            )
        );
        expect(plan.passes[0].inputs[0].source).toEqual({ kind: 'target', name: 'fb', previous: true });
        expect(plan.passes[1].inputs[0].source).toEqual({ kind: 'target', name: 'fb', previous: false });
        expect(plan.passes.map(p => p.passIndex)).toEqual([0, 1]);
    });

    it('passes through an explicit previous reference to another target', () => {
        const plan = planPasses(
            effect(
                [
                    {
                        name: 'a',
                        shader: 'main',
                        inputs: [input({ kind: 'target', name: 'fb', previous: true }, 'uPrev')],
                        target: { kind: 'screen' },
                        clear: true,
                    },
                ],
                [RT('fb', true)]
            )
        );
        expect(plan.passes[0].inputs[0]).toEqual({
            uniform: 'uPrev',
            source: { kind: 'target', name: 'fb', previous: true },
        });
    });

    it('passes asset and audio sources through untouched', () => {
        const plan = planPasses(
            effect(
                [
                    {
                        name: 'main',
                        shader: 'main',
                        inputs: [
                            input({ kind: 'asset', name: 'noise' }, 'uNoise'),
                            input({ kind: 'blinkAudio', surface: 'spectrum' }, 'uSpectrum'),
                        ],
                        target: { kind: 'screen' },
                        clear: true,
                    },
                ],
                []
            )
        );
        expect(plan.passes[0].inputs).toEqual([
            { uniform: 'uNoise', source: { kind: 'asset', name: 'noise' } },
            { uniform: 'uSpectrum', source: { kind: 'blinkAudio', surface: 'spectrum' } },
        ]);
    });

    it('throws when a target input names an undeclared target', () => {
        expect(() =>
            planPasses(
                effect(
                    [
                        {
                            name: 'main',
                            shader: 'main',
                            inputs: [input(target('nope'), 'nope')],
                            target: { kind: 'screen' },
                            clear: true,
                        },
                    ],
                    []
                )
            )
        ).toThrow('target.nope');
    });
});
