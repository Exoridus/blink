import { getAudioContext } from '@codexo/exojs';

import type { SourceType } from '../ui/StartScreen';

export interface SourceRequest {
    type: SourceType;
    url?: string;
    file?: File;
}

export interface AcquiredSource {
    source: MediaStream | AudioNode | null;
    cleanup: () => void;
}

const AUDIO_LOAD_TIMEOUT_MS = 20000;

export const acquireSource = async (request: SourceRequest): Promise<AcquiredSource> => {
    const audioContext = getAudioContext();
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    switch (request.type) {
        case 'mic':
            return acquireMic();
        case 'screen':
            return acquireScreen();
        case 'url':
            if (!request.url) throw new Error('URL fehlt.');
            return acquireFromUrl(audioContext, request.url);
        case 'upload':
            if (!request.file) throw new Error('Datei fehlt.');
            return acquireFromFile(audioContext, request.file);
    }
};

const acquireMic = async (): Promise<AcquiredSource> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return {
        source: stream,
        cleanup: () => {
            for (const track of stream.getTracks()) track.stop();
        },
    };
};

const acquireScreen = async (): Promise<AcquiredSource> => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
        for (const track of stream.getTracks()) track.stop();
        throw new Error('Kein Audio-Track ausgewählt — beim Browser-Dialog "Audio teilen" aktivieren.');
    }

    for (const track of stream.getVideoTracks()) track.stop();

    const audioStream = new MediaStream(audioTracks);

    return {
        source: audioStream,
        cleanup: () => {
            for (const track of audioStream.getTracks()) track.stop();
        },
    };
};

const acquireFromUrl = async (audioContext: AudioContext, url: string): Promise<AcquiredSource> => {
    // Try with CORS first — needed to tap audio for visualization.
    try {
        return await loadAudio(audioContext, url, { useCors: true, tap: true });
    } catch (error) {
        if (!isLikelyCorsError(error)) throw error;
    }

    // CORS not available — play audibly without analysis. Visualizer will idle.
    console.warn(
        '[blink] Stream sendet keine CORS-Header — Visualizer wird nicht reagieren. ' +
            'Audio wird trotzdem abgespielt.'
    );
    return loadAudio(audioContext, url, { useCors: false, tap: false });
};

const acquireFromFile = async (audioContext: AudioContext, file: File): Promise<AcquiredSource> => {
    const objectUrl = URL.createObjectURL(file);
    try {
        const acquired = await loadAudio(audioContext, objectUrl, { useCors: false, tap: true });
        return {
            source: acquired.source,
            cleanup: () => {
                acquired.cleanup();
                URL.revokeObjectURL(objectUrl);
            },
        };
    } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
    }
};

interface LoadOptions {
    useCors: boolean;
    tap: boolean;
}

const loadAudio = async (audioContext: AudioContext, url: string, options: LoadOptions): Promise<AcquiredSource> => {
    const audioElement = new Audio();
    if (options.useCors) {
        audioElement.crossOrigin = 'anonymous';
    }
    audioElement.preload = 'auto';
    audioElement.loop = true;
    audioElement.src = url;

    try {
        await waitForCanPlay(audioElement, AUDIO_LOAD_TIMEOUT_MS);
    } catch (error) {
        audioElement.src = '';
        throw error;
    }

    if (options.tap) {
        const sourceNode = audioContext.createMediaElementSource(audioElement);
        sourceNode.connect(audioContext.destination);
        await audioElement.play();
        return {
            source: sourceNode,
            cleanup: () => {
                audioElement.pause();
                audioElement.src = '';
                sourceNode.disconnect();
            },
        };
    }

    await audioElement.play();
    return {
        source: null,
        cleanup: () => {
            audioElement.pause();
            audioElement.src = '';
        },
    };
};

const waitForCanPlay = (audioElement: HTMLAudioElement, timeoutMs: number): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
            audioElement.removeEventListener('canplay', onCanPlay);
            audioElement.removeEventListener('error', onError);
            clearTimeout(timeoutId);
        };
        const onCanPlay = (): void => {
            cleanup();
            resolve();
        };
        const onError = (): void => {
            cleanup();
            const code = audioElement.error?.code;
            const message =
                code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                    ? 'Audio-Format nicht unterstützt oder Server blockiert CORS.'
                    : 'Audio konnte nicht geladen werden.';
            reject(new Error(message));
        };
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error(`Audio-Load-Timeout nach ${timeoutMs / 1000}s — Stream nicht erreichbar?`));
        }, timeoutMs);

        audioElement.addEventListener('canplay', onCanPlay, { once: true });
        audioElement.addEventListener('error', onError, { once: true });
    });
};

const isLikelyCorsError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    return error.message.includes('CORS') || error.message.includes('nicht unterstützt');
};
