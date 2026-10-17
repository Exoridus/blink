import { RingBuffer } from './RingBuffer';

/**
 * Backend-neutral packed texture buffers for native BlinkFX shaders.
 *
 * These are pure Float32Array buffers — no GPU types, no ExoJS imports.
 * A separate renderer integration step uploads them to WebGL/WebGPU textures.
 *
 * ## fx_spectrum (RGBA float texture, width = spectrum bins, height = 1)
 *
 *   R = raw spectrum
 *   G = juiced spectrum
 *   B = smooth spectrum
 *   A = waveform
 *
 * ## fx_histogram (RGBA float texture, width = 400, height = 1)
 *
 *   R = all / full level history
 *   G = bass level history
 *   B = mid level history
 *   A = high level history
 */

export interface BlinkAudioTextureBuffers {
    /** Raw FFT magnitude spectrum [0, 2] per bin. */
    readonly rawSpectrum: Float32Array;

    /** Juiced/perceptual spectrum [0, 2] per bin. */
    readonly juicedSpectrum: Float32Array;

    /** Smooth/temporally-blurred spectrum [0, 2] per bin. */
    readonly smoothSpectrum: Float32Array;

    /** Time-domain waveform samples in [-1, 1]. May be empty if unavailable. */
    readonly waveform: Float32Array;

    /** Packed RGBA spectrum buffer (width × 4). Computed by `packFxSpectrum`. */
    readonly packedSpectrum: Float32Array;

    /** Packed RGBA histogram buffer (400 × 4). Computed by `packFxHistogram`. */
    readonly packedHistogram: Float32Array;

    /** dB→linear intermediate buffer (1024 floats). Input to Juiced Stage A and stage debugging. */
    readonly rawInputCandidate: Float32Array;

    /**
     * Log-frequency spectrum [0, ~1.1] per bin — input for the Smooth (B) path.
     * Populated from getSpectrumLogFloat, which provides octave-spaced bins (30–16 kHz).
     * When no log FFT is available, falls back to rawSpectrum (graceful degradation).
     * Raw (R) and Juiced (G) channels are never derived from this buffer.
     */
    readonly logSpectrum: Float32Array;
}

/**
 * Number of frequency bins for the spectrum textures.
 * Derived from the FFT size used by AudioService (2048 → 1024 unique bins).
 */
export const SPECTRUM_BINS = 1024;

/**
 * Number of history frames for the level trail / histogram texture.
 */
export const HISTOGRAM_WIDTH = 400;

export interface BlinkAudioSurfaces {
    readonly textureBuffers: BlinkAudioTextureBuffers;

    readonly levelHistory: RingBuffer;
    readonly bassHistory: RingBuffer;
    readonly midHistory: RingBuffer;
    readonly highHistory: RingBuffer;
}

export function createBlinkAudioTextureBuffers(spectrumBins: number = SPECTRUM_BINS): BlinkAudioTextureBuffers {
    return {
        rawSpectrum: new Float32Array(spectrumBins),
        juicedSpectrum: new Float32Array(spectrumBins),
        smoothSpectrum: new Float32Array(spectrumBins),
        waveform: new Float32Array(spectrumBins),
        packedSpectrum: new Float32Array(spectrumBins * 4),
        packedHistogram: new Float32Array(HISTOGRAM_WIDTH * 4),
        rawInputCandidate: new Float32Array(spectrumBins),
        logSpectrum: new Float32Array(spectrumBins),
    };
}

export function createBlinkAudioSurfaces(spectrumBins: number = SPECTRUM_BINS): BlinkAudioSurfaces {
    return {
        textureBuffers: createBlinkAudioTextureBuffers(spectrumBins),
        levelHistory: new RingBuffer(HISTOGRAM_WIDTH),
        bassHistory: new RingBuffer(HISTOGRAM_WIDTH),
        midHistory: new RingBuffer(HISTOGRAM_WIDTH),
        highHistory: new RingBuffer(HISTOGRAM_WIDTH),
    };
}
