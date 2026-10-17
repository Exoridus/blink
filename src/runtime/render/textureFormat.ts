import { type ColorTextureFormat, TextureFormat } from '@codexo/exojs';

import type { BlinkRenderTargetSpec } from '../ir/types';

/** Color attachment format as spelled in a BlinkFX manifest and in the IR. */
export type BlinkColorFormat = BlinkRenderTargetSpec['format'];

// The IR keeps the manifest's own format spelling so it stays independent of the
// renderer; ExoJS takes its TextureFormat enum. Convert at the engine boundary.
const COLOR_TEXTURE_FORMATS: Record<BlinkColorFormat, ColorTextureFormat> = {
    rgba8: TextureFormat.Rgba8,
    rgba16f: TextureFormat.Rgba16F,
    rgba32f: TextureFormat.Rgba32F,
};

export const toColorTextureFormat = (format: BlinkColorFormat): ColorTextureFormat => COLOR_TEXTURE_FORMATS[format];
