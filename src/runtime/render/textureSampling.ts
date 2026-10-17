import { ScaleModes, type TextureOptions, WrapModes } from '@codexo/exojs';

import type { BlinkSampling } from '../ir/types';

const SCALE_MODES: Record<BlinkSampling['filter'], ScaleModes> = {
    nearest: ScaleModes.Nearest,
    linear: ScaleModes.Linear,
    mipmap: ScaleModes.LinearMipmapLinear,
};

const WRAP_MODES: Record<BlinkSampling['wrap'], WrapModes> = {
    clamp: WrapModes.ClampToEdge,
    repeat: WrapModes.Repeat,
    mirror: WrapModes.MirroredRepeat,
};

export function toTextureSampling(
    sampling: BlinkSampling
): Pick<TextureOptions, 'scaleMode' | 'wrapMode' | 'generateMipMap'> {
    return {
        scaleMode: SCALE_MODES[sampling.filter],
        wrapMode: WRAP_MODES[sampling.wrap],
        generateMipMap: sampling.filter === 'mipmap',
    };
}
