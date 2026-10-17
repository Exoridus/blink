/**
 * Stage-level spectrum recorder — captures per-stage intermediate buffers
 * for frame-by-frame comparison against Synesthesia spectrum-stage sessions.
 *
 * Streams captured per frame:
 *   analyser_db            — raw dB FFT from analyser (fftSpectrum)
 *   raw_input_candidate    — dB→linear values before Raw formula
 *   raw_output             — post-Raw formula (tb.rawSpectrum)
 *   juiced_output          — post-Juiced formula (tb.juicedSpectrum)
 *   smooth_output          — post-Smooth formula (tb.smoothSpectrum)
 *   waveform_output        — pre-pack waveform (tb.waveform)
 *   packed_spectrum        — final packed RGBA 1024×1 surface
 *   packed_leveltrail      — final packed RGBA 400×1 surface
 */

import { CANDIDATE_SCALAR_COUNT } from './BlinkAudioSignals';

const SPECTRUM_FLOATS = 1024;
const SPECTRUM_BYTES = SPECTRUM_FLOATS * 4; // 4096
const PACKED_SPECTRUM_BYTES = SPECTRUM_FLOATS * 4 * 4; // 16384
const PACKED_LEVELTRAIL_BYTES = 400 * 4 * 4; // 6400
const CANDIDATE_BYTES_PER_FRAME = CANDIDATE_SCALAR_COUNT * 4; // e.g. 14×4 = 56

export interface SpectrumStageFrame {
    /** Raw analyser dB FFT data (getSpectrumFloat output) */
    analyserDb: Float32Array;
    /** dB→linear input to Raw formula (before quadratic boost) */
    rawInputCandidate: Float32Array;
    /** Post-Raw formula output */
    rawOutput: Float32Array;
    /** Post-Juiced formula output */
    juicedOutput: Float32Array;
    /** Post-Smooth formula output */
    smoothOutput: Float32Array;
    /** Pre-pack waveform output */
    waveformOutput: Float32Array;
    /** Final packed RGBA spectrum texture */
    packedSpectrum: Float32Array;
    /** Final packed RGBA histogram texture */
    packedLeveltrail: Float32Array;
    /**
     * Log-frequency dBFS spectrum from getSpectrumLogFloat({bands:1024, fMin:30, fMax:16000}).
     * Used by Blink's current Smooth (B) approximation path and retained
     * for stage-level comparison diagnostics.
     */
    analyserLogDb?: Float32Array;
    /**
     * Scalar level values at this frame (from audioFrame EMA state).
     * 4 floats: [level_all, level_bass, level_mid, level_high]
     */
    levelScalars?: Float32Array;
    /**
     * Candidate trail scalar values for offline comparison against Synesthesia.
     * CANDIDATE_SCALAR_COUNT floats, layout defined by CANDIDATE_SCALAR_NAMES in BlinkAudioSignals.
     * PRE-EMA, un-smoothed. Does NOT affect live trail behavior.
     */
    candidateScalars?: Float32Array;
}

export type SpectrumStageFrameCallback = (frame: SpectrumStageFrame, frameIndex: number) => void;

export interface SpectrumStageSessionOptions {
    probeId: string;
    expectedDurationSeconds: number;
    preRollSeconds?: number;
    postRollSeconds?: number;
    playbackStartSeconds?: number;
    playbackStopSeconds?: number;
    /**
     * Optional human-readable name for this capture session.
     * Included in the ZIP filename and the session manifest.
     * Sanitized to filesystem-safe characters before use.
     * Example: "leveltrail_scalar_fix_validation"
     */
    sessionName?: string;
}

export interface SpectrumStageStreamInfo {
    file: string;
    description: string;
    dtype: string;
    endianness: string;
    valuesPerFrame: number;
    bytesPerFrame: number;
    totalBytes: number;
    captured: boolean;
}

interface StageFrameIndexEntry {
    frameIndex: number;
    timestampMs: number;
    offsets: Record<string, number>;
}

