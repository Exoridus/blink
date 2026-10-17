const SPECTRUM_FRAME_BYTES = 16384;
const LEVELTRAIL_FRAME_BYTES = 6400;

export type ProbeSessionState = 'idle' | 'running' | 'finalizing' | 'done' | 'cancelled';

export interface ProbeSessionOptions {
    probeId: string;
    expectedDurationSeconds: number;
    preRollSeconds?: number;
    postRollSeconds?: number;
}

export interface ProbeSessionStatus {
    state: ProbeSessionState;
    startTimestamp: number;
    elapsedMs: number;
    framesCaptured: number;
    expectedFramesApprox: number;
    remainingMsApprox: number;
    totalExpectedDurationMs: number;
}

export interface ProbeSessionResult {
    framesCaptured: number;
    totalDurationMs: number;
    manifest: Record<string, unknown>;
}

interface FrameIndexEntry {
    frameIndex: number;
    timestampMs: number;
    spectrumOffsetBytes: number;
    leveltrailOffsetBytes: number;
}

export class BlinkAudioProbeSessionRecorder {
    readonly probeId: string;
    readonly expectedDurationSeconds: number;
    readonly preRollSeconds: number;
    readonly postRollSeconds: number;
    readonly expectedCaptureSeconds: number;

    private _state: ProbeSessionState = 'idle';
    private _startTimeMs = 0;
    private _stopTimeMs = 0;
    private _frameIndex = 0;

    private _spectrumChunks: Uint8Array[] = [];
    private _leveltrailChunks: Uint8Array[] = [];
    private _indexEntries: FrameIndexEntry[] = [];

    private _spectrumTotalBytes = 0;
    private _leveltrailTotalBytes = 0;

    private _captureStartTimestamp = '';
    private _captureStopTimestamp = '';
    private _renderFrameAtStart = 0;
    private _renderFrameAtStop = 0;

    private _playbackStartTimestamp = '';
    private _playbackEndTimestamp = '';
    private _playbackDurationMs = 0;
    private _probeUrl = '';

    constructor(options: ProbeSessionOptions, renderFrameIndex: number) {
        this.probeId = options.probeId;
        this.expectedDurationSeconds = options.expectedDurationSeconds;
        this.preRollSeconds = options.preRollSeconds ?? 1;
        this.postRollSeconds = options.postRollSeconds ?? 3;
        this.expectedCaptureSeconds = this.preRollSeconds + this.expectedDurationSeconds + this.postRollSeconds;
        this._renderFrameAtStart = renderFrameIndex;
        this._renderFrameAtStop = renderFrameIndex;
    }

    get state(): ProbeSessionState {
        return this._state;
    }

    get framesCaptured(): number {
        return this._frameIndex;
    }

    get spectrumTotalBytes(): number {
        return this._spectrumTotalBytes;
    }

    get leveltrailTotalBytes(): number {
        return this._leveltrailTotalBytes;
    }

    get indexEntries(): readonly FrameIndexEntry[] {
        return this._indexEntries;
    }

    start(): void {
        if (this._state !== 'idle') {
            throw new Error(`Cannot start session in state: ${this._state}`);
        }
        this._state = 'running';
        this._startTimeMs = Date.now();
        this._captureStartTimestamp = new Date().toISOString();
        this._frameIndex = 0;
    }

    cancel(): void {
        if (this._state === 'running') {
            this._state = 'cancelled';
            this._stopTimeMs = Date.now();
            this._captureStopTimestamp = new Date().toISOString();
        }
    }

    finalize(renderFrameIndex: number): ProbeSessionResult {
        if (this._state !== 'running') {
            throw new Error(`Cannot finalize session in state: ${this._state}`);
        }
        this._state = 'finalizing';
        this._stopTimeMs = Date.now();
        this._captureStopTimestamp = new Date().toISOString();
        this._renderFrameAtStop = renderFrameIndex;

        try {
            this._state = 'done';
        } catch {
            this._state = 'cancelled';
            throw new Error('Session finalization failed');
        }

        const totalDurationMs = this._stopTimeMs - this._startTimeMs;
        return {
            framesCaptured: this._frameIndex,
            totalDurationMs,
            manifest: this.buildManifest(),
        };
    }

    appendFrame(
        spectrumBytes: ArrayBuffer | Uint8Array,
        leveltrailBytes: ArrayBuffer | Uint8Array,
        renderFrameIndex: number
    ): void {
        if (this._state !== 'running') return;

        // Copied: the caller passes views of buffers it overwrites on the next frame, and a stored
        // view would show every recorded frame as the last one.
        const specU8 = new Uint8Array(
            spectrumBytes instanceof Uint8Array ? spectrumBytes : new Uint8Array(spectrumBytes)
        );
        const trailU8 = new Uint8Array(
            leveltrailBytes instanceof Uint8Array ? leveltrailBytes : new Uint8Array(leveltrailBytes)
        );

        this._spectrumChunks.push(specU8);
        this._leveltrailChunks.push(trailU8);

        const specOffset = this._spectrumTotalBytes;
        const trailOffset = this._leveltrailTotalBytes;
        this._spectrumTotalBytes += specU8.byteLength;
        this._leveltrailTotalBytes += trailU8.byteLength;

        this._indexEntries.push({
            frameIndex: this._frameIndex,
            timestampMs: Date.now(),
            spectrumOffsetBytes: specOffset,
            leveltrailOffsetBytes: trailOffset,
        });

        this._frameIndex++;
        this._renderFrameAtStop = renderFrameIndex;
    }

