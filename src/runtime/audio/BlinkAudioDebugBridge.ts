import type { ProbeSessionOptions, ProbeSessionResult, ProbeSessionStatus } from './BlinkAudioProbeSessionRecorder';
import { BlinkAudioProbeSessionRecorder } from './BlinkAudioProbeSessionRecorder';
import { buildProbeSessionZip, triggerProbeSessionDownload } from './BlinkAudioProbeSessionZip';
import type { SpectrumStageFrame, SpectrumStageSessionOptions } from './BlinkAudioSpectrumStageRecorder';
import { BlinkAudioSpectrumStageRecorder } from './BlinkAudioSpectrumStageRecorder';
import type {
    BlinkAudioCaptureSeriesOptions,
    BlinkAudioDebugBridge,
    BlinkAudioProbePlaybackSessionOptions,
    BlinkAudioSurfaceSnapshot,
    BlinkAudioSurfaceStats,
} from './BlinkAudioSurfaceDump';
import { downloadSurfaceSnapshot } from './BlinkAudioSurfaceDump';
import type { BlinkAudioTextureRuntime } from './BlinkAudioTextureRuntime';
import { playProbeWav } from './BlinkProbePlayback';
import { buildSpectrumStageZip, triggerStageSessionDownload } from './BlinkSpectrumStageZip';

