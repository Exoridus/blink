/* global document, window */
import { Application } from '../../src/classes/Application.ts';
import { readSsfDirectory } from '../../src/packages/ssf/package.ts';
import { AudioService } from '../../src/services/AudioService.ts';
import { BlinkFxService } from '../../src/services/BlinkFxService.ts';
import { EnvService } from '../../src/services/EnvService.ts';
import { RenderService } from '../../src/services/RenderService.ts';
import { UniformType } from '../../src/types.ts';
import { getAudioContext } from '@codexo/exojs';

export type PreviewPackage = Pick<
    import('../../src/services/BlinkFxService.ts').BlinkFxPackageListItem,
    'id' | 'title' | 'basePath' | 'sourceFiles'
>;
export interface PreviewOptions {
    pkg: PreviewPackage;
    framesToRender: number;
    timeoutMs: number;
    width: number;
    height: number;
}

async function declaredThumbnail(pkg: PreviewPackage) {
    const response = await fetch(`${pkg.basePath}/${pkg.sourceFiles ? 'scene.json' : 'manifest.json'}`);
    if (!response.ok) return null;
    const metadata: { IMAGE_PATH?: unknown; thumbnail?: unknown } = pkg.sourceFiles
        ? (readSsfDirectory(new Map([['scene.json', new Uint8Array(await response.arrayBuffer())]]), pkg.id)
              .sceneJson as { IMAGE_PATH?: unknown; thumbnail?: unknown })
        : ((await response.json()) as { IMAGE_PATH?: unknown; thumbnail?: unknown });
    const path = metadata?.IMAGE_PATH ?? metadata?.thumbnail;
    return typeof path === 'string' && path.length > 0 ? `${pkg.basePath}/${path}` : null;
}

/** Produces a static fallback from the package's declared image, or retains its empty output. */
export async function previewFallback(pkg: PreviewPackage, width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    let source = 'blank';
    const path = await declaredThumbnail(pkg).catch(() => null);
    if (path !== null) {
        try {
            const image = new window.Image();
            image.src = path;
            await image.decode();
            const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
            const w = image.naturalWidth * scale;
            const h = image.naturalHeight * scale;
            context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
            source = 'declared-thumbnail';
        } catch {
            /* A missing declared image leaves the rendered blank state visible. */
        }
    }
    return { dataUrl: canvas.toDataURL('image/png'), source };
}

/** Runs the production loading, audio and render paths before capturing the preserved framebuffer. */
export async function renderEffectPreview({ pkg, framesToRender, timeoutMs, width, height }: PreviewOptions) {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const context = getAudioContext();
    await context.resume();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 80;
    const gain = context.createGain();
    gain.gain.value = 0.1;
    oscillator.connect(gain);
    oscillator.start();
    const audio = new AudioService(gain, 2048);
    const U = UniformType;
    const uniforms: import('../../src/types.ts').GlobalUniforms = {
        TIME: U.FLOAT,
        TIMEDELTA: U.FLOAT,
        FRAMECOUNT: U.INT,
        PASSINDEX: U.INT,
        RESOLUTION: U.FLOAT_VEC2,
        DATE: U.FLOAT_VEC4,
        SURFACEPOSITION: U.FLOAT_VEC2,
        MOUSE: U.FLOAT_VEC4,
        BASS: U.FLOAT_VEC4,
        MID: U.FLOAT_VEC4,
        TREBLE: U.FLOAT_VEC4,
        BASSTIME: U.FLOAT,
        MIDTIME: U.FLOAT,
        TREBLETIME: U.FLOAT,
        BPM: U.INT,
    };
    const render = new RenderService(
        audio,
        {
            view: canvas,
            width,
            height,
            backgroundColor: 0,
            backgroundAlpha: 1,
            useContextAlpha: false,
            antialias: false,
            clearBeforeRender: true,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
            backend: 'webgl2',
        },
        uniforms
    );
    render.setOutputSettings({ width, height, fitting: 'contain', fpsCap: 60, uiScale: 1 });
    const app = new Application(new EnvService('production', 'previews'), render, new BlinkFxService());
    let faults: readonly import('../../src/runtime/health/FaultGuard.ts').FaultRecord[] = [];
    app.subscribeState(state => {
        faults = state.faults ?? [];
    });
    try {
        await app.init(pkg.id);
        let frames = 0;
        await new Promise<void>((resolve, reject) => {
            const deadline = window.setTimeout(
                () => reject(new Error('Timed out waiting for preview frames')),
                timeoutMs - 1000
            );
            const observe = () => {
                frames++;
                if (frames >= framesToRender || faults.length > 0) {
                    window.clearTimeout(deadline);
                    render.onUpdate.remove(observe);
                    resolve();
                }
            };
            render.onUpdate.add(observe);
        });
        const gl = canvas.getContext('webgl2')!;
        gl.finish();
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const gpuError = gl.getError();
        let litPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] || pixels[i + 1] || pixels[i + 2]) litPixels++;
        if (faults.length !== 0 || gpuError !== 0)
            throw new Error(`Preview render failed: ${JSON.stringify({ faults, gpuError })}`);
        const image =
            litPixels === 0
                ? await previewFallback(pkg, width, height)
                : { dataUrl: canvas.toDataURL('image/png'), source: 'rendered' };
        return { ...image, frames, gpuError, litPixels };
    } finally {
        await app.destroy();
        oscillator.stop();
        gain.disconnect();
        canvas.remove();
    }
}
