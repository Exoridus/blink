import { RenderTexture } from '@codexo/exojs';

import { clampDimension, evaluateSizeExpression } from '../../ir/sizeExpression';
import type { BlinkDimension, BlinkRenderTargetSpec } from '../../ir/types';
import { type BlinkColorFormat as ColorFormat, toColorTextureFormat } from '../textureFormat';
import { toTextureSampling } from '../textureSampling';

export type RenderTextureFactory = (width: number, height: number, format: ColorFormat) => RenderTexture;

/** Reports whether a color-attachment format is renderable on the active backend. */
export type ColorFormatProbe = (format: ColorFormat) => boolean;

/** Limit assumed when the backend does not report one; every WebGL2 and WebGPU device allows at least this. */
const DEFAULT_MAX_TEXTURE_SIZE = 8192;

export interface RenderTargetPoolSizing {
    /** Backend texture size limit; dimensions are clamped to it. */
    readonly maxTextureSize?: number;
    /** Control values that size expressions may read (`$name`). */
    readonly controls?: Readonly<Record<string, unknown>>;
}

/** Only numeric and boolean control values can size a target. */
function sizingControls(values: Readonly<Record<string, unknown>>): Record<string, number | boolean> {
    const out: Record<string, number | boolean> = {};
    for (const [name, value] of Object.entries(values)) {
        if (typeof value === 'number' || typeof value === 'boolean') {
            out[name] = value;
        }
    }
    return out;
}

interface PooledTarget {
    spec: BlinkRenderTargetSpec;
    textures: RenderTexture[];
    size: readonly [number, number];
}

/**
 * Owns the offscreen RenderTextures for a BlinkFX effect's render targets.
 *
 * Transient targets get one texture; persistent (feedback) targets get two,
 * ping-ponged by frame parity so a pass never reads and writes the same
 * physical texture (a GL feedback loop). Float formats (rgba16f/rgba32f) are
 * honoured when the backend reports them renderable; when it does not, the
 * allocation fails unless the package explicitly permitted the rgba8 fallback.
 */
export class RenderTargetPool {
    private readonly targets = new Map<string, PooledTarget>();
    private readonly createTexture: RenderTextureFactory;
    private readonly supportsFormat: ColorFormatProbe;
    private readonly allowFloatDowngrade: boolean;
    private screenWidth: number;
    private screenHeight: number;
    private readonly maxTextureSize: number;
    private controls: Record<string, number | boolean>;

    public constructor(
        specs: readonly BlinkRenderTargetSpec[],
        screen: { width: number; height: number },
        createTexture: RenderTextureFactory = (w, h, format) =>
            new RenderTexture(w, h, { format: toColorTextureFormat(format) }),
        supportsFormat: ColorFormatProbe = () => true,
        allowFloatDowngrade = false,
        sizing: RenderTargetPoolSizing = {}
    ) {
        this.createTexture = createTexture;
        this.supportsFormat = supportsFormat;
        this.allowFloatDowngrade = allowFloatDowngrade;
        this.screenWidth = screen.width;
        this.screenHeight = screen.height;
        this.maxTextureSize = sizing.maxTextureSize ?? DEFAULT_MAX_TEXTURE_SIZE;
        this.controls = sizingControls(sizing.controls ?? {});

        for (const spec of specs) {
            const { textures, size } = this.allocate(spec);
            this.targets.set(spec.name, { spec, textures, size });
        }
    }

    public has(name: string): boolean {
        return this.targets.has(name);
    }

    /** The allocated size of a render target, in pixels: reflects scale/explicit dims, not the screen size. */
    public size(name: string): readonly [number, number] {
        return this.get(name).size;
    }

    public write(name: string, parity: number): RenderTexture {
        const target = this.get(name);
        return target.spec.persistent ? target.textures[parity & 1] : target.textures[0];
    }

    public read(name: string, prevFrame: boolean, parity: number): RenderTexture {
        const target = this.get(name);
        if (!target.spec.persistent) {
            return target.textures[0];
        }
        const writeIndex = parity & 1;
        return prevFrame ? target.textures[writeIndex ^ 1] : target.textures[writeIndex];
    }

    public resize(width: number, height: number): void {
        this.screenWidth = width;
        this.screenHeight = height;
        for (const target of this.targets.values()) {
            for (const texture of target.textures) {
                texture.destroy();
            }
            const { textures, size } = this.allocate(target.spec);
            target.textures = textures;
            target.size = size;
        }
    }

