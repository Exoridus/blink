import { describe, expect, it } from 'vitest';

import { readSsfScene } from '../../../../../scripts/lib/ssfDirectory';
import { convertSsfScene } from '../../convert/convertSsfScene';
import type { SsfUniformValue } from '../../script/SsfScriptRuntime';
import { SsfScriptRuntime } from '../../script/SsfScriptRuntime';
import { privateCorpusPath } from './corpusPaths';

describe('unchanged workshop object uniforms', () => {
    it.each([
        ['circle_lesson_live_2', 'circle1'],
        ['mouse_demo_mask_1', 'lastmouse'],
    ])('preserves vec2 shader declarations and publication for %s', (slug, name) => {
        const source = readSsfScene(
            privateCorpusPath('synesthesia', 'workshop', 'fixtures', 'Other Scene Templates', `${slug}.synScene`)
        );
        const converted = convertSsfScene(source);
        const declared = converted.manifest.compatibility?.scriptUniforms;
        const names =
            slug === 'circle_lesson_live_2' ? Array.from({ length: 10 }, (_, index) => `circle${index + 1}`) : [name];
        for (const output of names) {
            expect(declared?.[output]).toBe('vec2');
            expect(converted.files.get('shaders/main.frag.glsl')).toContain(`uniform vec2 ${output};`);
        }
        expect(converted.files.get('script.js')).toBe(source.scriptJs);
        const runtime = new SsfScriptRuntime({
            source: source.scriptJs!,
            nativeLifecycle: true,
            controls: [],
            surface: {
                get: (): number => 0,
                set: (): void => {
                    throw new Error('Workshop scripts must not mutate controls');
                },
            },
            declaredUniforms: declared,
        });
        const values = new Map<string, SsfUniformValue>([
            ['_click', new Float32Array([1, 0, 0])],
            ['_muvc', new Float32Array([0.25, -0.5])],
        ]);
        try {
            runtime.init(values);
            expect(runtime.step({ dt: 1 / 60, values }).ok).toBe(true);
            const published = runtime.uniforms()[name];
            expect(published).toBeInstanceOf(Float32Array);
            const components = [...(published as Float32Array)];
            expect(components).toHaveLength(2);
            const scale = slug === 'circle_lesson_live_2' ? 0.01 : 1;
            expect(components[0]).toBeCloseTo(0.25 * scale);
            expect(components[1]).toBeCloseTo(-0.5 * scale);
        } finally {
            runtime.dispose();
        }
    });
});
