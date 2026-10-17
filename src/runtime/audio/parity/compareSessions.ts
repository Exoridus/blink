import { strFromU8, unzipSync } from 'fflate';

/** The two surfaces a probe session records, and the order of their RGBA channels. */
export type ParitySurface = 'spectrum' | 'leveltrail';

interface BufferLayout {
    readonly frameByteLength: number;
    readonly width: number;
    readonly channels: readonly string[];
}

interface SessionManifest {
    readonly buffers: Readonly<Record<ParitySurface, BufferLayout>>;
}

interface FrameIndexEntry {
    readonly timestampMs: number;
    readonly spectrumOffsetBytes: number;
    readonly leveltrailOffsetBytes: number;
}

/** One channel of one surface, averaged into time buckets: `bucketCount * width` values, bucket-major. */
export interface BucketedStream {
    readonly surface: ParitySurface;
    readonly channel: string;
    readonly width: number;
    readonly values: Float64Array;
}

export interface BucketedSession {
    readonly bucketMs: number;
    readonly bucketCount: number;
    readonly frames: number;
    /** Average frames per second over the compared window. */
    readonly framesPerSecond: number;
    readonly streams: ReadonlyMap<string, BucketedStream>;
}

export interface BucketOptions {
    /** Width of a time bucket. Default 250 ms. */
    readonly bucketMs?: number;
    /** Dropped from both ends of the capture, which hold the pre-roll and post-roll. Default 2000 ms. */
    readonly trimMs?: number;
    /**
     * `bins` keeps every bin of a channel and compares bin against bin, which is how a spectrum
     * shape or a level trail is judged. `mean` reduces each channel to one value per bucket, which
     * hides a shape that moved while its overall level did not, and shows a level trail as a
     * constant, because the mean over a trail's pixels barely changes as it scrolls. Default `bins`.
     */
    readonly reduce?: 'bins' | 'mean';
}

export class SessionFormatError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'SessionFormatError';
    }
}

const DEFAULT_BUCKET_MS = 250;
const DEFAULT_TRIM_MS = 2000;
const FLOAT_BYTES = 4;
const STREAM_FILES: Readonly<Record<ParitySurface, string>> = {
    spectrum: 'spectrum_frames.bin',
    leveltrail: 'leveltrail_frames.bin',
};

export const streamKey = (surface: ParitySurface, channel: string): string => `${surface}/${channel}`;

function parseFrameIndex(text: string): FrameIndexEntry[] {
    return text
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as FrameIndexEntry);
}

function readEntry(entries: Readonly<Record<string, Uint8Array>>, name: string): Uint8Array {
    const entry = entries[name];
    if (entry === undefined) {
        throw new SessionFormatError(`the session has no ${name}`);
    }
    return entry;
}

function floatView(bytes: Uint8Array): Float32Array {
    // A zip entry is not guaranteed to start on a 4-byte boundary, which a Float32Array view needs.
    const aligned = bytes.byteOffset % FLOAT_BYTES === 0 ? bytes : new Uint8Array(bytes);
    return new Float32Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.byteLength / FLOAT_BYTES));
}

/**
 * A recorder that stored views of a buffer it kept overwriting writes the final frame out once per
 * frame. Such a session looks plausible and compares as perfectly stable, so it is refused instead.
 */
function rejectIfEveryFrameIsTheSame(
    streams: ReadonlyArray<{ layout: BufferLayout; floats: Float32Array }>,
    frames: number
): void {
    if (frames < 2) {
        return;
    }
    const sampled = [0, Math.floor(frames / 3), Math.floor(frames / 2), Math.floor((frames * 2) / 3), frames - 1];
    for (const { layout, floats } of streams) {
        const frameFloats = layout.width * layout.channels.length;
        const first = floats.subarray(0, frameFloats);
        // A session recorded in silence is legitimately constant; it is reported as empty later.
        if (first.every(value => Math.abs(value) < EMPTY_STREAM_MAX)) {
            return;
        }
        const differs = sampled.some(frame => {
            const candidate = floats.subarray(frame * frameFloats, (frame + 1) * frameFloats);
            return candidate.some((value, i) => value !== first[i]);
        });
        if (differs) {
            return;
        }
    }
    throw new SessionFormatError(
        'every sampled frame of the session is identical; the recorder stored the same buffer for every frame, so there is no time series to compare'
    );
}

