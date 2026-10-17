export interface PixelMask {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** RGB byte differences in top-left row order; UI/watermark masks exclude whole pixels. */
export function pixelDifference(
    a: Uint8ClampedArray,
    b: Uint8ClampedArray,
    width: number,
    height: number,
    masks: readonly PixelMask[]
): {
    heatmap: Uint8ClampedArray;
    metrics: { comparedPixels: number; maskedPixels: number; maxAbs: number; meanAbs: number; rms: number };
} {
    if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width < 1 ||
        height < 1 ||
        a.length !== width * height * 4 ||
        b.length !== a.length
    )
        throw new RangeError('Pixel comparison dimensions differ');
    const maskShape: unknown = masks;
    if (!Array.isArray(maskShape)) throw new RangeError('Invalid pixel mask');
    if (
        masks.some(
            mask =>
                mask === null ||
                typeof mask !== 'object' ||
                ![mask.x, mask.y, mask.width, mask.height].every(Number.isFinite) ||
                mask.width < 0 ||
                mask.height < 0
        )
    )
        throw new RangeError('Invalid pixel mask');
    const heatmap = new Uint8ClampedArray(a.length);
    let comparedPixels = 0;
    let maskedPixels = 0;
    let maxAbs = 0;
    let sum = 0;
    let squares = 0;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            heatmap[offset + 3] = 255;
            if (masks.some(mask => x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height)) {
                maskedPixels++;
                continue;
            }
            comparedPixels++;
            for (let channel = 0; channel < 3; channel++) {
                const difference = Math.abs(a[offset + channel] - b[offset + channel]);
                maxAbs = Math.max(maxAbs, difference);
                sum += difference;
                squares += difference * difference;
                heatmap[offset + channel] = difference * 10;
            }
        }
    return {
        heatmap,
        metrics: {
            comparedPixels,
            maskedPixels,
            maxAbs,
            meanAbs: comparedPixels === 0 ? 0 : sum / (comparedPixels * 3),
            rms: comparedPixels === 0 ? 0 : Math.sqrt(squares / (comparedPixels * 3)),
        },
    };
}