export function createBlinkAudioDebugBridge(
    textureRuntime: BlinkAudioTextureRuntime,
    getFrameIndex: () => number,
    getAnalyserDb?: () => Float32Array | null,
    getAnalyserMeta?: () => Record<string, unknown>
): BlinkAudioDebugBridge {
    let lastSnapshot: BlinkAudioSurfaceSnapshot | null = null;
    let seriesTimer: ReturnType<typeof setInterval> | null = null;
    let seriesRemaining = 0;
    let seriesIndex = 0;
    let probeSession: BlinkAudioProbeSessionRecorder | null = null;
    let probeSessionTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSurfaceStats: BlinkAudioSurfaceStats | undefined;

    function doCapture(): BlinkAudioSurfaceSnapshot {
        const raw = textureRuntime.captureSurfaceSnapshot();
        const snapshot: BlinkAudioSurfaceSnapshot = {
            ...raw,
            frameIndex: getFrameIndex(),
            seriesIndex: seriesIndex > 0 ? seriesIndex : null,
            spectrum: {
                ...raw.spectrum,
                frameIndex: getFrameIndex(),
                seriesIndex: seriesIndex > 0 ? seriesIndex : null,
            },
            histogram: {
                ...raw.histogram,
                frameIndex: getFrameIndex(),
                seriesIndex: seriesIndex > 0 ? seriesIndex : null,
            },
        };
        lastSnapshot = snapshot;
        return snapshot;
    }

    function captureSurfaces(): void {
        const snapshot = doCapture();
        downloadSurfaceSnapshot(snapshot);
    }

    function captureSeries(options?: BlinkAudioCaptureSeriesOptions): void {
        if (seriesTimer !== null) {
            clearInterval(seriesTimer);
            seriesTimer = null;
        }

        const everyFrames = options?.everyFrames ?? 60;
        const maxSnapshots = options?.maxSnapshots ?? 3;
        seriesRemaining = maxSnapshots;
        seriesIndex = 0;

        const snapshot = doCapture();
        downloadSurfaceSnapshot(snapshot);
        seriesRemaining--;
        seriesIndex++;

        if (seriesRemaining <= 0) return;

        const frameIntervalMs = Math.max(1, Math.round((everyFrames / 60) * 1000));
        seriesTimer = setInterval(() => {
            const snap = doCapture();
            downloadSurfaceSnapshot(snap);
            seriesRemaining--;
            seriesIndex++;

            if (seriesRemaining <= 0 && seriesTimer !== null) {
                clearInterval(seriesTimer);
                seriesTimer = null;
            }
        }, frameIntervalMs);
    }

    function getLastSnapshot(): BlinkAudioSurfaceSnapshot | null {
        return lastSnapshot;
    }

    // --- Probe session lifecycle primitives ---

    function startProbeSessionCapture(options: ProbeSessionOptions): BlinkAudioProbeSessionRecorder {
        if (probeSession !== null && probeSession.state === 'running') {
            throw new Error('A probe session is already running');
        }

        clearProbeSessionState();

        const recorder = new BlinkAudioProbeSessionRecorder(options, getFrameIndex());
        probeSession = recorder;
        recorder.start();

        textureRuntime.setProbeSessionCallback(
            (spectrumBuf: Float32Array, histogramBuf: Float32Array, frameIdx: number) => {
                recorder.appendFrame(
                    new Uint8Array(spectrumBuf.buffer, spectrumBuf.byteOffset, spectrumBuf.byteLength),
                    new Uint8Array(histogramBuf.buffer, histogramBuf.byteOffset, histogramBuf.byteLength),
                    frameIdx
                );
            }
        );

        return recorder;
    }

    function stopProbeSessionCapture(): ProbeSessionResult {
        if (probeSession?.state !== 'running') {
            throw new Error('No running probe session to stop');
        }

        textureRuntime.setProbeSessionCallback(null);
        const result = probeSession.finalize(getFrameIndex());

        const zipData = buildProbeSessionZip(probeSession);
        triggerProbeSessionDownload(zipData);

        probeSession.destroy();
        probeSession = null;

        return result;
    }

    function clearProbeSessionState(): void {
        if (probeSessionTimer !== null) {
            clearTimeout(probeSessionTimer);
            probeSessionTimer = null;
        }
        if (probeSession !== null) {
            textureRuntime.setProbeSessionCallback(null);
            probeSession.cancel();
            probeSession.destroy();
            probeSession = null;
        }
    }

    // --- Timer-based probe session (original behavior) ---

    function captureProbeSession(options: ProbeSessionOptions): Promise<ProbeSessionResult> {
        const recorder = startProbeSessionCapture(options);
        const totalMs = recorder.expectedCaptureSeconds * 1000;

        return new Promise<ProbeSessionResult>((resolve, reject) => {
            probeSessionTimer = setTimeout(() => {
                try {
                    const result = stopProbeSessionCapture();
                    probeSessionTimer = null;
                    resolve(result);
                } catch (err) {
                    clearProbeSessionState();
                    probeSessionTimer = null;
                    reject(err instanceof Error ? err : new Error(String(err)));
                }
            }, totalMs);
        });
    }

    // --- Playback-orchestrated probe session (with preflight guard) ---

    async function captureAndPlayProbeSession(
        options: BlinkAudioProbePlaybackSessionOptions
    ): Promise<ProbeSessionResult> {
        const probeId = options.probeId;
        const preRoll = options.preRollSeconds ?? 1;
        const postRoll = options.postRollSeconds ?? 3;
        const expectedDur = options.expectedDurationSeconds ?? 99;
        const probeUrl = options.probeUrl;

        const recorder = startProbeSessionCapture({
            probeId,
            expectedDurationSeconds: expectedDur,
            preRollSeconds: preRoll,
            postRollSeconds: postRoll,
        });

        try {
            // Preroll
            if (preRoll > 0) {
                await new Promise<void>(r => setTimeout(r, preRoll * 1000));
            }

            // Play probe
            recorder.setPlaybackInfo(
                probeUrl,
                new Date().toISOString(),
                '', // filled after playback
                0
            );

            const playResult = await playProbeWav(probeUrl);

            if (!playResult.success) {
                throw new Error(playResult.error ?? 'Probe playback failed');
            }

            // Update playback end info
            recorder.setPlaybackInfo(
                probeUrl,
                playResult.startTimestamp,
                playResult.endTimestamp,
                playResult.durationMs
            );

            // ── Preflight guard: check surface activity during continuous-tone section ──
            // The canonical probe has sparse clicks in 2-6s. Use the amplitude_step_sine
            // segment (10-20s) which has continuous 440 Hz audio at multiple levels.
            // Evaluate a 3s window from 10.5-13.5s with 100ms sampling for robust detection.
            const PREFLIGHT_START_S = 10.5;
            const PREFLIGHT_END_S = 13.5;
            const preflightWaitMs = Math.max(0, PREFLIGHT_START_S * 1000);
            const preflightWindowMs = (PREFLIGHT_END_S - PREFLIGHT_START_S) * 1000;

            // Wait for the preflight window to start
            await new Promise<void>(r => setTimeout(r, preflightWaitMs));

            // Sample through the preflight window
            const preflightFrames: BlinkAudioSurfaceStats[] = [];
            const preflightIntervalMs = 100;
            const preflightStart = Date.now();
            // Capture one immediate sample before starting interval loop
            preflightFrames.push(getCurrentAudioSurfaceStats());

            while (Date.now() - preflightStart < preflightWindowMs) {
                await new Promise<void>(r => setTimeout(r, preflightIntervalMs));
                preflightFrames.push(getCurrentAudioSurfaceStats());
            }

            // Evaluate preflight using activity-threshold criteria
            const preflightResult = evaluatePreflight(preflightFrames);

            if (!preflightResult.passed) {
                clearProbeSessionState();
                const msg = [
                    'Blink probe capture aborted:',
                    `probe playback started, but Blink audio surfaces remained below the expected activity threshold during the continuous-tone preflight window (${PREFLIGHT_START_S}–${PREFLIGHT_END_S}s).`,
                    "Desktop/system audio is not reaching Blink's analysis path, or the audio texture runtime is not receiving live analyzer data.",
                    '',
                    `  Frames evaluated: ${preflightResult.framesEvaluated}`,
                    `  Raw spectrum max: ${preflightResult.rawMax.toFixed(6)} (need > 0.01)`,
                    `  Waveform RMS deviation max: ${preflightResult.waveformRmsMax.toFixed(6)} (need > 0.001)`,
                    `  Has data changed: ${String(preflightResult.hasChanged)}`,
                ].join('\n');
                throw new Error(msg);
            }

            // Store preflight result in recorder for manifest
            recorder.setPlaybackInfo(
                probeUrl,
                playResult.startTimestamp,
                playResult.endTimestamp,
                playResult.durationMs
            );

            // Postroll
            if (postRoll > 0) {
                await new Promise<void>(r => setTimeout(r, postRoll * 1000));
            }

            // Finalize
            const result = stopProbeSessionCapture();
            return result;
        } catch (err) {
            clearProbeSessionState();
            throw err instanceof Error ? err : new Error(String(err));
        }
    }

    function evaluatePreflight(frames: BlinkAudioSurfaceStats[]): {
        passed: boolean;
        framesEvaluated: number;
        rawMax: number;
        rawMean: number;
        waveformRmsMax: number;
        waveformRmsMean: number;
        hasChanged: boolean;
    } {
        const rawMaxes = frames.map(f => f.spectrum.raw.max);
        const rawMeans = frames.map(f => f.spectrum.raw.mean);
        const wfDevs = frames.map(f => f.spectrum.waveform.rmsDeviation);
        const changed = frames.some(f => f.hasChanged);

        const rawMaxObserved = Math.max(...rawMaxes);
        const rawMeanObserved = rawMeans.reduce((a, b) => a + b, 0) / rawMeans.length;
        const wfMaxObserved = Math.max(...wfDevs);
        const wfMeanObserved = wfDevs.reduce((a, b) => a + b, 0) / wfDevs.length;

        // Activity-based criteria:
        // - Raw spectrum must show meaningful magnitude (max > threshold)
        //   This is the primary signal — FFT data proves audio is reaching Blink.
        // - Waveform deviation is a secondary check (advisory only; some
        //   ExoJS/analyser configs may produce flat waveform while FFT works).
        // - Data must have changed at least once.
        const rawOk = rawMaxObserved > 0.01;

        // Pass if raw spectrum is active AND data has changed.
        const passed = rawOk && changed;

        return {
            passed,
            framesEvaluated: frames.length,
            rawMax: rawMaxObserved,
            rawMean: rawMeanObserved,
            waveformRmsMax: wfMaxObserved,
            waveformRmsMean: wfMeanObserved,
            hasChanged: changed,
        };
    }

    function getCurrentAudioSurfaceStats(): BlinkAudioSurfaceStats {
        const stats = textureRuntime.getPackedSurfaceStats(lastSurfaceStats);
        lastSurfaceStats = stats;
        return stats;
    }

    function getCurrentSpectrumCoverageStats(): Record<string, number | string> {
        return textureRuntime.getCurrentSpectrumCoverageStats();
    }

    // --- Spectrum-stage probe session (per-stage intermediate buffers) ---

    async function captureSpectrumStageProbeSession(
        options: SpectrumStageSessionOptions & { probeUrl: string; analyserSmoothingTimeConstant?: number }
    ): Promise<ProbeSessionResult> {
        const probeUrl = options.probeUrl;
        const preRoll = options.preRollSeconds ?? 1;
        const postRoll = options.postRollSeconds ?? 3;
        const playStart = options.playbackStartSeconds ?? 0;
        const expectedDur = options.expectedDurationSeconds ?? 99;
        const playStop = options.playbackStopSeconds ?? expectedDur;

        // Validate
        if (playStart < 0) throw new Error('playbackStartSeconds must be >= 0');
        if (playStop <= playStart) throw new Error('playbackStopSeconds must be > playbackStartSeconds');
        if (playStop > expectedDur) throw new Error('playbackStopSeconds must be <= expectedDurationSeconds');

        const windowDur = playStop - playStart;
        const totalCapture = preRoll + windowDur + postRoll;

        const recorder = new BlinkAudioSpectrumStageRecorder(options);

        // Capture analyser metadata
        if (getAnalyserMeta) {
            recorder.setAnalyserMetadata(getAnalyserMeta());
        }

        textureRuntime.setSpectrumStageCallback((frame: SpectrumStageFrame) => {
            recorder.appendFrame(frame);
        });

        recorder.start();

        try {
            if (preRoll > 0) {
                await new Promise<void>(r => setTimeout(r, preRoll * 1000));
            }

            const playResult = await playProbeWav(probeUrl, {
                startSeconds: playStart,
                stopSeconds: playStop,
            });
            if (!playResult.success) {
                throw new Error(playResult.error ?? 'Probe playback failed');
            }

            // Postroll
            if (postRoll > 0) {
                await new Promise<void>(r => setTimeout(r, postRoll * 1000));
            }

            textureRuntime.setSpectrumStageCallback(null);
            recorder.finalize();

            const zipData = buildSpectrumStageZip(recorder);
            triggerStageSessionDownload(zipData, options.sessionName);

            const result = {
                framesCaptured: recorder.frameCount,
                totalDurationMs: Math.round(totalCapture * 1000),
                manifest: recorder.buildManifest(),
            };
            recorder.destroy();
            return result;
        } catch (err) {
            textureRuntime.setSpectrumStageCallback(null);
            recorder.destroy();
            throw err instanceof Error ? err : new Error(String(err));
        }
    }

    function getProbeSessionStatus(): ProbeSessionStatus | null {
        if (probeSession === null) return null;
        return probeSession.getStatus();
    }

    function cancelProbeSession(): void {
        clearProbeSessionState();
    }

    return {
        captureSurfaces,
        captureSeries,
        getLastSnapshot,
        captureProbeSession,
        captureAndPlayProbeSession,
        captureSpectrumStageProbeSession,
        getProbeSessionStatus,
        cancelProbeSession,
        getCurrentAudioSurfaceStats,
        getCurrentSpectrumCoverageStats,
    };
}
