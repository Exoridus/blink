import {
    Color,
    Mesh,
    MeshMaterial,
    type RenderingContext,
    RenderTexture,
    TextureFormat,
    type UniformValue,
} from '@codexo/exojs';

import type { BlinkControlSpec } from '../ir/types';
import { buildDefaultUniformValues } from '../render/BlinkPrelude';
import { FULLSCREEN_VERTEX_SOURCE, FULLSCREEN_VERTICES } from '../render/pass/BlinkPassRuntime';
import type { AudioBlockSource } from './BlinkAudioOutputRuntime';
import { AUDIO_BLOCK_HEIGHT, AUDIO_BLOCK_SAMPLES, AUDIO_BLOCK_WIDTH, AUDIO_UNIFORMS } from './buildAudioShader';

export interface GpuAudioBlockRendererOptions {
    /** The complete fragment source from `buildAudioShader`. */
    readonly fragment: string;
    readonly controls: readonly BlinkControlSpec[];
    readonly sampleRate: number;
    /** 1 plays the left result on both sides. */
    readonly channels: number;
    /** The live control values, read when each block is rendered. */
    readonly controlValues: () => Readonly<Record<string, UniformValue>>;
    /** Reads the target back as float RGBA, top row first. */
    readonly readPixels: (target: RenderTexture) => Promise<Float32Array>;
}

/**
 * Renders PCM blocks on the GPU: one pass over a float target, one pixel per sample, then a
 * readback. The readback is the only wait, and the caller awaits it off the audio thread.
 */
export class GpuAudioBlockRenderer implements AudioBlockSource<RenderingContext> {
    private readonly options: GpuAudioBlockRendererOptions;
    private readonly material: MeshMaterial;
    private readonly mesh: Mesh;
    private readonly target: RenderTexture;
    private readonly clear = new Color(0, 0, 0, 1);
    private readonly controlNames: ReadonlySet<string>;

    public constructor(options: GpuAudioBlockRendererOptions) {
        this.options = options;
        this.controlNames = new Set(Object.keys(buildDefaultUniformValues(options.controls)));
        this.material = MeshMaterial.from(FULLSCREEN_VERTEX_SOURCE, options.fragment, {
            uniforms: {
                ...buildDefaultUniformValues(options.controls),
                [AUDIO_UNIFORMS.sampleRate]: options.sampleRate,
                [AUDIO_UNIFORMS.blockStart]: 0,
            },
        });
        this.mesh = new Mesh({ vertices: FULLSCREEN_VERTICES, material: this.material });
        this.target = new RenderTexture(AUDIO_BLOCK_WIDTH, AUDIO_BLOCK_HEIGHT, { format: TextureFormat.Rgba32F });
    }

    public async render(context: RenderingContext, startSample: number): Promise<Float32Array> {
        for (const [name, value] of Object.entries(this.options.controlValues())) {
            if (this.controlNames.has(name)) {
                this.material.setUniform(name, value);
            }
        }
        this.material.setUniform(AUDIO_UNIFORMS.blockStart, startSample);

        context.renderTo(this.mesh, { target: this.target, clear: this.clear });
        const pixels = await this.options.readPixels(this.target);

        const stereo = new Float32Array(AUDIO_BLOCK_SAMPLES * 2);
        const mono = this.options.channels === 1;
        for (let i = 0; i < AUDIO_BLOCK_SAMPLES; i++) {
            stereo[i * 2] = pixels[i * 4];
            stereo[i * 2 + 1] = mono ? pixels[i * 4] : pixels[i * 4 + 1];
        }
        return stereo;
    }

    public destroy(): void {
        this.material.destroy();
        this.target.destroy();
    }
}
