import { describe, expect, it } from 'vitest';

import type { CapabilityResolution } from '../../capability/resolveCapabilities';
import type { BlinkEffectIR } from '../../ir/types';
import { buildCompatibilityReport } from '../CompatibilityReport';

function effect(overrides: Partial<BlinkEffectIR> = {}): BlinkEffectIR {
    return {
        format: 'blinkfx-ir/1',
        metadata: {
            id: 'com.test.fx',
            title: 'Fx',
            version: null,
            author: null,
            description: null,
            license: null,
            tags: [],
            thumbnail: null,
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

const resolution = (outcomes: CapabilityResolution['outcomes']): CapabilityResolution => ({
    outcomes,
    failures: [],
    disabled: new Set(),
    allowFloatDowngrade: false,
});

describe('buildCompatibilityReport', () => {
    it('reports a native effect as native with nothing to caveat', () => {
        const report = buildCompatibilityReport(effect(), resolution([]));

        expect(report).toMatchObject({
            effectId: 'com.test.fx',
            level: 'native',
            source: null,
            profile: null,
            features: [],
            notes: [],
        });
    });

    it('reports a converted effect with its provenance, capability outcomes and the profile caveats', () => {
        const report = buildCompatibilityReport(
            effect({
                compatibility: {
                    source: { format: 'ssf', version: '1' },
                    profile: 'ssf/1',
                    mode: 'preserve',
                    converter: 'blinkfx-ssf-converter/1',
                    controls: {},
                    scriptUniforms: {},
                },
            }),
            resolution([
                { feature: 'script:ssf/1', status: 'available', source: 'declared', strategy: null, reason: null },
            ])
        );

        expect(report).toMatchObject({
            level: 'compatible',
            source: { format: 'ssf', version: '1' },
            profile: 'ssf/1',
            mode: 'preserve',
            converter: 'blinkfx-ssf-converter/1',
            features: [{ feature: 'script:ssf/1', status: 'available', declared: true, strategy: null }],
        });
        expect(report.notes.join(' ')).toMatch(/numerical parity/);
    });

    it('marks a converted effect degraded when a capability was switched off or downgraded', () => {
        const converted = effect({
            compatibility: {
                source: { format: 'isf', version: '2.0' },
                profile: 'isf/2',
                mode: 'preserve',
                converter: null,
                controls: {},
                scriptUniforms: {},
            },
        });

        const downgraded = buildCompatibilityReport(
            converted,
            resolution([
                { feature: 'float-targets', status: 'downgraded', source: 'inferred', strategy: 'rgba8', reason: null },
            ])
        );
        expect(downgraded.level).toBe('degraded');
        expect(downgraded.features[0]).toMatchObject({ declared: false, strategy: 'rgba8' });
    });

    it('carries the package diagnostics as notes', () => {
        const report = buildCompatibilityReport(
            effect({ diagnostics: [{ key: 'shadertoy', value: { id: 'abc' } }] }),
            null
        );
        expect(report.notes).toEqual(['shadertoy: {"id":"abc"}']);
    });
});
