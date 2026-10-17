import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
    bucketSession,
    compareSessions,
    comparisonPassed,
    EMPTY_STREAM_MAX,
    frameRatesComparable,
    SessionFormatError,
    type StreamTolerance,
} from '../compareSessions';

const SPECTRUM_WIDTH = 4;
const TRAIL_WIDTH = 2;
const FRAME_MS = 50;

interface SyntheticOptions {
    /** Seconds of capture, including the 2 s trimmed at each end. */
    readonly seconds: number;
    /** Value of one spectrum bin of one channel at a time. */
    readonly spectrum: (channel: number, bin: number, ms: number) => number;
    /** Defaults to a value too small to count as signal that still differs from frame to frame. */
    readonly trail?: (channel: number, bin: number, ms: number) => number;
    readonly frameMs?: number;
}

/** A session archive in the layout the recorder writes: RGBA per bin, frame by frame. */
function session(options: SyntheticOptions): Uint8Array {
    const step = options.frameMs ?? FRAME_MS;
    const frames = Math.floor((options.seconds * 1000) / step);
    const spectrum = new Float32Array(frames * SPECTRUM_WIDTH * 4);
    const trail = new Float32Array(frames * TRAIL_WIDTH * 4);
    const index: string[] = [];
    for (let frame = 0; frame < frames; frame++) {
        const ms = frame * step;
        for (let bin = 0; bin < SPECTRUM_WIDTH; bin++) {
            for (let channel = 0; channel < 4; channel++) {
                spectrum[(frame * SPECTRUM_WIDTH + bin) * 4 + channel] = options.spectrum(channel, bin, ms);
            }
        }
        for (let bin = 0; bin < TRAIL_WIDTH; bin++) {
            for (let channel = 0; channel < 4; channel++) {
                trail[(frame * TRAIL_WIDTH + bin) * 4 + channel] = options.trail?.(channel, bin, ms) ?? ms / 1e9;
            }
        }
        index.push(
            JSON.stringify({
                frameIndex: frame,
                timestampMs: 1_000_000 + ms,
                spectrumOffsetBytes: 0,
                leveltrailOffsetBytes: 0,
            })
        );
    }
    const manifest = {
        buffers: {
            spectrum: {
                frameByteLength: SPECTRUM_WIDTH * 16,
                width: SPECTRUM_WIDTH,
                channels: ['raw', 'juiced', 'smooth', 'waveform'],
            },
            leveltrail: {
                frameByteLength: TRAIL_WIDTH * 16,
                width: TRAIL_WIDTH,
                channels: ['all', 'bass', 'mid', 'high'],
            },
        },
    };
    return zipSync({
        'manifest.json': strToU8(JSON.stringify(manifest)),
        'frame_index.jsonl': strToU8(index.join('\n')),
        'spectrum_frames.bin': new Uint8Array(spectrum.buffer),
        'leveltrail_frames.bin': new Uint8Array(trail.buffer),
    });
}

/** A slow swell, so a stream has shape for the correlation to follow. */
const swell = (ms: number): number => 0.5 + 0.4 * Math.sin(ms / 3000);

const find = (
    comparisons: ReturnType<typeof compareSessions>,
    stream: string
): ReturnType<typeof compareSessions>[number] => {
    const found = comparisons.find(comparison => comparison.stream === stream);
    if (found === undefined) throw new Error(`no comparison for ${stream}`);
    return found;
};

