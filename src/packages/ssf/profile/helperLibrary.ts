import { SSF_NATIVE_IMAGE_HELPERS } from './nativeImageHelpers';
import { SSF_NATIVE_MATH_HELPERS } from './nativeMathHelpers';

/**
 * Usage-driven GLSL ES 3.00 blocks implementing Synesthesia 1.25.2 helper arithmetic.
 * Desktop numeric promotions are explicit; native formulas, overloads and edge behavior are
 * preserved. Media sampling still requires host-provided raw and processed texture views.
 */

export interface HelperBlock {
    /** Function names this block defines; a scene that defines one itself suppresses the block. */
    readonly provides: readonly string[];
    /** Other blocks, by their first `provides` name, this one calls. */
    readonly requires?: readonly string[];
    /** Sampler uniforms the block reads, which the converter must bind as pass inputs. */
    readonly samplers?: readonly string[];
    /** Recovered native arithmetic, independent of host texture or audio producer fidelity. */
    readonly nativeArithmetic?: boolean;
    readonly code: string;
}

export const SSF_HELPER_BLOCKS: readonly HelperBlock[] = [...SSF_NATIVE_MATH_HELPERS, ...SSF_NATIVE_IMAGE_HELPERS];

/**
 * Built-in globals every scene may read. They are assigned at the top of `main()` because a
 * non-constant initializer is not legal at global scope in GLSL ES 3.00.
 */
export const SSF_CORE_PRELUDE = `#define PI 3.14159265358979
uniform vec2 RENDERSIZE;
#define TIME bl_time
#define TIMEDELTA bl_deltaTime
#define FRAMECOUNT float(bl_frame)
#define PASSINDEX bl_pass

vec2 _xy;
vec2 _uv;
vec2 _uvc;
vec4 _mouse;
vec3 _click;
vec2 _muv;
vec2 _muvc;

const float _Media_Scale = 1.0;
const float _Media_Contrast = 1.0;
const float _Media_Invert = 0.0;
const float _Invert_Media = 0.0;
const float _Fit_or_Fill = 0.0;
const float _Hor_Flip = 0.0;
const float _Vert_Flip = 0.0;
const float _Contrast = 1.0;
`;

/** Names the core prelude and the profile's own declarations already own. */
export const SSF_RESERVED_NAMES: ReadonlySet<string> = new Set([
    'PI',
    'RENDERSIZE',
    'TIME',
    'TIMEDELTA',
    'FRAMECOUNT',
    'PASSINDEX',
    '_xy',
    '_uv',
    '_uvc',
    '_mouse',
    '_click',
    '_muv',
    '_muvc',
]);
