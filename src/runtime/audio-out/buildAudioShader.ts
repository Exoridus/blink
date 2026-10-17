import type { BlinkControlSpec } from '../ir/types';
import { buildBlinkPrelude } from '../render/BlinkPrelude';

/** Samples per row and rows per block: one block is `AUDIO_BLOCK_WIDTH * AUDIO_BLOCK_HEIGHT` samples. */
export const AUDIO_BLOCK_WIDTH = 128;
export const AUDIO_BLOCK_HEIGHT = 32;
export const AUDIO_BLOCK_SAMPLES = AUDIO_BLOCK_WIDTH * AUDIO_BLOCK_HEIGHT;

/** The audio shader ABIs the runtime can run. */
export const NATIVE_AUDIO_ABI = 'blink-audio/1';
export const SHADERTOY_AUDIO_ABI = 'shadertoy-sound/1';
export const SUPPORTED_AUDIO_ABIS: readonly string[] = [NATIVE_AUDIO_ABI, SHADERTOY_AUDIO_ABI];

/** The uniforms the wrapper adds to the native prelude. */
export const AUDIO_UNIFORMS = {
    sampleRate: 'bl_audioSampleRate',
    blockStart: 'bl_audioBlockStart',
} as const;

const ENTRY: Readonly<Record<string, string>> = {
    [NATIVE_AUDIO_ABI]: 'renderSound(t, index)',
    // Shadertoy hands the sample index first and the time second.
    [SHADERTOY_AUDIO_ABI]: 'mainSound(index, t)',
};

/**
 * Builds the fragment shader that renders one block of PCM.
 *
 * Every pixel of an `AUDIO_BLOCK_WIDTH x AUDIO_BLOCK_HEIGHT` float target is one sample: the
 * pixel's position gives its absolute sample index, the program's stereo result goes to R and G.
 * Rows are numbered from the top because a readback returns the top row first, which makes the
 * readback buffer sequential in sample order.
 *
 * Sample indices are integers so they stay exact for hours; the time passed to the program is
 * a float, with the same precision limits a Shadertoy sound shader has.
 */
export function buildAudioShader(source: string, abi: string, controls: readonly BlinkControlSpec[]): string {
    const entry = ENTRY[abi];
    if (entry === undefined) {
        throw new Error(`Audio ABI "${abi}" is not supported (supported: ${SUPPORTED_AUDIO_ABIS.join(', ')})`);
    }

    return [
        buildBlinkPrelude(controls).source,
        `uniform float ${AUDIO_UNIFORMS.sampleRate};`,
        `uniform int ${AUDIO_UNIFORMS.blockStart};`,
        source,
        `void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  int row = ${AUDIO_BLOCK_HEIGHT - 1} - pixel.y;
  int index = ${AUDIO_UNIFORMS.blockStart} + row * ${AUDIO_BLOCK_WIDTH} + pixel.x;
  float t = float(index) / ${AUDIO_UNIFORMS.sampleRate};
  vec2 sound = ${entry};
  // A NaN or an out-of-range value must never reach the speakers.
  sound = mix(clamp(sound, -1.0, 1.0), vec2(0.0), vec2(isnan(sound)));
  fragColor = vec4(sound, 0.0, 1.0);
}
`,
    ].join('\n');
}