function meanOverBins(surface: ParitySurface, channel: string, width: number, values: Float64Array): BucketedStream {
    const buckets = values.length / width;
    const means = new Float64Array(buckets);
    for (let bucket = 0; bucket < buckets; bucket++) {
        let sum = 0;
        for (let bin = 0; bin < width; bin++) sum += values[bucket * width + bin];
        means[bucket] = sum / width;
    }
    return { surface, channel, width: 1, values: means };
}

/**
 * Reads a probe session archive (`manifest.json`, `frame_index.jsonl` and the two frame streams the
 * recorder writes) and averages every channel into time buckets, so two sessions recorded at
 * different frame rates compare bucket against bucket.
 *
 * The streams are RGBA per bin: `width * channels` floats per frame, one bin's channels adjacent.
 * Frames before `trimMs` and after the end minus `trimMs` are dropped.
 */
export function bucketSession(archive: Uint8Array, options: BucketOptions = {}): BucketedSession {
    const bucketMs = options.bucketMs ?? DEFAULT_BUCKET_MS;
    const trimMs = options.trimMs ?? DEFAULT_TRIM_MS;
    const reduce = options.reduce ?? 'bins';

    const entries = unzipSync(archive);
    const manifest = JSON.parse(strFromU8(readEntry(entries, 'manifest.json'))) as SessionManifest;
    const index = parseFrameIndex(strFromU8(readEntry(entries, 'frame_index.jsonl')));
    if (index.length === 0) {
        throw new SessionFormatError('the session recorded no frames');
    }

    const windowStart = index[0].timestampMs + trimMs;
    const windowEnd = index[index.length - 1].timestampMs - trimMs;
    const bucketCount = Math.floor((windowEnd - windowStart) / bucketMs);
    if (bucketCount <= 0) {
        throw new SessionFormatError(
            `the capture is too short to compare: ${index.length} frames and a ${trimMs} ms trim at both ends`
        );
    }

    const sums = new Map<string, Float64Array>();
    const counts = new Float64Array(bucketCount);
    const streams = (Object.keys(STREAM_FILES) as ParitySurface[]).map(surface => {
        const layout = manifest.buffers[surface];
        return { surface, layout, floats: floatView(readEntry(entries, STREAM_FILES[surface])) };
    });
    for (const { surface, layout } of streams) {
        for (const channel of layout.channels) {
            sums.set(streamKey(surface, channel), new Float64Array(bucketCount * layout.width));
        }
    }

    rejectIfEveryFrameIsTheSame(streams, index.length);

    let frames = 0;
    for (const [frameNumber, frame] of index.entries()) {
        const bucket = Math.floor((frame.timestampMs - windowStart) / bucketMs);
        if (bucket < 0 || bucket >= bucketCount) {
            continue;
        }
        frames++;
        counts[bucket]++;
        for (const { surface, layout, floats } of streams) {
            const channelCount = layout.channels.length;
            const base = frameNumber * layout.width * channelCount;
            if (base + layout.width * channelCount > floats.length) {
                throw new SessionFormatError(`frame ${frameNumber} lies beyond the end of ${STREAM_FILES[surface]}`);
            }
            for (const [channelIndex, channel] of layout.channels.entries()) {
                const sum = sums.get(streamKey(surface, channel));
                if (sum === undefined) continue;
                for (let bin = 0; bin < layout.width; bin++) {
                    sum[bucket * layout.width + bin] += floats[base + bin * channelCount + channelIndex];
                }
            }
        }
    }

    const result = new Map<string, BucketedStream>();
    for (const { surface, layout } of streams) {
        for (const channel of layout.channels) {
            const values = sums.get(streamKey(surface, channel));
            if (values === undefined) continue;
            for (let bucket = 0; bucket < bucketCount; bucket++) {
                const divisor = counts[bucket] === 0 ? 1 : counts[bucket];
                for (let bin = 0; bin < layout.width; bin++) values[bucket * layout.width + bin] /= divisor;
            }
            result.set(
                streamKey(surface, channel),
                reduce === 'mean'
                    ? meanOverBins(surface, channel, layout.width, values)
                    : { surface, channel, width: layout.width, values }
            );
        }
    }
    return {
        bucketMs,
        bucketCount,
        frames,
        framesPerSecond: (frames * 1000) / (bucketCount * bucketMs),
        streams: result,
    };
}

