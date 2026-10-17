import { describe, expect, it } from 'vitest';

import { convertSsfScene } from '../convert/convertSsfScene';
import { scanScriptUniforms } from '../convert/scriptUniforms';
import type { SsfUniformValue } from '../script/SsfScriptRuntime';
import { SsfScriptRuntime } from '../script/SsfScriptRuntime';

describe('SSF script uniform shapes', () => {
    it.each([
        ['setUniform("out", 1)', 'float'],
        ['setUniform("out", 1, Math.sin(2), 3)', 'vec3'],
        ['setUniform("out", [Math.max(1, 2), 3])', 'vec2'],
        ['uniforms.out = [1, 2, 3, 4];', 'vec4'],
        ['uniforms["out"] = [1, 2];', 'vec2'],
        ['setUniform("out", { x: 1, y: 2, goal_x: 9, lasty: 9 })', 'vec2'],
        ['const color = { r: 1, g: 2, b: 3, a: 4 }; uniforms.out = color;', 'vec4'],
        ['function Point() { this.x = 1; this.y = 2; } var p = new Point(); setUniform("out", p)', 'vec2'],
        ['function Point() { this.x = 1; this.y = 2; } p = new Point; uniforms.out = p;', 'vec2'],
        [
            'function Point() { const options = { size: 2 }; this.x = 1; this.y = 2; } const p = new Point; setUniform("out", p)',
            'vec2',
        ],
        ['uniforms.out =\n [1, 2];', 'vec2'],
        ['setUniform("out", /* source coordinates */ { x: 1, g: 2, b: 3 })', 'vec3'],
        ['setUniform("out", { x: 1, y: 2, z: 3 }, 4)', 'vec3'],
    ])('infers the published shape in %s', (source, expected) => {
        expect(scanScriptUniforms(source).named.get('out')).toBe(expected);
    });

    it('ignores setter examples in comments and strings', () => {
        const scan = scanScriptUniforms(
            '// setUniform("commented", 1, 2)\nconst text = "uniforms.stringValue = [1,2]"; setUniform("out", 1);'
        );
        expect([...scan.named]).toEqual([['out', 'float']]);
    });

    it('reports an unproven dynamic value while retaining a scalar fallback', () => {
        const scan = scanScriptUniforms('setUniform("out", makeValue());');
        expect(scan.named.get('out')).toBe('float');
        expect([...scan.unresolved]).toEqual(['out']);
    });

    it('reports spread arrays instead of counting a spread as one coordinate', () => {
        const scan = scanScriptUniforms('setUniform("out", [...getCoordinates()]);');
        expect([...scan.unresolved]).toEqual(['out']);
    });

    it('reports constructor fields assigned conditionally as an unproven shape', () => {
        const scan = scanScriptUniforms(
            'function Point() { this.x = 1; if (enabled) { this.y = 2; } } const p = new Point; setUniform("out", p);'
        );
        expect([...scan.unresolved]).toEqual(['out']);
    });

    it('preserves the widest observed write and dynamic name prefixes', () => {
        const scan = scanScriptUniforms('uniforms.out = [1, 2, 3]; setUniform("out", 1); uniforms["band_" + i] = 1;');
        expect(scan.named.get('out')).toBe('vec3');
        expect([...scan.prefixes]).toEqual(['band_']);
    });

    it('retains literal names selected from a name array', () => {
        const scan = scanScriptUniforms('const names = ["left", "right"]; setUniform(names[i], [1, 2]);');
        expect([...scan.named]).toEqual([
            ['left', 'vec2'],
            ['right', 'vec2'],
        ]);
    });
});

describe('synthetic object uniform conversion and publication', () => {
    it.each([1, 0.01])('publishes pointer coordinates at scale %s', scale => {
        const scriptJs = `function Coordinate() { this.x = 0; this.y = 0; }
var coordinate = new Coordinate();
function update() {
  coordinate.x = _muvc.x * ${scale};
  coordinate.y = _muvc.y * ${scale};
  setUniform('coordinate', coordinate);
}`;
        const source = {
            slug: 'synthetic_pointer',
            sceneJson: { TITLE: 'Synthetic pointer' },
            mainGlsl: 'vec4 renderMain() { return vec4(coordinate, 0.0, 1.0); }',
            scriptJs,
            files: new Map(),
        };
        const converted = convertSsfScene(source);
        const declared = converted.manifest.compatibility?.scriptUniforms;
        expect(declared?.coordinate).toBe('vec2');
        expect(converted.files.get('shaders/main.frag.glsl')).toContain('uniform vec2 coordinate;');
        expect(converted.files.get('script.js')).toBe(scriptJs);
        const runtime = new SsfScriptRuntime({
            source: scriptJs,
            nativeLifecycle: true,
            controls: [],
            surface: {
                get: (): number => 0,
                set: (): never => {
                    throw new Error('Unexpected control mutation');
                },
            },
            declaredUniforms: declared,
        });
        const values = new Map<string, SsfUniformValue>([['_muvc', new Float32Array([0.25, -0.5])]]);
        try {
            runtime.init(values);
            expect(runtime.step({ dt: 1 / 60, values }).ok).toBe(true);
            const published = runtime.uniforms().coordinate;
            expect(published).toBeInstanceOf(Float32Array);
            expect([...(published as Float32Array)]).toHaveLength(2);
            expect((published as Float32Array)[0]).toBeCloseTo(0.25 * scale);
            expect((published as Float32Array)[1]).toBeCloseTo(-0.5 * scale);
        } finally {
            runtime.dispose();
        }
    });
});
