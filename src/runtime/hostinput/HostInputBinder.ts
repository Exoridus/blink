import type { TextureColorSpace, UniformValue } from '@codexo/exojs';
import { DataTexture, Texture, TextureFormat } from '@codexo/exojs';

import type { BlinkHostInputSpec } from '../ir/types';
import { toTextureSampling } from '../render/textureSampling';

/**
 * The analyser state the audio-shaped host inputs are packed from.
 *
 * Deliberately raw: the generic `audio` / `audioFFT` / `audioTexture` inputs carry plain
 * analyser data, and the spec forbids substituting the native `blink.audio.*` packings - those
 * are separate surfaces with their own semantics, not a cheaper source for these.
 */
export interface HostAudioSource {
    /** Time-domain samples in [-1, 1], or null while no source is connected. */
    waveform(): Float32Array | null;
    /** Frequency-domain magnitudes in dBFS, or null while no source is connected. */
    spectrumDb(): Float32Array | null;
    /** The analyser's dB window, used to map the spectrum into [0, 1]. */
    readonly decibelRange: { readonly min: number; readonly max: number };
}

/**
 * Width used when a package declares an audio-shaped input without `samples`.
 *
 * Matches the analyser's own bin count, so the default costs no resampling.
 */
export const DEFAULT_AUDIO_SAMPLES = 1024;

/** The keyboard surface the spec fixes: 256 key codes across three state rows. */
const KEYBOARD_WIDTH = 256;
const KEYBOARD_HEIGHT = 3;

/** Produces the current keyboard texture payload, rgba8, row-major, or null when unavailable. */
export type KeyboardSource = () => Uint8Array | null;

/** Interpretation overrides applied to owned image views, leaving the host producer unchanged. */
export interface HostImagePolicy {
    readonly colorSpace?: TextureColorSpace;
    readonly premultiplyAlpha?: boolean;
}

interface BoundInput {
    readonly spec: BlinkHostInputSpec;
    readonly texture: DataTexture<TextureFormat.Rgba32F> | null;
    readonly keyboardTexture: DataTexture<TextureFormat.Rgba8> | null;
    /** Set for `image`, which the host supplies rather than the binder packing it. */
    image: Texture | null;
    imageView: Texture | null;
    imageVersion: number;
}

function samplesFor(spec: BlinkHostInputSpec): number {
    return spec.samples ?? DEFAULT_AUDIO_SAMPLES;
}

function createKeyboardSurface(): DataTexture<TextureFormat.Rgba8> {
    return new DataTexture({
        width: KEYBOARD_WIDTH,
        height: KEYBOARD_HEIGHT,
        format: TextureFormat.Rgba8,
        data: new Uint8Array(KEYBOARD_WIDTH * KEYBOARD_HEIGHT * 4),
    });
}

function createSurface(width: number, height: number): DataTexture<TextureFormat.Rgba32F> {
    return new DataTexture({
        width,
        height,
        format: TextureFormat.Rgba32F,
        data: new Float32Array(width * height * 4),
    });
}

/** Nearest-neighbour resample: a host input is a sampling surface, not a resampling filter. */
function resample(source: Float32Array | null, width: number, map: (value: number) => number): Float32Array {
    const out = new Float32Array(width);
    if (source === null || source.length === 0) {
        return out;
    }
    const step = source.length / width;
    for (let i = 0; i < width; i++) {
        out[i] = map(source[Math.min(source.length - 1, Math.floor(i * step))] ?? 0);
    }
    return out;
}

/**
 * Owns the textures behind a package's declared host inputs and answers
 * `PassResourceStore.hostInput` from them.
 *
 * Values are latched once per frame by `snapshot()`, never read straight from the analyser at
 * sample time: the spec requires every pass and script in one frame to observe the same inputs.
 *
 * An `image` input has no producer inside the runtime - the host supplies one through
 * `setImageSource`, and until it does the input resolves to nothing and the pass falls back to
 * the dummy texture, exactly as an asset that has not decoded yet does.
 */