/** How far a candidate stream may deviate from the reference before the comparison fails. */
export interface StreamTolerance {
    /** Largest mean absolute deviation, in the stream's own units (the 0..1 range for these surfaces). */
    readonly maxMad: number;
    /** Smallest Pearson correlation; null for a stream whose shape is not expected to track. */
    readonly minCorrelation: number | null;
}

export type StreamStatus = 'pass' | 'fail' | 'empty' | 'missing';

export interface StreamComparison {
    readonly stream: string;
    readonly status: StreamStatus;
    readonly buckets: number;
    /** Mean absolute deviation over every bucket and bin. */
    readonly mad: number;
    /** 95th percentile of the absolute deviations. */
    readonly p95: number;
    /** Pearson correlation of the two streams; null when either has no variance. */
    readonly correlation: number | null;
    /** Mean signed deviation relative to the reference mean; null when the reference mean is zero. */
    readonly biasRelative: number | null;
    readonly tolerance: StreamTolerance | null;
}

/** A stream whose largest value stays under this in both sessions is not recording anything. */
export const EMPTY_STREAM_MAX = 1e-3;

/** Used for a stream with no tolerance of its own: under 2 % of the 0..1 range, and a recognizable shape. */
export const REGRESSION_TOLERANCE: StreamTolerance = { maxMad: 0.02, minCorrelation: 0.85 };

/**
 * Tolerances for comparing a candidate session with a baseline recorded on the same machine at
 * the same frame rate. They sit at one and a half to two and a half times the deviation measured
 * between two back-to-back captures of the same build (probe master, 30 fps, 395 buckets), so a
 * repeat of an unchanged build passes with room to spare:
 *
 * | stream | repeat MAD | repeat correlation |
 * |---|---|---|
 * | spectrum/raw | 0.0002 | 0.917 |
 * | spectrum/juiced | 0.0197 | 0.960 |
 * | spectrum/smooth | 0.0001 | 0.942 |
 * | spectrum/waveform | 0.0043 | 0.470 |
 * | leveltrail/all | 0.0208 | 0.932 |
 * | leveltrail/bass | 0.0315 | 0.970 |
 * | leveltrail/mid | 0.0224 | 0.925 |
 * | leveltrail/high | 0.0181 | 0.918 |
 *
 * The waveform is not phase-locked between runs, so only its level is compared. They say a change
 * did not move the output; they say nothing about agreement with Synesthesia, and they are
 * provisional until measured on more than one pair of captures.
 */
export const REGRESSION_TOLERANCES: ReadonlyMap<string, StreamTolerance> = new Map([
    ['spectrum/raw', { maxMad: 0.0005, minCorrelation: 0.8 }],
    ['spectrum/juiced', { maxMad: 0.04, minCorrelation: 0.9 }],
    ['spectrum/smooth', { maxMad: 0.0003, minCorrelation: 0.8 }],
    ['spectrum/waveform', { maxMad: 0.01, minCorrelation: null }],
    ['leveltrail/all', { maxMad: 0.05, minCorrelation: 0.85 }],
    ['leveltrail/bass', { maxMad: 0.06, minCorrelation: 0.85 }],
    ['leveltrail/mid', { maxMad: 0.05, minCorrelation: 0.85 }],
    ['leveltrail/high', { maxMad: 0.045, minCorrelation: 0.85 }],
]);

