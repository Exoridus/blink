import type { UniformValueContainerConstructor, UniformValueContainerType } from '../types';
import { UniformType } from '../types';

const uniformLengths: Record<UniformType, number> = {
    [UniformType.FLOAT]: 1,
    [UniformType.FLOAT_VEC2]: 2,
    [UniformType.FLOAT_VEC3]: 3,
    [UniformType.FLOAT_VEC4]: 4,

    [UniformType.INT]: 1,
    [UniformType.INT_VEC2]: 2,
    [UniformType.INT_VEC3]: 3,
    [UniformType.INT_VEC4]: 4,

    [UniformType.UNSIGNED_INT]: 1,
    [UniformType.UNSIGNED_INT_VEC2]: 2,
    [UniformType.UNSIGNED_INT_VEC3]: 3,
    [UniformType.UNSIGNED_INT_VEC4]: 4,

    [UniformType.BOOL]: 1,
    [UniformType.BOOL_VEC2]: 2,
    [UniformType.BOOL_VEC3]: 3,
    [UniformType.BOOL_VEC4]: 4,

    [UniformType.FLOAT_MAT2]: 4,
    [UniformType.FLOAT_MAT3]: 9,
    [UniformType.FLOAT_MAT4]: 16,

    [UniformType.SAMPLER_2D]: 1,
};
const uniformByteSizes: Record<UniformType, number> = {
    [UniformType.FLOAT]: 4,
    [UniformType.FLOAT_VEC2]: 8,
    [UniformType.FLOAT_VEC3]: 12,
    [UniformType.FLOAT_VEC4]: 16,

    [UniformType.INT]: 4,
    [UniformType.INT_VEC2]: 8,
    [UniformType.INT_VEC3]: 12,
    [UniformType.INT_VEC4]: 16,

    [UniformType.UNSIGNED_INT]: 4,
    [UniformType.UNSIGNED_INT_VEC2]: 8,
    [UniformType.UNSIGNED_INT_VEC3]: 12,
    [UniformType.UNSIGNED_INT_VEC4]: 16,

    [UniformType.BOOL]: 1,
    [UniformType.BOOL_VEC2]: 2,
    [UniformType.BOOL_VEC3]: 3,
    [UniformType.BOOL_VEC4]: 4,

    [UniformType.FLOAT_MAT2]: 16,
    [UniformType.FLOAT_MAT3]: 36,
    [UniformType.FLOAT_MAT4]: 64,

    [UniformType.SAMPLER_2D]: 1,
};
const uniformValueConstructors: UniformValueContainerConstructor = {
    [UniformType.FLOAT]: Float32Array,
    [UniformType.FLOAT_VEC2]: Float32Array,
    [UniformType.FLOAT_VEC3]: Float32Array,
    [UniformType.FLOAT_VEC4]: Float32Array,

    [UniformType.INT]: Int32Array,
    [UniformType.INT_VEC2]: Int32Array,
    [UniformType.INT_VEC3]: Int32Array,
    [UniformType.INT_VEC4]: Int32Array,

    [UniformType.UNSIGNED_INT]: Uint32Array,
    [UniformType.UNSIGNED_INT_VEC2]: Uint32Array,
    [UniformType.UNSIGNED_INT_VEC3]: Uint32Array,
    [UniformType.UNSIGNED_INT_VEC4]: Uint32Array,

    [UniformType.BOOL]: Uint8Array,
    [UniformType.BOOL_VEC2]: Uint8Array,
    [UniformType.BOOL_VEC3]: Uint8Array,
    [UniformType.BOOL_VEC4]: Uint8Array,

    [UniformType.FLOAT_MAT2]: Float32Array,
    [UniformType.FLOAT_MAT3]: Float32Array,
    [UniformType.FLOAT_MAT4]: Float32Array,

    [UniformType.SAMPLER_2D]: Uint8Array,
};

export const getUniformLength = (type: UniformType): number => uniformLengths[type];
export const getUniformByteSize = (type: UniformType): number => uniformByteSizes[type];
export const createUniformValue = <T extends UniformType>(
    type: T,
    buffer: ArrayBufferLike,
    byteOffset: number,
    length: number
): UniformValueContainerType[T] =>
    new uniformValueConstructors[type](buffer as ArrayBuffer, byteOffset, length) as UniformValueContainerType[T];