export class HostInputBinder {
    private readonly audio: HostAudioSource;
    private readonly keyboard: KeyboardSource;
    private readonly imagePolicy: HostImagePolicy;
    private inputs = new Map<string, BoundInput>();

    public constructor(
        audio: HostAudioSource,
        keyboard: KeyboardSource = () => null,
        imagePolicy: HostImagePolicy = {}
    ) {
        this.audio = audio;
        this.keyboard = keyboard;
        this.imagePolicy = imagePolicy;
    }

    /**
     * Allocates the surfaces one effect's inputs need, releasing the previous effect's.
     *
     * Image sources are not carried over: they belong to the host, and which of them the next
     * effect wants is the host's call, not a leftover from the last one.
     */
    public bind(specs: readonly BlinkHostInputSpec[]): void {
        this.dispose();

        const bound = new Map<string, BoundInput>();
        for (const spec of specs) {
            bound.set(spec.name, {
                spec,
                texture: this.createTextureFor(spec),
                keyboardTexture: spec.type === 'keyboard' ? createKeyboardSurface() : null,
                image: null,
                imageView: null,
                imageVersion: -1,
            });
        }
        this.inputs = bound;
    }

    /** Host inputs this binder cannot provide a value for, by name. */
    public unsatisfied(): readonly string[] {
        return [...this.inputs.values()]
            .filter(input => input.spec.type === 'image' && input.image === null)
            .map(input => input.spec.name);
    }

    /** Whether any image input currently has a producer bound. */
    public hasImageSource(): boolean {
        return [...this.inputs.values()].some(input => input.spec.type === 'image' && input.image !== null);
    }

    public setImageSource(name: string, texture: Texture | null): void {
        const input = this.inputs.get(name);
        if (input === undefined) {
            throw new Error(`HostInputBinder: unknown host input "${name}"`);
        }
        if (input.spec.type !== 'image') {
            throw new Error(`HostInputBinder: host input "${name}" is not an image input`);
        }
        if (input.image === texture) return;
        input.imageView?.destroy();
        input.imageView = null;
        input.imageVersion = -1;
        input.image = texture;
        this.refreshImageView(input);
    }

    /** Latch the frame's values. Call once, at the start of the frame, before anything samples. */
    public snapshot(): void {
        const waveform = this.audio.waveform();
        const spectrumDb = this.audio.spectrumDb();

        const keyboard = this.keyboard();

        for (const input of this.inputs.values()) {
            this.refreshImageView(input);
            if (input.keyboardTexture !== null) {
                if (keyboard !== null) {
                    input.keyboardTexture.buffer.set(keyboard);
                }
                input.keyboardTexture.commit();
                continue;
            }
            if (input.texture === null) {
                continue;
            }
            const width = samplesFor(input.spec);
            switch (input.spec.type) {
                case 'audio':
                    this.writeRow(
                        input.texture,
                        0,
                        resample(waveform, width, sample => sample)
                    );
                    break;
                case 'audioFFT':
                    this.writeRow(
                        input.texture,
                        0,
                        resample(spectrumDb, width, db => this.normalizeDb(db))
                    );
                    break;
                case 'audioTexture':
                    // Row 0 spectrum, row 1 waveform, as `representation: "spectrum-waveform"` defines.
                    this.writeRow(
                        input.texture,
                        0,
                        resample(spectrumDb, width, db => this.normalizeDb(db))
                    );
                    this.writeRow(
                        input.texture,
                        1,
                        resample(waveform, width, sample => sample)
                    );
                    break;
                case 'image':
                case 'pointer':
                case 'keyboard':
                    break;
            }
            input.texture.commit();
        }
    }