describe('bucketSession', () => {
    it('averages frames into buckets and drops the trimmed ends', () => {
        // A ramp of one unit per second. The 6 s capture has frames at 0..5950 ms, so the window is
        // [2000, 3950) ms and holds 7 whole buckets; bucket 0 averages the frames at 2000..2200 ms.
        const bucketed = bucketSession(
            session({ seconds: 6, spectrum: (channel, _bin, ms) => (channel === 1 ? ms / 1000 : 0) }),
            {
                reduce: 'mean',
            }
        );

        expect(bucketed.bucketCount).toBe(7);
        const juiced = bucketed.streams.get('spectrum/juiced')!.values;
        expect(juiced[0]).toBeCloseTo(2.1, 4);
        expect(juiced[1] - juiced[0]).toBeCloseTo(0.25, 4);
    });

    it('keeps every bin by default', () => {
        const bucketed = bucketSession(session({ seconds: 6, spectrum: (_channel, bin) => bin }));

        const stream = bucketed.streams.get('spectrum/raw')!;
        expect(stream.width).toBe(SPECTRUM_WIDTH);
        expect([...stream.values.subarray(0, SPECTRUM_WIDTH)]).toEqual([0, 1, 2, 3]);
    });

    it('reads a stream that is not 4-byte aligned inside its entry', () => {
        const bucketed = bucketSession(session({ seconds: 6, spectrum: () => 0.25 }));

        expect(bucketed.streams.get('spectrum/waveform')!.values[0]).toBeCloseTo(0.25, 6);
    });

    it('rejects a session whose recorder stored the same buffer for every frame', () => {
        const frozen = session({ seconds: 6, spectrum: () => 0.25, trail: () => 0.5 });

        expect(() => bucketSession(frozen)).toThrow(/identical/);
    });

    it('accepts a session in which only one stream changes', () => {
        const bucketed = bucketSession(
            session({ seconds: 6, spectrum: () => 0.25, trail: (_channel, _bin, ms) => ms / 1000 })
        );

        expect(bucketed.bucketCount).toBeGreaterThan(0);
    });

    it('reports the frame rate of the compared window', () => {
        const bucketed = bucketSession(session({ seconds: 20, spectrum: (_channel, _bin, ms) => ms, frameMs: 20 }));

        expect(bucketed.framesPerSecond).toBeCloseTo(50, 0);
    });

    it('rejects a session without frames, one that is too short, and one missing a file', () => {
        const empty = zipSync({
            'manifest.json': strToU8('{"buffers":{}}'),
            'frame_index.jsonl': strToU8(''),
            'spectrum_frames.bin': new Uint8Array(),
            'leveltrail_frames.bin': new Uint8Array(),
        });
        expect(() => bucketSession(empty)).toThrow(SessionFormatError);
        expect(() => bucketSession(session({ seconds: 3, spectrum: () => 0 }))).toThrow(/too short/);
        expect(() => bucketSession(zipSync({ 'manifest.json': strToU8('{}') }))).toThrow(/frame_index/);
    });
});

describe('frameRatesComparable', () => {
    const at = (frameMs: number): ReturnType<typeof bucketSession> =>
        bucketSession(session({ seconds: 20, spectrum: (_channel, _bin, ms) => ms, frameMs }));

    it('accepts sessions within a quarter of each other and refuses a fourfold difference', () => {
        expect(frameRatesComparable(at(20), at(22))).toBe(true);
        expect(frameRatesComparable(at(20), at(80))).toBe(false);
        expect(frameRatesComparable(at(80), at(20))).toBe(false);
    });
});