export class BlinkAudioSpectrumStageRecorder {
    readonly probeId: string;
    readonly expectedDurationSeconds: number;
    readonly preRollSeconds: number;
    readonly postRollSeconds: number;
    readonly expectedCaptureSeconds: number;

    private _state: 'idle' | 'running' | 'done' = 'idle';
    private _startTimeMs = 0;
    private _stopTimeMs = 0;
    private _frameCount = 0;

    private _chunks: Record<string, Uint8Array[]> = {};
    private _offsets: Record<string, number> = {};
    private _indexEntries: StageFrameIndexEntry[] = [];

    private _captureStartTimestamp = '';
    private _captureStopTimestamp = '';
    private _analyserMetadata: Record<string, unknown> = {};
    readonly sessionName: string | undefined;

    constructor(options: SpectrumStageSessionOptions) {
        this.probeId = options.probeId;
        this.sessionName = options.sessionName;
        this.expectedDurationSeconds = options.expectedDurationSeconds;
        this.preRollSeconds = options.preRollSeconds ?? 1;
        this.postRollSeconds = options.postRollSeconds ?? 3;
        const playStart = options.playbackStartSeconds ?? 0;
        const playStop = options.playbackStopSeconds ?? this.expectedDurationSeconds;
        const windowDur = playStop - playStart;
        this.expectedCaptureSeconds = this.preRollSeconds + windowDur + this.postRollSeconds;

        const names = [
            'analyser_db',
            'analyser_log_db',
            'raw_input_candidate',
            'raw_output',
            'juiced_output',
            'smooth_output',
            'waveform_output',
            'packed_spectrum',
            'packed_leveltrail',
            'level_scalars',
            'candidate_scalars',
        ];
        for (const n of names) {
            this._chunks[n] = [];
            this._offsets[n] = 0;
        }
    }

    get state() {
        return this._state;
    }
    get frameCount() {
        return this._frameCount;
    }

    setAnalyserMetadata(meta: Record<string, unknown>) {
        this._analyserMetadata = meta;
    }

    start(): void {
        if (this._state !== 'idle') throw new Error('Already running');
        this._state = 'running';
        this._startTimeMs = Date.now();
        this._captureStartTimestamp = new Date().toISOString();
    }

    appendFrame(frame: SpectrumStageFrame): void {
        if (this._state !== 'running') return;

        const ts = Date.now();
        this._append('analyser_db', frame.analyserDb, SPECTRUM_BYTES);
        if (frame.analyserLogDb && frame.analyserLogDb.length > 0) {
            this._append('analyser_log_db', frame.analyserLogDb, SPECTRUM_BYTES);
        }
        this._append('raw_input_candidate', frame.rawInputCandidate, SPECTRUM_BYTES);
        this._append('raw_output', frame.rawOutput, SPECTRUM_BYTES);
        this._append('juiced_output', frame.juicedOutput, SPECTRUM_BYTES);
        this._append('smooth_output', frame.smoothOutput, SPECTRUM_BYTES);
        this._append('waveform_output', frame.waveformOutput, SPECTRUM_BYTES);
        this._append('packed_spectrum', frame.packedSpectrum, PACKED_SPECTRUM_BYTES);
        this._append('packed_leveltrail', frame.packedLeveltrail, PACKED_LEVELTRAIL_BYTES);
        if (frame.levelScalars) {
            this._append('level_scalars', frame.levelScalars, 4 * 4);
        }
        if (frame.candidateScalars) {
            this._append('candidate_scalars', frame.candidateScalars, CANDIDATE_BYTES_PER_FRAME);
        }

        this._indexEntries.push({
            frameIndex: this._frameCount,
            timestampMs: ts,
            offsets: { ...this._offsets },
        });
        this._frameCount++;
    }

    private _append(name: string, src: Float32Array, expectedBytes: number): void {
        const u8 = new Uint8Array(src.buffer, src.byteOffset, expectedBytes);
        this._chunks[name].push(new Uint8Array(u8)); // copy
        this._offsets[name] += expectedBytes;
    }

