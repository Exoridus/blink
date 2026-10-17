import {
    Application,
    Color,
    DataTexture,
    type RenderingContext,
    ScaleModes,
    Scene,
    TextureFormat,
    type UniformValue,
    WrapModes,
} from '@codexo/exojs';

import type { ConvertedPackage } from '../../packages/convert/report';
import { ssfOriginalProfile } from '../../packages/ssf/profile/SsfOriginalProfile';
import { AssetBinder } from '../binding/AssetBinder';
import type { BlinkEffectIR } from '../ir/types';
import { CappedBrowserPlatform } from '../render/CappedBrowserPlatform';
import { DEFAULT_OUTPUT, fitCanvas, type OutputSettings } from '../render/outputSettings';
import { BlinkPassRuntime } from '../render/pass/BlinkPassRuntime';
import type { LabLaneFrame, LabRenderer } from './AudioAnalysisLab';
import { diagnosticRamp } from './visualDiagnostics';

class LabScene extends Scene<{ draw: (context: RenderingContext) => void }> {
    private renderFrame: ((context: RenderingContext) => void) | null = null;
    public override init(data: { draw: (context: RenderingContext) => void }): void {
        this.renderFrame = data.draw;
    }
    public override draw(context: RenderingContext): void {
        this.renderFrame?.(context);
    }
}

/** A separate ExoJS host using the existing BlinkFX pass executor and its own feedback resources. */
export class LabRenderSurface implements LabRenderer {
    private readonly app: Application<{ lab: typeof LabScene }>;
    private readonly runtime = new BlinkPassRuntime();
    private readonly assets = new AssetBinder();
    private readonly spectrum = new DataTexture({
        width: 1024,
        height: 1,
        format: TextureFormat.Rgba32F,
        textureOptions: { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.Repeat },
    });
    private readonly trail = new DataTexture({
        width: 400,
        height: 1,
        format: TextureFormat.Rgba32F,
        textureOptions: { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.Repeat },
    });
    private pending: {
        frame: LabLaneFrame;
        clock: { frame: number; time: number; delta: number };
        resolve: () => void;
        reject: (error: unknown) => void;
    } | null = null;
    private fatal: unknown = null;
    private readonly platform: CappedBrowserPlatform;
    private renderSubmissionMs = 0;
    public inspectPerformance(): object {
        return { renderSubmissionMs: this.renderSubmissionMs, gpuTimingMs: null, gpuTimingStatus: 'not measured' };
    }
    private readonly lastUniforms: Array<{
        pass: number;
        resolution: readonly [number, number];
        values: Record<string, unknown>;
    }> = [];
    public inspectUniforms(): object {
        return structuredClone(this.lastUniforms);
    }

