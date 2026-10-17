import { ScaleModes, Texture, type UniformValue, WrapModes } from '@codexo/exojs';

import type { BlinkAssetSpec, BlinkSampling } from '../ir/types';
import { fetchPackageFile } from '../package';

export type AssetSampleColor = 'managed' | 'raw';

/** Creates a GPU texture for one package asset. Injectable so the binder is testable without a GPU. */
export type AssetTextureFactory = (
    path: string,
    sampling: BlinkSampling,
    color?: AssetSampleColor
) => Promise<Texture> | Texture;

const IMAGE_OPTIONS: ImageBitmapOptions = {
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
};

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

/**
 * Owns the GPU textures for a package's declared `texture2d` assets.
 *
 * Assets are loaded before the pass runtime is built, so a pass that binds
 * `asset.<name>` always finds a committed texture. A decode failure rejects the
 * load rather than leaving the effect half-bound.
 */
export class AssetBinder {
    private readonly createTexture: AssetTextureFactory;
    private readonly sampleColor: AssetSampleColor;
    private readonly textures = new Map<string, Texture>();

    public constructor(
        createTexture: AssetTextureFactory = defaultAssetTextureFactory,
        sampleColor: AssetSampleColor = 'managed'
    ) {
        this.createTexture = createTexture;
        this.sampleColor = sampleColor;
    }

    public async load(assets: readonly BlinkAssetSpec[]): Promise<void> {
        const results = await Promise.allSettled(
            assets.map(
                async asset =>
                    [
                        asset.name,
                        await (this.sampleColor === 'raw'
                            ? this.createTexture(asset.path, asset.sampling, 'raw')
                            : this.createTexture(asset.path, asset.sampling)),
                    ] as const
            )
        );

        // A textureless failure must not leak the textures other assets in the same
        // batch already finished creating: release those before surfacing the
        // rejection, so a failed reload during iterative package development does
        // not accumulate orphaned GPU textures across edit cycles.
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failure) {
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    result.value[1].destroy();
                }
            }
            throw failure.reason;
        }

        for (const result of results) {
            if (result.status === 'fulfilled') {
                this.textures.set(result.value[0], result.value[1]);
            }
        }
    }

    public get(name: string): UniformValue | undefined {
        return this.textures.get(name);
    }

    public dispose(): void {
        for (const texture of this.textures.values()) {
            texture.destroy();
        }
        this.textures.clear();
    }
}

async function defaultAssetTextureFactory(
    path: string,
    sampling: BlinkSampling,
    color: AssetSampleColor = 'managed'
): Promise<Texture> {
    const response = await fetchPackageFile(path);
    if (!response.ok) {
        throw new Error(`AssetBinder: failed to load asset "${path}" (${response.status})`);
    }
    // ImageBitmap ignores GL unpack flips, so align image rows with shader UVs at decode.
    const bitmap = await createImageBitmap(await response.blob(), IMAGE_OPTIONS);
    return new Texture(bitmap, {
        // Raw shader inputs must bypass the engine's linear-light/PMA normalization.
        ...(color === 'raw'
            ? { colorSpace: 'none' as const, alphaMode: 'straight' as const, premultiplyAlpha: false }
            : {}),
        scaleMode: SCALE_MODES[sampling.filter],
        wrapMode: WRAP_MODES[sampling.wrap],
        generateMipMap: sampling.filter === 'mipmap',
    });
}