    /**
     * Feeds the current control values to size expressions. A target whose resolved size changed is
     * reallocated, which discards the history of a persistent one; targets whose size did not change
     * keep their textures. Returns the names of the reallocated targets.
     */
    public updateControls(values: Readonly<Record<string, unknown>>): string[] {
        this.controls = sizingControls(values);
        const changed: string[] = [];
        for (const [name, target] of this.targets) {
            if (!hasExpression(target.spec)) {
                continue;
            }
            const size = this.resolveSize(target.spec);
            if (size[0] === target.size[0] && size[1] === target.size[1]) {
                continue;
            }
            for (const texture of target.textures) {
                texture.destroy();
            }
            const { textures } = this.allocate(target.spec);
            target.textures = textures;
            target.size = size;
            changed.push(name);
        }
        return changed;
    }

    public dispose(): void {
        for (const target of this.targets.values()) {
            for (const texture of target.textures) {
                texture.destroy();
            }
        }
        this.targets.clear();
    }

    private get(name: string): PooledTarget {
        const target = this.targets.get(name);
        if (target === undefined) {
            throw new Error(`RenderTargetPool: unknown render target "${name}"`);
        }
        return target;
    }

    private allocate(spec: BlinkRenderTargetSpec): { textures: RenderTexture[]; size: readonly [number, number] } {
        const size = this.resolveSize(spec);
        const [width, height] = size;
        const format = this.resolveFormat(spec);
        const count = spec.persistent ? 2 : 1;
        const textures: RenderTexture[] = [];
        for (let i = 0; i < count; i++) {
            const texture = this.createTexture(width, height, format);
            if (spec.sampling !== undefined) {
                const sampling = toTextureSampling(spec.sampling);
                texture.scaleMode = sampling.scaleMode;
                texture.wrapMode = sampling.wrapMode;
                texture.generateMipMap = sampling.generateMipMap;
            }
            textures.push(texture);
        }
        return { textures, size };
    }

    /**
     * rgba8 is always renderable and never probed. An unsupported float format is an error unless
     * the package declared the rgba8 fallback: eight bits per channel is a different effect, not a
     * quieter version of the same one, so the choice belongs to whoever wrote the package.
     */
    private resolveFormat(spec: BlinkRenderTargetSpec): ColorFormat {
        if (spec.format === 'rgba8' || this.supportsFormat(spec.format)) {
            return spec.format;
        }
        if (!this.allowFloatDowngrade) {
            throw new Error(
                `RenderTargetPool: target "${spec.name}" requests format "${spec.format}" but ` +
                    'EXT_color_buffer_float is unavailable on this backend, and the package declares no ' +
                    'rgba8 fallback for float-targets.'
            );
        }
        return 'rgba8';
    }

    private resolveSize(spec: BlinkRenderTargetSpec): [number, number] {
        if (spec.scale !== null) {
            return [
                clampDimension(this.screenWidth * spec.scale, this.maxTextureSize),
                clampDimension(this.screenHeight * spec.scale, this.maxTextureSize),
            ];
        }
        return [
            this.resolveDimension(spec, 'width', spec.width, this.screenWidth),
            this.resolveDimension(spec, 'height', spec.height, this.screenHeight),
        ];
    }

    private resolveDimension(
        spec: BlinkRenderTargetSpec,
        axis: 'width' | 'height',
        dimension: BlinkDimension | null,
        screenValue: number
    ): number {
        if (dimension === null) {
            return clampDimension(screenValue, this.maxTextureSize);
        }
        if (typeof dimension === 'number') {
            return clampDimension(dimension, this.maxTextureSize);
        }
        try {
            const value = evaluateSizeExpression(dimension, {
                width: this.screenWidth,
                height: this.screenHeight,
                controls: this.controls,
            });
            return clampDimension(value, this.maxTextureSize);
        } catch (error) {
            throw new Error(
                `RenderTargetPool: target "${spec.name}" ${axis}: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error }
            );
        }
    }
}

function hasExpression(spec: BlinkRenderTargetSpec): boolean {
    return (
        (spec.width !== null && typeof spec.width !== 'number') ||
        (spec.height !== null && typeof spec.height !== 'number')
    );
}