    setPlaybackInfo(probeUrl: string, startTs: string, endTs: string, durationMs: number): void {
        this._probeUrl = probeUrl;
        this._playbackStartTimestamp = startTs;
        this._playbackEndTimestamp = endTs;
        this._playbackDurationMs = durationMs;
    }

    buildSpectrumBin(): Uint8Array {
        const total = this._spectrumTotalBytes;
        const result = new Uint8Array(total);
        let offset = 0;
        for (const chunk of this._spectrumChunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return result;
    }

    buildLeveltrailBin(): Uint8Array {
        const total = this._leveltrailTotalBytes;
        const result = new Uint8Array(total);
        let offset = 0;
        for (const chunk of this._leveltrailChunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return result;
    }

    buildFrameIndexJsonl(): string {
        return `${this._indexEntries.map(e => JSON.stringify(e)).join('\n')}\n`;
    }

    buildManifest(): Record<string, unknown> {
        const totalDurationMs = this._stopTimeMs - this._startTimeMs;
        const fpsEstimate = totalDurationMs > 0 ? this._frameIndex / (totalDurationMs / 1000) : 0;

        const result: Record<string, unknown> = {
            source: 'blink',
            sessionType: 'surface-session',
            createdAt: new Date().toISOString(),
            probe: {
                id: this.probeId,
                expectedDurationSeconds: this.expectedDurationSeconds,
                knownSha256: '71f8b3efbd2e4919ba7e0919315e3999d6bbe477174a6dcb24e274680eac24e6',
            },
            capture: {
                preRollSeconds: this.preRollSeconds,
                postRollSeconds: this.postRollSeconds,
                expectedCaptureSeconds: this.expectedCaptureSeconds,
                actualFramesCaptured: this._frameIndex,
                fpsEstimate: Math.round(fpsEstimate * 100) / 100,
                captureStartTimestamp: this._captureStartTimestamp,
                captureStopTimestamp: this._captureStopTimestamp,
            },
            buffers: {
                spectrum: {
                    frameByteLength: SPECTRUM_FRAME_BYTES,
                    width: 1024,
                    channels: ['raw', 'juiced', 'smooth', 'waveform'],
                },
                leveltrail: {
                    frameByteLength: LEVELTRAIL_FRAME_BYTES,
                    width: 400,
                    channels: ['all', 'bass', 'mid', 'high'],
                },
            },
            runtime: {
                renderFrameAtStart: this._renderFrameAtStart,
                renderFrameAtStop: this._renderFrameAtStop,
            },
            binaryStreams: {
                spectrumFramesBin: 'spectrum_frames.bin',
                leveltrailFramesBin: 'leveltrail_frames.bin',
                frameIndexJsonl: 'frame_index.jsonl',
                spectrumTotalBytes: this._spectrumTotalBytes,
                leveltrailTotalBytes: this._leveltrailTotalBytes,
            },
        };

        if (this._probeUrl) {
            result.playback = {
                mode: 'browser-audio-element',
                probeUrl: this._probeUrl,
                playbackStartTimestamp: this._playbackStartTimestamp,
                playbackEndTimestamp: this._playbackEndTimestamp,
                playbackDurationMs: this._playbackDurationMs,
                expectedDurationSeconds: this.expectedDurationSeconds,
            };
        }

        return result;
    }

    getStatus(): ProbeSessionStatus {
        const now = Date.now();
        const elapsed = this._state === 'running' ? now - this._startTimeMs : 0;
        const totalExpected = this.expectedCaptureSeconds * 1000;
        const remaining = Math.max(0, totalExpected - elapsed);
        const approxFrames = Math.round(this.expectedCaptureSeconds * 60);

        return {
            state: this._state,
            startTimestamp: this._startTimeMs,
            elapsedMs: elapsed,
            framesCaptured: this._frameIndex,
            expectedFramesApprox: approxFrames,
            remainingMsApprox: remaining,
            totalExpectedDurationMs: totalExpected,
        };
    }

    destroy(): void {
        this._spectrumChunks.length = 0;
        this._leveltrailChunks.length = 0;
        this._indexEntries.length = 0;
        this._spectrumTotalBytes = 0;
        this._leveltrailTotalBytes = 0;
        this._frameIndex = 0;
    }
}
