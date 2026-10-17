import { Signal, Texture } from '@codexo/exojs';

export type MediaInputKind = 'none' | 'camera' | 'file';

export interface MediaInputState {
    readonly kind: MediaInputKind;
    readonly label: string;
}

/**
 * Texture whose canvas holds the media upside down. Shader uv origin is bottom-left while decoded
 * media starts at the top row, and the texture upload here does not flip, so the flip is baked in.
 */
class FlippedSource {
    public readonly texture: Texture;
    private readonly canvas = document.createElement('canvas');
    private readonly context: CanvasRenderingContext2D;

    public constructor(private readonly media: HTMLImageElement | HTMLVideoElement) {
        const context = this.canvas.getContext('2d');
        if (context === null) throw new Error('Canvas 2D wird nicht unterstützt.');
        this.context = context;
        this.draw();
        this.texture = new Texture(this.canvas);
    }

    public refresh(): void {
        this.draw();
        this.texture.updateSource();
    }

    private draw(): void {
        const width = this.media instanceof HTMLVideoElement ? this.media.videoWidth : this.media.naturalWidth;
        const height = this.media instanceof HTMLVideoElement ? this.media.videoHeight : this.media.naturalHeight;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        this.context.setTransform(1, 0, 0, -1, 0, height);
        this.context.drawImage(this.media, 0, 0, width, height);
    }
}

/**
 * Supplies the camera, a video file or an image to effects that declare an `image` host input.
 *
 * `texture` keeps its identity while a source plays, and its version advances with every new
 * video frame. Switching the source replaces the texture and fires `onChange`.
 */
export class MediaInputService {
    public readonly onChange = new Signal<[]>();

    private currentTexture: Texture | null = null;
    private currentState: MediaInputState = { kind: 'none', label: '' };
    private video: HTMLVideoElement | null = null;
    private stream: MediaStream | null = null;
    private objectUrl: string | null = null;
    private frameLoop = 0;
    private generation = 0;

    public get texture(): Texture | null {
        return this.currentTexture;
    }

    public get state(): MediaInputState {
        return this.currentState;
    }

    /** Rejects when the browser has no camera, or the user denies access. */
    public async useCamera(): Promise<void> {
        if (navigator.mediaDevices?.getUserMedia === undefined) throw new Error('Kamera wird nicht unterstützt.');
        const generation = ++this.generation;
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (generation !== this.generation) {
            for (const track of stream.getTracks()) track.stop();
            return;
        }
        const video = this.createVideo();
        video.srcObject = stream;
        await this.adopt(generation, video, { kind: 'camera', label: 'Kamera' }, stream, null);
    }

    /** Accepts any image or video file the browser can decode; rejects otherwise. */
    public async useFile(file: File): Promise<void> {
        const generation = ++this.generation;
        const url = URL.createObjectURL(file);
        try {
            if (file.type.startsWith('image/')) {
                const image = new Image();
                image.src = url;
                await image.decode();
                if (generation !== this.generation) return URL.revokeObjectURL(url);
                this.release();
                this.objectUrl = url;
                this.install(new FlippedSource(image), { kind: 'file', label: file.name }, null);
                return;
            }
            const video = this.createVideo();
            video.src = url;
            await this.adopt(generation, video, { kind: 'file', label: file.name }, null, url);
        } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
        }
    }

    public clear(): void {
        this.generation++;
        this.release();
        this.currentState = { kind: 'none', label: '' };
        this.onChange.dispatch();
    }

    public dispose(): void {
        this.generation++;
        this.release();
        this.currentState = { kind: 'none', label: '' };
        this.onChange.destroy();
    }

    private createVideo(): HTMLVideoElement {
        const video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        return video;
    }

    private async adopt(
        generation: number,
        video: HTMLVideoElement,
        state: MediaInputState,
        stream: MediaStream | null,
        url: string | null
    ): Promise<void> {
        try {
            await new Promise<void>((resolve, reject) => {
                video.addEventListener('loadeddata', () => resolve(), { once: true });
                video.addEventListener('error', () => reject(new Error('Mediendatei konnte nicht gelesen werden.')), {
                    once: true,
                });
            });
            await video.play();
        } catch (error) {
            if (stream !== null) for (const track of stream.getTracks()) track.stop();
            throw error;
        }
        if (generation !== this.generation) {
            if (stream !== null) for (const track of stream.getTracks()) track.stop();
            if (url !== null) URL.revokeObjectURL(url);
            return;
        }
        this.release();
        this.stream = stream;
        this.objectUrl = url;
        this.video = video;
        this.install(new FlippedSource(video), state, video);
    }

    private install(source: FlippedSource, state: MediaInputState, video: HTMLVideoElement | null): void {
        this.currentTexture = source.texture;
        this.currentState = state;
        if (video !== null) this.startFrameLoop(video, source);
        this.onChange.dispatch();
    }

    private startFrameLoop(video: HTMLVideoElement, source: FlippedSource): void {
        const loop = this.frameLoop + 1;
        this.frameLoop = loop;
        const pump = (): void => {
            if (this.frameLoop !== loop) return;
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) source.refresh();
            if (video.requestVideoFrameCallback !== undefined) video.requestVideoFrameCallback(pump);
            else requestAnimationFrame(pump);
        };
        pump();
    }

    private release(): void {
        this.frameLoop++;
        this.video?.pause();
        if (this.video !== null) this.video.srcObject = null;
        this.video = null;
        if (this.stream !== null) for (const track of this.stream.getTracks()) track.stop();
        this.stream = null;
        if (this.objectUrl !== null) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
        this.currentTexture?.destroy();
        this.currentTexture = null;
    }
}
