import { describe, expect, it } from 'vitest';

import { stripGlslPreamble } from '../stripGlslPreamble';

describe('stripGlslPreamble', () => {
    it('removes #version 300 es directive', () => {
        const result = stripGlslPreamble('#version 300 es\nvoid main() {}');
        expect(result).not.toContain('#version 300 es');
        expect(result).toContain('void main() {}');
    });

    it('removes precision highp float directive', () => {
        const result = stripGlslPreamble('#version 300 es\nprecision highp float;\nvoid main() {}');
        expect(result).not.toContain('precision highp float;');
        expect(result).toContain('void main() {}');
    });

    it('removes out vec4 fragColor declaration', () => {
        const result = stripGlslPreamble(
            '#version 300 es\nprecision highp float;\nout vec4 fragColor;\nvoid main() {}'
        );
        expect(result).not.toContain('out vec4 fragColor;');
        expect(result).toContain('void main() {}');
    });

    it('handles extra whitespace around directives', () => {
        const result = stripGlslPreamble(
            '  #version 300 es  \n  precision highp float;  \n  out vec4 fragColor;  \nvoid main() {}'
        );
        expect(result).not.toContain('#version');
        expect(result).not.toContain('precision');
        expect(result).not.toContain('out vec4');
        expect(result).toContain('void main() {}');
    });

    it('preserves user code after prelude elements', () => {
        const source = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform float myUniform;

float helper(float x) { return x * 2.0; }

void main() {
  fragColor = vec4(helper(myUniform), 0.0, 0.0, 1.0);
}`;
        const result = stripGlslPreamble(source);
        expect(result).not.toContain('#version');
        expect(result).not.toContain('precision');
        expect(result).toContain('uniform float myUniform;');
        expect(result).toContain('float helper(float x)');
        expect(result).toContain('void main()');
        expect(result).toContain('fragColor');
    });

    it('handles source without any prelude elements (passthrough)', () => {
        const source = 'void main() { fragColor = vec4(0.0); }';
        const result = stripGlslPreamble(source);
        expect(result).toBe(source);
    });

    it('handles media precision qualifier', () => {
        const result = stripGlslPreamble(
            '#version 300 es\nprecision mediump float;\nout vec4 fragColor;\nvoid main() {}'
        );
        expect(result).not.toContain('precision mediump float;');
    });

    it('preserves in declarations from legacy upgrades', () => {
        const source = `#version 300 es
precision highp float;
out vec4 fragColor;
in vec2 v_uv;
uniform float TIME;
void main() {
  fragColor = vec4(v_uv, 0.0, 1.0);
}`;
        const result = stripGlslPreamble(source);
        expect(result).toContain('in vec2 v_uv;');
        expect(result).toContain('uniform float TIME;');
        expect(result).toContain('void main()');
    });

    it('returns empty string for empty source', () => {
        expect(stripGlslPreamble('')).toBe('');
    });

    it('returns empty string when source is only prelude elements', () => {
        const result = stripGlslPreamble('#version 300 es\nprecision highp float;\nout vec4 fragColor;\n');
        expect(result.trim()).toBe('');
    });
});
