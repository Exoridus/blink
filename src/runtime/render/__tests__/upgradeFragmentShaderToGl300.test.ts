import { describe, expect, it } from 'vitest';

import { upgradeFragmentShaderToGl300 } from '../upgradeFragmentShaderToGl300';

describe('upgradeFragmentShaderToGl300', () => {
    it('returns sources already declaring #version 300 es unchanged', () => {
        const source = '#version 300 es\nout vec4 fragColor;\nvoid main() { fragColor = vec4(1.0); }';
        expect(upgradeFragmentShaderToGl300(source)).toBe(source);
    });

    it('adds the 300 es header and rewrites gl_FragColor', () => {
        const upgraded = upgradeFragmentShaderToGl300('void main() { gl_FragColor = vec4(1.0); }');
        expect(upgraded).toMatch(/^#version 300 es\nprecision highp float;\nout vec4 fragColor;\n/);
        expect(upgraded).toContain('fragColor = vec4(1.0);');
        expect(upgraded).not.toContain('gl_FragColor');
    });

    it('rewrites texture2D/textureCube calls and varying declarations', () => {
        const upgraded = upgradeFragmentShaderToGl300(
            'varying vec2 v_uv;\nvoid main() { gl_FragColor = texture2D(tex, v_uv) + textureCube(cube, vec3(v_uv, 1.0)); }'
        );
        expect(upgraded).toContain('in vec2 v_uv;');
        expect(upgraded).toContain('texture(tex, v_uv)');
        expect(upgraded).toContain('texture(cube, vec3(v_uv, 1.0))');
    });

    it('strips an existing older #version directive', () => {
        const upgraded = upgradeFragmentShaderToGl300('#version 100\nvoid main() { gl_FragColor = vec4(0.0); }');
        expect(upgraded.match(/#version/g)).toHaveLength(1);
    });

    it('is idempotent', () => {
        const once = upgradeFragmentShaderToGl300('void main() { gl_FragColor = vec4(1.0); }');
        expect(upgradeFragmentShaderToGl300(once)).toBe(once);
    });
});
