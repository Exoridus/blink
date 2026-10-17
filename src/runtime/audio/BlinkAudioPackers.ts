/**
 * Packers for fx_spectrum and fx_histogram RGBA float textures.
 *
 * These produce interleaved RGBA Float32Array buffers suitable for
 * uploading to a WebGL/WebGPU DataTexture.
 *
 * Layout:
 *   fx_spectrum:  width = spectrum bins, height = 1
 *     offset + 0: raw spectrum     (R)
 *     offset + 1: juiced spectrum  (G)
 *     offset + 2: smooth spectrum  (B)
 *     offset + 3: waveform         (A)
 *
 *   fx_histogram: width = 400, height = 1
 *     offset + 0: all level history   (R)
 *     offset + 1: bass level history  (G)
 *     offset + 2: mid level history   (B)
 *     offset + 3: high level history  (A)
 *
 * All channels are clamped to [0, 2] per Synesthesia's audio texture
 * range (confirmed from binary).
 */

import { TEXTURE_CLAMP_MAX, TEXTURE_CLAMP_MIN } from './BlinkAudioConstants';
import type { BlinkAudioSurfaces } from './BlinkAudioSurfaces';

function clampTexture(v: number): number {
    return Math.min(TEXTURE_CLAMP_MAX, Math.max(TEXTURE_CLAMP_MIN, v));
}

/**
 * Pack the spectrum RGBA channels into an interleaved Float32Array.
 *
 * The output buffer must have at least `bins * 4` elements.
 */
export function packFxSpectrum(
    rawSpectrum: Float32Array,
    juicedSpectrum: Float32Array,
    smoothSpectrum: Float32Array,
    waveform: Float32Array,
    outPacked: Float32Array,
    bins: number
): void {
    for (let i = 0; i < bins; i++) {
        const offset = i * 4;
        outPacked[offset + 0] = clampTexture(rawSpectrum[i] ?? 0);
        outPacked[offset + 1] = clampTexture(juicedSpectrum[i] ?? 0);
        outPacked[offset + 2] = clampTexture(smoothSpectrum[i] ?? 0);
        // waveform in [-1, 1] → remap to [0, 1] for the A channel, then clamp to [0, 2]
        outPacked[offset + 3] = clampTexture(((waveform[i] ?? 0) + 1) * 0.5);
    }
}

/**
 * Pack the histogram RGBA channels from ring buffers.
 *
 * Orientation: **pixel 0 (leftmost) = newest sample**, pixel (width-1) = oldest.
 * This matches Synesthesia's `syn_LevelTrail` ordering.  The input history
 * arrays are assumed to be in chronological order (oldest first, newest last)
 * as returned by `RingBuffer.read()`.
 *
 * The output buffer must have at least `width * 4` elements.
 */
export function packFxHistogram(
    levelHistory: Float32Array,
    bassHistory: Float32Array,
    midHistory: Float32Array,
    highHistory: Float32Array,
    outPacked: Float32Array,
    width: number
): void {
    const count = Math.min(width, levelHistory.length, bassHistory.length, midHistory.length, highHistory.length);
    for (let i = 0; i < width; i++) {
        const srcIdx = count - 1 - i;
        const offset = i * 4;
        outPacked[offset + 0] = srcIdx >= 0 ? clampTexture(levelHistory[srcIdx] ?? 0) : 0;
        outPacked[offset + 1] = srcIdx >= 0 ? clampTexture(bassHistory[srcIdx] ?? 0) : 0;
        outPacked[offset + 2] = srcIdx >= 0 ? clampTexture(midHistory[srcIdx] ?? 0) : 0;
        outPacked[offset + 3] = srcIdx >= 0 ? clampTexture(highHistory[srcIdx] ?? 0) : 0;
    }
}

/**
 * Convenience: pack both textures from a BlinkAudioSurfaces instance in one call.
 */
export function packAllSurfaces(surfaces: BlinkAudioSurfaces, bins: number, histWidth: number): void {
    const tb = surfaces.textureBuffers;
    packFxSpectrum(tb.rawSpectrum, tb.juicedSpectrum, tb.smoothSpectrum, tb.waveform, tb.packedSpectrum, bins);
    packFxHistogram(
        surfaces.levelHistory.read(),
        surfaces.bassHistory.read(),
        surfaces.midHistory.read(),
        surfaces.highHistory.read(),
        tb.packedHistogram,
        histWidth
    );
}