function compareValues(
    reference: Float64Array,
    candidate: Float64Array
): Omit<StreamComparison, 'stream' | 'status' | 'buckets' | 'tolerance'> {
    const count = Math.min(reference.length, candidate.length);
    const deviations = new Float64Array(count);
    let sumReference = 0;
    let sumCandidate = 0;
    let sumDeviation = 0;
    let sumSigned = 0;
    for (let i = 0; i < count; i++) {
        sumReference += reference[i];
        sumCandidate += candidate[i];
        const signed = candidate[i] - reference[i];
        deviations[i] = Math.abs(signed);
        sumDeviation += deviations[i];
        sumSigned += signed;
    }
    const meanReference = sumReference / count;
    const meanCandidate = sumCandidate / count;
    let covariance = 0;
    let varianceReference = 0;
    let varianceCandidate = 0;
    for (let i = 0; i < count; i++) {
        const a = reference[i] - meanReference;
        const b = candidate[i] - meanCandidate;
        covariance += a * b;
        varianceReference += a * a;
        varianceCandidate += b * b;
    }
    const sorted = deviations.sort();
    return {
        mad: sumDeviation / count,
        p95: sorted[Math.min(count - 1, Math.ceil(count * 0.95) - 1)],
        correlation:
            varianceReference > 0 && varianceCandidate > 0
                ? covariance / Math.sqrt(varianceReference * varianceCandidate)
                : null,
        biasRelative: meanReference === 0 ? null : sumSigned / count / meanReference,
    };
}

function hasVariance(values: Float64Array): boolean {
    return values.some(value => value !== values[0]);
}

function maxOf(values: Float64Array): number {
    let max = Number.NEGATIVE_INFINITY;
    for (const value of values) if (value > max) max = value;
    return max;
}

/**
 * Compares a candidate session with a reference, stream by stream. A stream that neither session
 * fills is reported as `empty` rather than passed: agreeing on nothing is not agreement. A stream
 * the candidate lacks is `missing` and fails the comparison.
 */
export function compareSessions(
    reference: BucketedSession,
    candidate: BucketedSession,
    tolerances: ReadonlyMap<string, StreamTolerance> = new Map(),
    fallback: StreamTolerance = REGRESSION_TOLERANCE
): StreamComparison[] {
    const result: StreamComparison[] = [];
    for (const [key, referenceStream] of reference.streams) {
        const candidateStream = candidate.streams.get(key);
        if (candidateStream?.width !== referenceStream.width) {
            result.push({
                stream: key,
                status: 'missing',
                buckets: 0,
                mad: Number.NaN,
                p95: Number.NaN,
                correlation: null,
                biasRelative: null,
                tolerance: null,
            });
            continue;
        }
        const buckets = Math.min(reference.bucketCount, candidate.bucketCount);
        const width = referenceStream.width;
        const referenceValues = referenceStream.values.subarray(0, buckets * width);
        const candidateValues = candidateStream.values.subarray(0, buckets * width);
        const measures = compareValues(referenceValues, candidateValues);
        const tolerance = tolerances.get(key) ?? fallback;
        const empty = maxOf(referenceValues) < EMPTY_STREAM_MAX && maxOf(candidateValues) < EMPTY_STREAM_MAX;
        // No correlation means one side has no variance. A reference that varies against a candidate
        // that does not is a stream that went flat, not one that agrees.
        const flatlined =
            measures.correlation === null && hasVariance(referenceValues) !== hasVariance(candidateValues);
        const shapeOk =
            tolerance.minCorrelation === null ||
            (!flatlined && (measures.correlation === null || measures.correlation >= tolerance.minCorrelation));
        const status: StreamStatus = empty ? 'empty' : measures.mad <= tolerance.maxMad && shapeOk ? 'pass' : 'fail';
        result.push({ stream: key, status, buckets, ...measures, tolerance });
    }
    return result;
}

/** Largest ratio between the frame rates of two sessions that still compare; see {@link frameRatesComparable}. */
export const MAX_FRAME_RATE_RATIO = 1.25;

/**
 * Whether two sessions ran at frame rates close enough to compare. Several outputs depend on the
 * frame time by design (the Juiced stage scales with its square root, and several scalars advance
 * once per frame), so a session at 33 fps and one at 143 fps differ even when nothing changed.
 */
export function frameRatesComparable(reference: BucketedSession, candidate: BucketedSession): boolean {
    const ratio = reference.framesPerSecond / candidate.framesPerSecond;
    return ratio <= MAX_FRAME_RATE_RATIO && ratio >= 1 / MAX_FRAME_RATE_RATIO;
}

/** Whether a comparison found no stream that failed or went missing. */
export const comparisonPassed = (comparisons: readonly StreamComparison[]): boolean =>
    comparisons.every(comparison => comparison.status === 'pass' || comparison.status === 'empty');
