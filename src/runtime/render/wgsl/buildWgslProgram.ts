import type { BlinkControlSpec } from '../../ir/types';
import { mapControlSpecs } from '../controlUniformMapper';

/**
 * The value a host uniform has in WGSL, read from its slot: the engine packs every uniform of a
 * material into one 16-byte slot of floats, in the order the material was declared, so an integer
 * is a float in `x` and a bool is 0 or 1.
 */
interface Accessor {
    readonly name: string;
    readonly returns: string;
    readonly read: string;
}

const FLOAT = (name: string): Accessor => ({ name, returns: 'f32', read: `blink.${name}.x` });
const INT = (name: string): Accessor => ({ name, returns: 'i32', read: `i32(blink.${name}.x)` });
const VEC2 = (name: string): Accessor => ({ name, returns: 'vec2<f32>', read: `blink.${name}.xy` });

const FRAME_ACCESSORS: readonly Accessor[] = [
    FLOAT('bl_time'),
    FLOAT('bl_deltaTime'),
    INT('bl_frame'),
    VEC2('bl_resolution'),
    INT('bl_pass'),
    VEC2('bl_pointerPosition'),
    VEC2('bl_pointerPressOrigin'),
    FLOAT('bl_pointerDown'),
    FLOAT('bl_pointerActive'),
];

const AUDIO_NAMES = [
    'au_level',
    'au_rms',
    'au_bass',
    'au_mid',
    'au_midHigh',
    'au_high',
    'au_onset',
    'au_hit',
    'au_bassHit',
    'au_midHit',
    'au_midHighHit',
    'au_highHit',
    'au_presence',
    'au_bassPresence',
    'au_midPresence',
    'au_midHighPresence',
    'au_highPresence',
    'au_pulse',
    'au_beatPulse',
    'au_barPulse',
    'au_beatPhase',
    'au_bpm',
    'au_bpmConfidence',
] as const;

function controlAccessor(control: BlinkControlSpec): Accessor | null {
    switch (control.type) {
        case 'float':
            return FLOAT(control.name);
        case 'int':
        case 'enum':
            return INT(control.name);
        case 'bool':
            return { name: control.name, returns: 'bool', read: `(blink.${control.name}.x != 0.0)` };
        case 'color':
            return { name: control.name, returns: 'vec4<f32>', read: `blink.${control.name}` };
        case 'point2d':
            return VEC2(control.name);
        case 'bang':
            return null;
    }
}

export interface WgslTexture {
    readonly name: string;
    /** Whether a pass of the effect rendered the texture; WebGPU stores such a texture upside down relative to GL. */
    readonly renderTarget: boolean;
}

export interface WgslProgramInputs {
    /** Every scalar uniform of the pass's material, in the order its schema declares them. */
    readonly uniformNames: readonly string[];
    /** The pass's textures in the order the material binds them. */
    readonly textures: readonly WgslTexture[];
    readonly controls: readonly BlinkControlSpec[];
    /** The package's WGSL: its `fragmentMain`, and anything it needs besides. */
    readonly source: string;
}

/** The binding of the user group (`@group(2)`) the packed uniform buffer takes; textures follow it. */
const UNIFORM_BINDING = 0;

/**
 * Wraps a package's WGSL fragment program with what the runtime guarantees, so that the package
 * writes one `@fragment fn fragmentMain(in: BlinkVarying)` and nothing else it does not want to:
 *
 * - `BlinkVarying`: the fullscreen quad's interpolants, `position` (the `@builtin(position)`) and `uv`;
 * - `vertexMain`: the fullscreen vertex stage;
 * - an accessor function per host uniform and per control (`bl_time()`, `bl_resolution()`, `au_bass()`,
 *   and `name()` for a control `name`), typed as the GLSL uniform of the same name is;
 * - `bl_fragCoord(in)`: the fragment's position in output pixels with a bottom-left origin, as
 *   `gl_FragCoord` has, which `@builtin(position)` does not;
 * - one `texture_2d<f32>` named after each input of the pass, `<name>_sampler` beside it, and
 *   `<name>_uv(uv)`, which turns a coordinate with a bottom-left origin into the one that texture is
 *   sampled with, so that `textureSample(buf, buf_sampler, buf_uv(uv))` reads what GLSL's
 *   `texture(buf, uv)` does. A render target has its first row at the bottom in GL and at the top
 *   in WebGPU, so its coordinate is flipped; an uploaded image or data texture has its first row at
 *   coordinate 0 in both, so its coordinate is not.
 *
 * The uniform struct lists every uniform the material declares, in the material's own order,
 * because the engine's packed layout is positional: a slot out of place reads another uniform.
 */
export function buildWgslProgram(inputs: WgslProgramInputs): string {
    const fields = inputs.uniformNames.map(name => `  ${name}: vec4<f32>,`).join('\n');
    const known = new Set(inputs.uniformNames);
    const accessors = [
        ...FRAME_ACCESSORS,
        ...AUDIO_NAMES.map(FLOAT),
        ...mapControlSpecs(inputs.controls).flatMap(entry => {
            const control = inputs.controls.find(candidate => candidate.name === entry.name);
            const accessor = control === undefined ? null : controlAccessor(control);
            return accessor === null ? [] : [accessor];
        }),
    ].filter(accessor => known.has(accessor.name));

    const functions = accessors
        .map(accessor => `fn ${accessor.name}() -> ${accessor.returns} { return ${accessor.read}; }`)
        .join('\n');
    const textures = inputs.textures
        .map(({ name, renderTarget }, index) => {
            const binding = UNIFORM_BINDING + 1 + index * 2;
            const coordinate = renderTarget ? 'vec2<f32>(uv.x, 1.0 - uv.y)' : 'uv';
            return [
                `@group(2) @binding(${binding}) var ${name}: texture_2d<f32>;`,
                `@group(2) @binding(${binding + 1}) var ${name}_sampler: sampler;`,
                `fn ${name}_uv(uv: vec2<f32>) -> vec2<f32> { return ${coordinate}; }`,
            ].join('\n');
        })
        .join('\n');

    return `struct BlinkUniforms {
${fields}
};
@group(2) @binding(${UNIFORM_BINDING}) var<uniform> blink: BlinkUniforms;
${textures}

struct BlinkVertexInput {
  @location(0) position: vec2<f32>,
  @location(1) texcoord: vec2<f32>,
  @location(2) color: vec4<f32>,
};

struct BlinkVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vertexMain(input: BlinkVertexInput) -> BlinkVarying {
  var out: BlinkVarying;
  out.position = vec4<f32>(input.position, 0.0, 1.0);
  out.uv = input.position * 0.5 + vec2<f32>(0.5, 0.5);
  return out;
}

${functions}

fn bl_fragCoord(in: BlinkVarying) -> vec2<f32> {
  return vec2<f32>(in.position.x, bl_resolution().y - in.position.y);
}

${inputs.source}
`;
}
