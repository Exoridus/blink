export type BufferKind = 'spectrum' | 'histogram';

export interface BlinkAudioSurfaceDump {
    kind: BufferKind;
    width: number;
    channels: number;
    floatCount: number;
    byteLength: number;
    channelLayout: string[];
    timestamp: string;
    frameIndex: number | null;
    seriesIndex: number | null;
    bytes: ArrayBuffer;
}

export interface BlinkAudioSurfaceSnapshot {
    source: 'blink';
    capturedAt: string;
    frameIndex: number | null;
    seriesIndex: number | null;
    spectrum: BlinkAudioSurfaceDump;
    histogram: BlinkAudioSurfaceDump;
}

export interface BlinkAudioDebugBridge {
    captureSurfaces(): void;
    captureSeries(options?: BlinkAudioCaptureSeriesOptions): void;
    getLastSnapshot(): BlinkAudioSurfaceSnapshot | null;
    captureProbeSession(options: BlinkAudioProbeSessionOptions): Promise<BlinkAudioProbeSessionResult>;
    captureAndPlayProbeSession(options: BlinkAudioProbePlaybackSessionOptions): Promise<BlinkAudioProbeSessionResult>;
    captureSpectrumStageProbeSession(
        options: BlinkAudioSpectrumStageSessionOptions
    ): Promise<BlinkAudioProbeSessionResult>;
    getProbeSessionStatus(): BlinkAudioProbeSessionStatus | null;
    cancelProbeSession(): void;
    getCurrentAudioSurfaceStats(): BlinkAudioSurfaceStats;
    getCurrentSpectrumCoverageStats(): Record<string, number | string>;
}

export interface BlinkAudioSpectrumStageSessionOptions {
    probeUrl: string;
    probeId: string;
    expectedDurationSeconds: number;
    preRollSeconds?: number;
    postRollSeconds?: number;
    playbackStartSeconds?: number;
    playbackStopSeconds?: number;
    analyserSmoothingTimeConstant?: number;
}

export interface BlinkAudioProbePlaybackSessionOptions {
    probeUrl: string;
    probeId: string;
    expectedDurationSeconds?: number;
    preRollSeconds?: number;
    postRollSeconds?: number;
}

export interface BlinkAudioProbeSessionOptions {
    probeId: string;
    expectedDurationSeconds: number;
    preRollSeconds?: number;
    postRollSeconds?: number;
}

export interface BlinkAudioProbeSessionResult {
    framesCaptured: number;
    totalDurationMs: number;
    manifest: Record<string, unknown>;
}

export interface BlinkAudioProbeSessionStatus {
    state: 'idle' | 'running' | 'finalizing' | 'done' | 'cancelled';
    startTimestamp: number;
    elapsedMs: number;
    framesCaptured: number;
    expectedFramesApprox: number;
    remainingMsApprox: number;
    totalExpectedDurationMs: number;
}

export interface BlinkAudioSurfaceStats {
    spectrum: {
        raw: { min: number; max: number; mean: number };
        juiced: { min: number; max: number; mean: number };
        smooth: { min: number; max: number; mean: number };
        waveform: { min: number; max: number; mean: number; rmsDeviation: number };
    };
    histogram: {
        all: { min: number; max: number; mean: number };
        bass: { min: number; max: number; mean: number };
        mid: { min: number; max: number; mean: number };
        high: { min: number; max: number; mean: number };
    };
    hasChanged: boolean;
}

export interface BlinkAudioCaptureSeriesOptions {
    everyFrames?: number;
    maxSnapshots?: number;
}

export function serializeDumpToUint8(dump: BlinkAudioSurfaceDump): Uint8Array {
    return new Uint8Array(dump.bytes);
}

function buildIsoTimestamp(): string {
    return new Date().toISOString().replaceAll(/[:.]/g, '-');
}

function triggerDownload(filename: string, data: ArrayBuffer | Uint8Array): void {
    const blob = new Blob([data as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function downloadSurfaceSnapshot(snapshot: BlinkAudioSurfaceSnapshot): void {
    const ts = buildIsoTimestamp();

    triggerDownload(`blink_spectrum_${ts}.bin`, snapshot.spectrum.bytes);
    triggerDownload(`blink_histogram_${ts}.bin`, snapshot.histogram.bytes);

    const metadata = {
        source: snapshot.source,
        capturedAt: snapshot.capturedAt,
        frameIndex: snapshot.frameIndex,
        seriesIndex: snapshot.seriesIndex,
        spectrum: {
            file: `blink_spectrum_${ts}.bin`,
            width: snapshot.spectrum.width,
            channels: snapshot.spectrum.channels,
            floatCount: snapshot.spectrum.floatCount,
            byteLength: snapshot.spectrum.byteLength,
            channelLayout: snapshot.spectrum.channelLayout,
        },
        histogram: {
            file: `blink_histogram_${ts}.bin`,
            width: snapshot.histogram.width,
            channels: snapshot.histogram.channels,
            floatCount: snapshot.histogram.floatCount,
            byteLength: snapshot.histogram.byteLength,
            channelLayout: snapshot.histogram.channelLayout,
        },
    };

    const json = JSON.stringify(metadata, null, 2);
    const jsonBytes = new TextEncoder().encode(json);
    triggerDownload(`blink_audio_surface_capture_${ts}.json`, jsonBytes);
}