    public constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly effect: BlinkEffectIR,
        private readonly converted: ConvertedPackage,
        private readonly output: OutputSettings = DEFAULT_OUTPUT,
        private readonly ramps = false
    ) {
        this.platform = new CappedBrowserPlatform(canvas);
        this.platform.fpsCap = output.fpsCap;
        this.app = new Application({
            platform: this.platform,
            canvas: { element: canvas, width: this.output.width, height: this.output.height, pixelRatio: 1 },
            backend: { type: 'webgl2' },
            rendering: { alphaMode: 'opaque', webglAttributes: { preserveDrawingBuffer: true } },
            autoClear: false,
            clearColor: new Color(0, 0, 0, 0),
            scenes: { lab: LabScene },
        });
        this.app.onError.add(error => {
            this.fatal = error;
            this.pending?.reject(error);
            this.pending = null;
        });
    }

    public async init(): Promise<void> {
        await this.app.start(LabScene, { data: { draw: context => this.draw(context) } });
        await this.assets.load(this.effect.assets);
        await this.reset();
        fitCanvas(this.canvas, this.output, '100%', '100%');
    }

    public async reset(): Promise<void> {
        this.pending?.reject(new Error('Lab renderer reset'));
        this.pending = null;
        this.fatal = null;
        const profile = ssfOriginalProfile.create(this.effect);
        try {
            const shaders = new Map<string, string>();
            for (const [name, entry] of Object.entries(this.effect.shaders.glsl)) {
                const path = entry.path?.replace(`${this.effect.packageRoot ?? ''}/`, '') ?? '';
                const source = this.converted.files.get(path);
                if (source === undefined && entry.source === null) throw new Error(`Lab shader not found: ${path}`);
                shaders.set(
                    name,
                    entry.source ?? (typeof source === 'string' ? source : new TextDecoder().decode(source))
                );
            }
            this.runtime.build(this.effect, shaders, {
                screen: { width: this.output.width, height: this.output.height },
                clearColor: new Color(0, 0, 0, 0),
                supportsFormat: format =>
                    this.app.rendering.supportsColorFormat(
                        format === 'rgba32f'
                            ? TextureFormat.Rgba32F
                            : format === 'rgba16f'
                              ? TextureFormat.Rgba16F
                              : TextureFormat.Rgba8
                    ),
                profilePrelude: profile.prelude,
                screenColor: profile.screenColor,
                frameUniforms: {
                    ...profile.neutralUniforms(),
                    RENDERSIZE: new Float32Array([this.output.width, this.output.height]),
                    bl_time: 0,
                    bl_deltaTime: 0,
                    bl_frame: 0,
                    bl_pass: 0,
                    bl_resolution: new Float32Array([this.output.width, this.output.height]),
                },
                store: {
                    asset: name => this.assets.get(name),
                    hostInput: () => {},
                    blinkAudio: name => (name === 'spectrum' ? this.spectrum : this.trail),
                },
            });
        } finally {
            profile.dispose?.();
        }
    }

    public render(frame: LabLaneFrame, clock: { frame: number; time: number; delta: number }): Promise<void> {
        if (this.fatal !== null)
            return Promise.reject(
                this.fatal instanceof Error ? this.fatal : new Error('Lab rendering failed', { cause: this.fatal })
            );
        if (this.pending !== null) return Promise.reject(new Error('Lab render already pending'));
        return new Promise((resolve, reject) => {
            this.pending = { frame, clock, resolve, reject };
        });
    }

    public setPresentation(settings: OutputSettings): void {
        this.platform.fpsCap = settings.fpsCap;
        fitCanvas(this.canvas, settings, '100%', '100%');
    }

    public describePasses(): ReturnType<BlinkPassRuntime['describePasses']> {
        return this.runtime.describePasses();
    }

    /** RGBA components in top-left row order; byte targets keep their 0..255 component values. */
    public async capturePasses(): Promise<
        ReadonlyArray<{ name: string; data: Float32Array; width: number; height: number; format: string }>
    > {
        return Promise.all(
            this.runtime.inspectTargets().map(async target => {
                const pixels =
                    target.format === 'rgba8'
                        ? await this.app.rendering.readPixels(target.texture)
                        : await this.app.rendering.readPixels(target.texture, { dataType: 'float32' });
                return {
                    name: target.name,
                    data: Float32Array.from(pixels.data),
                    width: pixels.width,
                    height: pixels.height,
                    format: target.format,
                };
            })
        );
    }

    public async destroy(): Promise<void> {
        this.pending?.reject(new Error('Lab renderer destroyed'));
        this.pending = null;
        this.app.stop();
        this.runtime.dispose();
        this.assets.dispose();
        this.spectrum.destroy();
        this.trail.destroy();
        await this.app.destroy();
    }

    private draw(context: RenderingContext): void {
        const pending = this.pending;
        if (pending === null) return;
        this.pending = null;
        const start = performance.now();
        try {
            this.spectrum.buffer.set(this.ramps ? diagnosticRamp(1024) : pending.frame.snapshot.spectrum);
            this.trail.buffer.set(this.ramps ? diagnosticRamp(400) : pending.frame.snapshot.levelTrail);
            this.spectrum.commit();
            this.trail.commit();
            this.lastUniforms.length = 0;
            this.runtime.execute(
                context,
                (material, passIndex, resolution) => {
                    const uniforms: Record<string, UniformValue> = {
                        ...pending.frame.uniforms,
                        ...pending.frame.controls,
                        RENDERSIZE: new Float32Array(resolution),
                        bl_time: Math.fround(pending.clock.time),
                        bl_deltaTime: Math.fround(pending.clock.delta),
                        bl_frame: pending.clock.frame | 0,
                        bl_pass: passIndex,
                        bl_resolution: new Float32Array(resolution),
                        syn_MediaType: 0,
                    };
                    this.lastUniforms.push({
                        pass: passIndex,
                        resolution: [...resolution],
                        values: Object.fromEntries(
                            Object.entries(uniforms).map(([name, value]) => [
                                name,
                                ArrayBuffer.isView(value) ? [...(value as Float32Array)] : value,
                            ])
                        ),
                    });
                    for (const [name, value] of Object.entries(uniforms))
                        if (this.runtime.isDeclared(material, name)) material.setUniform(name, value);
                },
                pending.frame.controls
            );
            this.renderSubmissionMs = performance.now() - start;
            pending.resolve();
        } catch (error) {
            this.fatal = error;
            pending.reject(error);
        }
    }
}
