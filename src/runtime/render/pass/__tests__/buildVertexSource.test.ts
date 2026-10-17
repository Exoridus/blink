import { describe, expect, it } from 'vitest';

import type { BlinkControlSpec } from '../../../ir/types';
import { buildVertexSource } from '../buildVertexSource';

const zoom: BlinkControlSpec = {
    name: 'zoom',
    type: 'float',
    label: null,
    description: null,
    group: null,
    default: 1,
    min: null,
    max: null,
    step: null,
};
const tap: BlinkControlSpec = { name: 'tap', type: 'bang', label: null, description: null, group: null };

const BODY =
    'out vec2 v_uv;\nvoid main() {\n  v_uv = a_position;\n  gl_Position = vec4(a_position * zoom, 0.0, 1.0);\n}\n';

describe('buildVertexSource', () => {
    it('starts with the GLSL ES 3.00 header and matches the fragment stage precision', () => {
        const source = buildVertexSource(BODY, []);
        expect(source.startsWith('#version 300 es\nprecision highp float;\nprecision mediump int;\n')).toBe(true);
    });

    it('declares the frame uniforms, pass index, attributes and controls ahead of the body', () => {
        const source = buildVertexSource(BODY, [zoom, tap]);
        for (const declaration of [
            'uniform float bl_time;',
            'uniform float bl_deltaTime;',
            'uniform int bl_frame;',
            'uniform vec2 bl_resolution;',
            'uniform int bl_pass;',
            'layout(location = 0) in vec2 a_position;',
            'layout(location = 1) in vec2 a_texcoord;',
            'layout(location = 2) in vec4 a_color;',
            'uniform float zoom;',
        ]) {
            expect(source).toContain(declaration);
        }
        expect(source).not.toContain('tap');
        expect(source.indexOf('uniform float zoom;')).toBeLessThan(source.indexOf('void main()'));
    });

    it('does not repeat the fragment-only declarations', () => {
        const source = buildVertexSource(BODY, []);
        expect(source).not.toContain('fragColor');
        expect(source).not.toContain('au_level');
    });

    it('drops a version line and float precision statement the author wrote', () => {
        const source = buildVertexSource(
            '#version 300 es\nprecision highp float;\nvoid main() { gl_Position = vec4(0.0); }\n',
            []
        );
        expect(source.match(/#version/g)).toHaveLength(1);
        expect(source.match(/precision highp float;/g)).toHaveLength(1);
    });

    it('rejects a vertex shader written for another GLSL version', () => {
        expect(() => buildVertexSource('#version 100\nvoid main() {}', [])).toThrow(/GLSL ES 3\.00/);
        expect(() => buildVertexSource('#version 330 core\nvoid main() {}', [])).toThrow(/GLSL ES 3\.00/);
    });
});
