export interface PlaybackResult {
    success: boolean;
    durationMs: number;
    startTimestamp: string;
    endTimestamp: string;
    error?: string;
}

export interface PlaybackOptions {
    startSeconds?: number;
    stopSeconds?: number;
}

export async function playProbeWav(probeUrl: string, options?: PlaybackOptions): Promise<PlaybackResult> {
    const startS = options?.startSeconds ?? 0;
    const stopS = options?.stopSeconds;

    return new Promise<PlaybackResult>((resolve, _reject) => {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = probeUrl;

        let played = false;
        const MAX_WAIT = 120_000;

        const cleanup = (): void => {
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
            audio.removeEventListener('loadedmetadata', onLoaded);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('seeked', onSeeked);
            audio.pause();
            audio.src = '';
        };

        const timeoutId = setTimeout(() => {
            if (!played) {
                cleanup();
                resolve({
                    success: false,
                    durationMs: 0,
                    startTimestamp: '',
                    endTimestamp: '',
                    error: `Playback timed out after ${MAX_WAIT}ms`,
                });
            }
        }, MAX_WAIT);

        const finish = (): void => {
            if (played) return;
            played = true;
            clearTimeout(timeoutId);
            const end = new Date().toISOString();
            cleanup();
            resolve({
                success: true,
                durationMs: Math.round(audio.currentTime * 1000),
                startTimestamp: start,
                endTimestamp: end,
            });
        };

        const onEnded = (): void => {
            finish();
        };

        const onTimeUpdate = (): void => {
            if (stopS !== undefined && audio.currentTime >= stopS) {
                finish();
            }
        };

        const onError = (e: Event): void => {
            clearTimeout(timeoutId);
            cleanup();
            const target = e.target as HTMLAudioElement;
            const error = target.error;
            let message = 'Unknown playback error';
            if (error) {
                switch (error.code) {
                    case MediaError.MEDIA_ERR_ABORTED:
                        message = 'Playback aborted';
                        break;
                    case MediaError.MEDIA_ERR_NETWORK:
                        message = 'Network error loading probe';
                        break;
                    case MediaError.MEDIA_ERR_DECODE:
                        message = 'Probe WAV decode error';
                        break;
                    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        message = 'Probe format not supported';
                        break;
                }
            }
            resolve({ success: false, durationMs: 0, startTimestamp: '', endTimestamp: '', error: message });
        };

        const onLoaded = (): void => {
            audio.removeEventListener('loadedmetadata', onLoaded);
        };

        const onSeeked = (): void => {
            audio.removeEventListener('seeked', onSeeked);
            audio.addEventListener('timeupdate', onTimeUpdate);
            audio.addEventListener('ended', onEnded);
            audio.addEventListener('error', onError);
            audio
                .play()
                .then(() => {
                    // started
                })
                .catch((err: unknown) => {
                    clearTimeout(timeoutId);
                    cleanup();
                    const message =
                        err instanceof DOMException && err.name === 'NotAllowedError'
                            ? 'Browser blocked probe playback (autoplay restriction). Click once in the page and retry.'
                            : `Playback rejected: ${err instanceof Error ? err.message : String(err)}`;
                    resolve({ success: false, durationMs: 0, startTimestamp: '', endTimestamp: '', error: message });
                });
        };

        audio.addEventListener('loadedmetadata', onLoaded);

        const start = new Date().toISOString();

        if (startS > 0) {
            audio.addEventListener('loadedmetadata', () => {
                audio.currentTime = startS;
            });
            audio.addEventListener('seeked', onSeeked);
        } else {
            audio.addEventListener('loadedmetadata', onLoaded);
            audio.addEventListener('ended', onEnded);
            audio.addEventListener('error', onError);
            audio
                .play()
                .then(() => {
                    // started
                })
                .catch((err: unknown) => {
                    clearTimeout(timeoutId);
                    cleanup();
                    const message =
                        err instanceof DOMException && err.name === 'NotAllowedError'
                            ? 'Browser blocked probe playback (autoplay restriction). Click once in the page and retry.'
                            : `Playback rejected: ${err instanceof Error ? err.message : String(err)}`;
                    resolve({ success: false, durationMs: 0, startTimestamp: '', endTimestamp: '', error: message });
                });
        }
    });
}
