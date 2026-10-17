import type { SsfSceneSource } from '../../packages/ssf/convert/convertSsfScene';

export type VisualDiagnostic = 'scene' | 'quadrants' | 'coordinates' | 'spectrum' | 'trail';

/** Distinct RGBA ramps make a channel permutation distinguishable from an X reversal. */
export function diagnosticRamp(width: number): Float32Array {
    const data = new Float32Array(width * 4);
    for (let i = 0; i < width; i++) {
        const x = i / (width - 1);
        data.set([x, 1 - x, 0.25 + x * 0.5, 0.125 + x * 0.25], i * 4);
    }
    return data;
}

export function diagnosticScene(mode: Exclude<VisualDiagnostic, 'scene'>): SsfSceneSource {
    const mainGlsl =
        mode === 'quadrants'
            ? `vec4 renderMain() {
    if (_uv.y < 0.5) return _uv.x < 0.5 ? vec4(1,0,0,1) : vec4(0,1,0,1);
    return _uv.x < 0.5 ? vec4(0,0,1,1) : vec4(1,1,0,1);
  }`
            : mode === 'coordinates'
              ? `vec4 renderMain() {
    vec2 grid = abs(fract(_uv * 16.0) - 0.5);
    float line = 1.0 - step(0.02, min(grid.x, grid.y));
    return vec4(_uv, line, 1.0);
  }`
              : `vec4 renderMain() {
    vec4 value = texture(${mode === 'spectrum' ? 'syn_Spectrum' : 'syn_LevelTrail'}, _uv.x);
    int channel = int(clamp(floor(_uv.y * 4.0), 0.0, 3.0));
    return vec4(vec3(value[channel]), 1.0);
  }`;
    return {
        slug: `diagnostic_${mode}`,
        sceneJson: {
            TITLE: `Visual diagnostic: ${mode}`,
            PASSES: [{ TARGET: 'diagnostic', FLOAT: true, DOUBLE_BUFFER: true }],
        },
        mainGlsl,
        files: new Map(),
    };
}