    buildBin(name: string): Uint8Array {
        const chunks = this._chunks[name] ?? [];
        const total = this._offsets[name] ?? 0;
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
            out.set(c, off);
            off += c.byteLength;
        }
        return out;
    }

    buildFrameIndexJsonl(): string {
        return `${this._indexEntries.map(e => JSON.stringify(e)).join('\n')}\n`;
    }

    buildManifest(): Record<string, unknown> {
        const streams: Record<string, SpectrumStageStreamInfo> = {};
        const streamDefs: Array<[string, string, number, number]> = [
            ['analyser_db', 'Raw analyser dB FFT (getSpectrumFloat output)', 1024, SPECTRUM_BYTES],
            [
                'analyser_log_db',
                'Log-frequency dBFS FFT from getSpectrumLogFloat({bands:1024,fMin:30,fMax:16000})',
                1024,
                SPECTRUM_BYTES,
            ],
            ['raw_input_candidate', 'Blink dB→linear values before Raw formula', 1024, SPECTRUM_BYTES],
            ['raw_output', 'Post-Raw formula output (tb.rawSpectrum)', 1024, SPECTRUM_BYTES],
            ['juiced_output', 'Post-Juiced output (tb.juicedSpectrum)', 1024, SPECTRUM_BYTES],
            ['smooth_output', 'Post-Smooth output (tb.smoothSpectrum)', 1024, SPECTRUM_BYTES],
            ['waveform_output', 'Pre-pack waveform (tb.waveform)', 1024, SPECTRUM_BYTES],
            ['packed_spectrum', 'Final packed RGBA 1024×1 float32 surface', 1024 * 4, PACKED_SPECTRUM_BYTES],
            ['packed_leveltrail', 'Final packed RGBA 400×1 float32 surface', 400 * 4, PACKED_LEVELTRAIL_BYTES],
            ['level_scalars', 'Level EMA scalars [all, bass, mid, high] per frame', 4, 4 * 4],
            [
                'candidate_scalars',
                `Pre-EMA LevelTrail candidate values (${CANDIDATE_SCALAR_COUNT} per frame, see CANDIDATE_SCALAR_NAMES)`,
                CANDIDATE_SCALAR_COUNT,
                CANDIDATE_BYTES_PER_FRAME,
            ],
        ];
        for (const [name, desc, valsPerFrame, bytesPerFrame] of streamDefs) {
            streams[name] = {
                file: `${name}_frames.bin`,
                description: desc,
                dtype: 'float32',
                endianness: 'little-endian',
                valuesPerFrame: valsPerFrame,
                bytesPerFrame,
                totalBytes: this._offsets[name] ?? 0,
                captured: (this._offsets[name] ?? 0) > 0,
            };
        }

        const totalMs = this._stopTimeMs - this._startTimeMs;
        return {
            source: 'blink',
            sessionType: 'spectrum-stage-session',
            ...(this.sessionName !== undefined ? { sessionName: this.sessionName } : {}),
            createdAt: new Date().toISOString(),
            probe: {
                id: this.probeId,
                expectedDurationSeconds: this.expectedDurationSeconds,
            },
            capture: {
                preRollSeconds: this.preRollSeconds,
                postRollSeconds: this.postRollSeconds,
                expectedCaptureSeconds: this.expectedCaptureSeconds,
                actualFramesCaptured: this._frameCount,
                captureStartTimestamp: this._captureStartTimestamp,
                captureStopTimestamp: this._captureStopTimestamp,
                totalDurationMs: totalMs,
            },
            analyser: this._analyserMetadata,
            streams,
        };
    }

    finalize(): void {
        if (this._state !== 'running') throw new Error('Not running');
        this._stopTimeMs = Date.now();
        this._captureStopTimestamp = new Date().toISOString();
        this._state = 'done';
    }

    destroy(): void {
        for (const k of Object.keys(this._chunks)) {
            this._chunks[k].length = 0;
        }
        this._indexEntries.length = 0;
        for (const k of Object.keys(this._offsets)) {
            this._offsets[k] = 0;
        }
        this._frameCount = 0;
    }
}
