export type UniformValues = Float32Array | Int32Array | Uint32Array | Uint8Array;

export type UniformValueContainerConstructors =
    Float32ArrayConstructor | Int32ArrayConstructor | Uint32ArrayConstructor | Uint8ArrayConstructor;

export type UniformValueContainers = Float32Array | Int32Array | Uint32Array | Uint8Array;

export enum UniformType {
    FLOAT = 'float',
    FLOAT_VEC2 = 'vec2',
    FLOAT_VEC3 = 'vec3',
    FLOAT_VEC4 = 'vec4',

    INT = 'int',
    INT_VEC2 = 'ivec2',
    INT_VEC3 = 'ivec3',
    INT_VEC4 = 'ivec4',

    UNSIGNED_INT = 'uint',
    UNSIGNED_INT_VEC2 = 'uvec2',
    UNSIGNED_INT_VEC3 = 'uvec3',
    UNSIGNED_INT_VEC4 = 'uvec4',

    BOOL = 'bool',
    BOOL_VEC2 = 'bvec2',
    BOOL_VEC3 = 'bvec3',
    BOOL_VEC4 = 'bvec4',

    FLOAT_MAT2 = 'mat2',
    FLOAT_MAT3 = 'mat3',
    FLOAT_MAT4 = 'mat4',

    SAMPLER_2D = 'sampler2D',
}

export interface UniformValueContainerConstructor {
    [UniformType.FLOAT]: Float32ArrayConstructor;
    [UniformType.FLOAT_VEC2]: Float32ArrayConstructor;
    [UniformType.FLOAT_VEC3]: Float32ArrayConstructor;
    [UniformType.FLOAT_VEC4]: Float32ArrayConstructor;

    [UniformType.INT]: Int32ArrayConstructor;
    [UniformType.INT_VEC2]: Int32ArrayConstructor;
    [UniformType.INT_VEC3]: Int32ArrayConstructor;
    [UniformType.INT_VEC4]: Int32ArrayConstructor;

    [UniformType.UNSIGNED_INT]: Uint32ArrayConstructor;
    [UniformType.UNSIGNED_INT_VEC2]: Uint32ArrayConstructor;
    [UniformType.UNSIGNED_INT_VEC3]: Uint32ArrayConstructor;
    [UniformType.UNSIGNED_INT_VEC4]: Uint32ArrayConstructor;

    [UniformType.BOOL]: Uint8ArrayConstructor;
    [UniformType.BOOL_VEC2]: Uint8ArrayConstructor;
    [UniformType.BOOL_VEC3]: Uint8ArrayConstructor;
    [UniformType.BOOL_VEC4]: Uint8ArrayConstructor;

    [UniformType.FLOAT_MAT2]: Float32ArrayConstructor;
    [UniformType.FLOAT_MAT3]: Float32ArrayConstructor;
    [UniformType.FLOAT_MAT4]: Float32ArrayConstructor;

    [UniformType.SAMPLER_2D]: Uint8ArrayConstructor;
}

export interface UniformValueContainerType {
    [UniformType.FLOAT]: Float32Array;
    [UniformType.FLOAT_VEC2]: Float32Array;
    [UniformType.FLOAT_VEC3]: Float32Array;
    [UniformType.FLOAT_VEC4]: Float32Array;

    [UniformType.INT]: Int32Array;
    [UniformType.INT_VEC2]: Int32Array;
    [UniformType.INT_VEC3]: Int32Array;
    [UniformType.INT_VEC4]: Int32Array;

    [UniformType.UNSIGNED_INT]: Uint32Array;
    [UniformType.UNSIGNED_INT_VEC2]: Uint32Array;
    [UniformType.UNSIGNED_INT_VEC3]: Uint32Array;
    [UniformType.UNSIGNED_INT_VEC4]: Uint32Array;

    [UniformType.BOOL]: Uint8Array;
    [UniformType.BOOL_VEC2]: Uint8Array;
    [UniformType.BOOL_VEC3]: Uint8Array;
    [UniformType.BOOL_VEC4]: Uint8Array;

    [UniformType.FLOAT_MAT2]: Float32Array;
    [UniformType.FLOAT_MAT3]: Float32Array;
    [UniformType.FLOAT_MAT4]: Float32Array;

    [UniformType.SAMPLER_2D]: Uint8Array;
}

export interface UniformValueTypes {
    [UniformType.FLOAT]: number;
    [UniformType.FLOAT_VEC2]: Float32Array;
    [UniformType.FLOAT_VEC3]: Float32Array;
    [UniformType.FLOAT_VEC4]: Float32Array;

    [UniformType.INT]: number;
    [UniformType.INT_VEC2]: Int32Array;
    [UniformType.INT_VEC3]: Int32Array;
    [UniformType.INT_VEC4]: Int32Array;

    [UniformType.UNSIGNED_INT]: number;
    [UniformType.UNSIGNED_INT_VEC2]: Uint32Array;
    [UniformType.UNSIGNED_INT_VEC3]: Uint32Array;
    [UniformType.UNSIGNED_INT_VEC4]: Uint32Array;

    [UniformType.BOOL]: number;
    [UniformType.BOOL_VEC2]: Uint8Array;
    [UniformType.BOOL_VEC3]: Uint8Array;
    [UniformType.BOOL_VEC4]: Uint8Array;

    [UniformType.FLOAT_MAT2]: Float32Array;
    [UniformType.FLOAT_MAT3]: Float32Array;
    [UniformType.FLOAT_MAT4]: Float32Array;

    [UniformType.SAMPLER_2D]: number;
}

export type TimeInterval = 1 | 1000 | 60000 | 3600000;

export type Obj = Record<string, unknown>;

export type TypedEnum<Enum, Type> = { [Key in keyof Enum]: Type };

export type Environment = string;

export interface RendererConfig {
    view: HTMLCanvasElement;
    width: number;
    height: number;
    backgroundColor: number;
    backgroundAlpha: number;
    useContextAlpha: boolean;
    antialias: boolean;
    clearBeforeRender: boolean;
    preserveDrawingBuffer: boolean;
    powerPreference: WebGLPowerPreference;
    /**
     * The render backend. WebGL2 runs GLSL programs and is the default; WebGPU runs the WGSL
     * programs of native packages and has no audio generation or compatibility profiles.
     */
    backend?: 'webgl2' | 'webgpu';
}

export interface GlobalUniforms {
    [key: string]: UniformType;
    TIME: UniformType.FLOAT;
    TIMEDELTA: UniformType.FLOAT;
    FRAMECOUNT: UniformType.INT;
    PASSINDEX: UniformType.INT;
    RESOLUTION: UniformType.FLOAT_VEC2;
    DATE: UniformType.FLOAT_VEC4;
    SURFACEPOSITION: UniformType.FLOAT_VEC2;
    MOUSE: UniformType.FLOAT_VEC4;
    BASS: UniformType.FLOAT_VEC4;
    MID: UniformType.FLOAT_VEC4;
    TREBLE: UniformType.FLOAT_VEC4;
    BASSTIME: UniformType.FLOAT;
    MIDTIME: UniformType.FLOAT;
    TREBLETIME: UniformType.FLOAT;
    BPM: UniformType.INT;
}

export type FilterUniforms = { [name in keyof GlobalUniforms]?: Obj };