    public resolve(name: string): UniformValue | undefined {
        const input = this.inputs.get(name);
        if (input === undefined) {
            return undefined;
        }
        if (input.spec.type === 'image') {
            return input.imageView ?? input.image ?? undefined;
        }
        return input.texture ?? input.keyboardTexture ?? undefined;
    }

    public dispose(): void {
        for (const input of this.inputs.values()) {
            input.imageView?.destroy();
            input.texture?.destroy();
            input.keyboardTexture?.destroy();
        }
        this.inputs = new Map();
    }

    private refreshImageView(input: BoundInput): void {
        const donor = input.image;
        if (
            donor === null ||
            (input.spec.sampling === undefined &&
                this.imagePolicy.colorSpace === undefined &&
                this.imagePolicy.premultiplyAlpha === undefined)
        )
            return;
        if (input.imageView !== null && input.imageVersion === donor.version) return;
        if (
            input.imageView !== null &&
            input.imageView.source === donor.source &&
            donor.pixels === null &&
            donor.compressed === null &&
            !(donor instanceof DataTexture)
        ) {
            // A live source (video) advances the donor's version every frame; re-uploading the same
            // element in place avoids creating and destroying a texture per frame.
            input.imageView.updateSource();
            input.imageVersion = donor.version;
            return;
        }

        const sampling = input.spec.sampling;
        const colorSpace = this.imagePolicy.colorSpace ?? donor.colorSpace;
        const textureOptions = {
            colorSpace,
            alphaMode: donor.alphaMode,
            premultiplyAlpha: this.imagePolicy.premultiplyAlpha ?? donor.premultiplyAlpha,
            flipY: donor.flipY,
            ...(sampling === undefined
                ? { scaleMode: donor.scaleMode, wrapMode: donor.wrapMode, generateMipMap: donor.generateMipMap }
                : toTextureSampling(sampling)),
        };
        const numericDonor = donor instanceof DataTexture ? (donor as DataTexture) : null;
        const view =
            numericDonor === null
                ? new Texture(donor.source, textureOptions)
                : new DataTexture({
                      width: numericDonor.width,
                      height: numericDonor.height,
                      format: numericDonor.format,
                      data: numericDonor.buffer,
                      textureOptions,
                  });
        try {
            if (donor.pixels !== null) {
                view.setPixels(colorSpace === donor.colorSpace ? donor.pixels : { ...donor.pixels, colorSpace });
            } else if (donor.compressed !== null) {
                view.setCompressed(
                    colorSpace === donor.colorSpace ? donor.compressed : { ...donor.compressed, colorSpace }
                );
            }
        } catch (error) {
            view.destroy();
            throw error;
        }
        input.imageView?.destroy();
        input.imageView = view;
        input.imageVersion = donor.version;
    }

    private createTextureFor(spec: BlinkHostInputSpec): DataTexture<TextureFormat.Rgba32F> | null {
        const width = samplesFor(spec);
        switch (spec.type) {
            case 'audio':
            case 'audioFFT':
                return createSurface(width, 1);
            case 'audioTexture':
                return createSurface(width, 2);
            case 'image':
            case 'pointer':
            case 'keyboard':
                // Not a float surface: an image comes from the host, the pointer is a uniform block
                // rather than a texture, and the keyboard has its own rgba8 surface.
                return null;
        }
    }

    /** Maps the analyser's dB window onto [0, 1]; anything below the floor clamps to zero. */
    private normalizeDb(db: number): number {
        const { min, max } = this.audio.decibelRange;
        if (max <= min) {
            return 0;
        }
        return Math.min(1, Math.max(0, (db - min) / (max - min)));
    }

    /** Writes one row into the R channel, leaving G, B and A at zero as the layouts reserve them. */
    private writeRow(texture: DataTexture<TextureFormat.Rgba32F>, row: number, values: Float32Array): void {
        const data = texture.buffer;
        const width = values.length;
        for (let x = 0; x < width; x++) {
            data[(row * width + x) * 4] = values[x];
        }
    }
}