describe('compareSessions', () => {
    const swelling =
        (scale = 1, offset = 0): SyntheticOptions['spectrum'] =>
        (channel, _bin, ms) =>
            channel === 1 ? swell(ms) * scale + offset : 0.5;

    it('passes a candidate that matches the reference', () => {
        const reference = bucketSession(session({ seconds: 20, spectrum: swelling() }));
        const candidate = bucketSession(session({ seconds: 20, spectrum: swelling(), frameMs: 30 }));

        const comparisons = compareSessions(reference, candidate);

        expect(find(comparisons, 'spectrum/juiced')).toMatchObject({
            status: 'pass',
            mad: expect.closeTo(0, 2),
            correlation: expect.closeTo(1, 3),
        });
        expect(comparisonPassed(comparisons)).toBe(true);
    });

    it('fails a candidate whose level moved by more than the tolerance and reports the bias', () => {
        const reference = bucketSession(session({ seconds: 20, spectrum: swelling() }));
        const candidate = bucketSession(session({ seconds: 20, spectrum: swelling(1, 0.1) }));

        const juiced = find(compareSessions(reference, candidate), 'spectrum/juiced');

        expect(juiced.status).toBe('fail');
        expect(juiced.mad).toBeCloseTo(0.1, 2);
        expect(juiced.biasRelative).toBeGreaterThan(0.1);
    });

    it('fails a candidate whose shape does not track even when the mean level agrees', () => {
        const reference = bucketSession(session({ seconds: 20, spectrum: swelling() }));
        const candidate = bucketSession(
            session({ seconds: 20, spectrum: (channel, _bin, ms) => (channel === 1 ? 1 - swell(ms) : 0.5) })
        );
        const tolerance = new Map<string, StreamTolerance>([['spectrum/juiced', { maxMad: 1, minCorrelation: 0.85 }]]);

        const juiced = find(compareSessions(reference, candidate, tolerance), 'spectrum/juiced');

        expect(juiced.correlation).toBeLessThan(0);
        expect(juiced.status).toBe('fail');
    });

    it('skips the correlation for a stream whose tolerance does not ask for one', () => {
        const reference = bucketSession(session({ seconds: 20, spectrum: swelling() }));
        const candidate = bucketSession(
            session({ seconds: 20, spectrum: (channel, _bin, ms) => (channel === 1 ? 1 - swell(ms) : 0.5) })
        );
        const tolerance = new Map<string, StreamTolerance>([['spectrum/juiced', { maxMad: 1, minCorrelation: null }]]);

        expect(find(compareSessions(reference, candidate, tolerance), 'spectrum/juiced').status).toBe('pass');
    });

    it('reports a stream both sessions leave empty as empty, not as agreement', () => {
        const reference = bucketSession(session({ seconds: 20, spectrum: () => EMPTY_STREAM_MAX / 10 }));
        const candidate = bucketSession(session({ seconds: 20, spectrum: () => EMPTY_STREAM_MAX / 10 }));

        const comparisons = compareSessions(reference, candidate);

        expect(find(comparisons, 'spectrum/raw').status).toBe('empty');
        expect(comparisonPassed(comparisons)).toBe(true);
    });

    it('reports a correlation of null for a constant stream instead of dividing by zero', () => {
        const reference = bucketSession(session({ seconds: 20, spectrum: () => 0.5 }));

        expect(find(compareSessions(reference, reference), 'spectrum/waveform')).toMatchObject({
            status: 'pass',
            correlation: null,
        });
    });

    it('fails when the candidate lacks a stream the reference has', () => {
        const reference = bucketSession(session({ seconds: 20, spectrum: swelling() }));
        const candidate = { ...bucketSession(session({ seconds: 20, spectrum: swelling() })), streams: new Map() };

        const comparisons = compareSessions(reference, candidate);

        expect(comparisons.every(comparison => comparison.status === 'missing')).toBe(true);
        expect(comparisonPassed(comparisons)).toBe(false);
    });

    it('compares bin against bin, catching a shape that moved with its mean unchanged', () => {
        const rising: SyntheticOptions['spectrum'] = (channel, bin) => (channel === 1 ? 0.1 + bin * 0.2 : 0.5);
        const falling: SyntheticOptions['spectrum'] = (channel, bin) => (channel === 1 ? 0.7 - bin * 0.2 : 0.5);
        const reference = session({ seconds: 20, spectrum: rising });
        const candidate = session({ seconds: 20, spectrum: falling });

        const meanOnly = compareSessions(
            bucketSession(reference, { reduce: 'mean' }),
            bucketSession(candidate, { reduce: 'mean' })
        );
        const perBin = compareSessions(bucketSession(reference), bucketSession(candidate));

        expect(find(meanOnly, 'spectrum/juiced').status).toBe('pass');
        expect(find(perBin, 'spectrum/juiced').status).toBe('fail');
    });
});

describe('degenerate sessions', () => {
    it('fails a candidate that went flat against a reference that varies, though its level is close', () => {
        const reference = bucketSession(
            session({ seconds: 20, spectrum: (channel, _bin, ms) => (channel === 0 ? swell(ms) : 0.5) })
        );
        const candidate = bucketSession(
            session({
                seconds: 20,
                spectrum: (channel, _bin, ms) => (channel === 0 ? 0.5 + ms / 1e9 : 0.5),
                frameMs: 30,
            })
        );
        const tolerance = new Map<string, StreamTolerance>([['spectrum/raw', { maxMad: 1, minCorrelation: 0.8 }]]);

        expect(find(compareSessions(reference, candidate, tolerance), 'spectrum/raw').status).toBe('fail');
    });

    it('reports a session recorded in silence as empty instead of blaming the recorder', () => {
        const silent = bucketSession(session({ seconds: 20, spectrum: () => 0, trail: () => 0 }));

        const comparisons = compareSessions(silent, silent);

        expect(comparisons.every(comparison => comparison.status === 'empty')).toBe(true);
    });
});
