export interface OutputSettings {
    readonly width: number;
    readonly height: number;
    readonly fitting: 'contain' | 'cover' | 'fill';
    readonly fpsCap: number;
    readonly uiScale: number;
}

export const DEFAULT_OUTPUT: OutputSettings = Object.freeze({
    width: 1920,
    height: 1080,
    fitting: 'contain',
    fpsCap: 144,
    uiScale: 1,
});
export const OUTPUT_PRESETS = [
    [1920, 1080],
    [1280, 720],
    [2560, 1440],
    [3840, 2160],
    [1080, 1920],
    [1024, 1024],
] as const;

export function validateOutput(settings: OutputSettings): OutputSettings {
    if (
        ![settings.width, settings.height].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 8192) ||
        !['contain', 'cover', 'fill'].includes(settings.fitting) ||
        !Number.isFinite(settings.fpsCap) ||
        settings.fpsCap < 1 ||
        settings.fpsCap > 240 ||
        ![0.5, 0.75, 1, 1.25, 1.5].includes(settings.uiScale)
    )
        throw new RangeError('Invalid output settings');
    return Object.freeze({ ...settings });
}

export function fitRectangle(
    width: number,
    height: number,
    previewWidth: number,
    previewHeight: number,
    fitting: OutputSettings['fitting']
): { x: number; y: number; width: number; height: number } {
    if (fitting === 'fill') return { x: 0, y: 0, width: previewWidth, height: previewHeight };
    const scale = (fitting === 'contain' ? Math.min : Math.max)(previewWidth / width, previewHeight / height);
    return {
        x: (previewWidth - width * scale) / 2,
        y: (previewHeight - height * scale) / 2,
        width: width * scale,
        height: height * scale,
    };
}

/** Maps CSS pixels into top-left output pixels; letterbox regions have no scene coordinate. */
export function mapPreviewPoint(
    x: number,
    y: number,
    width: number,
    height: number,
    settings: OutputSettings
): readonly [number, number] | null {
    if (width <= 0 || height <= 0) return null;
    const rect = fitRectangle(settings.width, settings.height, width, height, settings.fitting);
    const px = ((x - rect.x) / rect.width) * settings.width;
    const py = ((y - rect.y) / rect.height) * settings.height;
    return px < 0 || px > settings.width || py < 0 || py > settings.height ? null : [px, py];
}

export function fitCanvas(canvas: HTMLCanvasElement, settings: OutputSettings, width: string, height: string): void {
    Object.assign(canvas.style, {
        width,
        height,
        objectFit: settings.fitting,
        objectPosition: '50% 50%',
        background: '#000',
    });
}
