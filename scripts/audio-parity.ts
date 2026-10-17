// Compares two probe sessions (the .zip files the ?probe= capture writes), stream by stream.
//
//   npm run audio-parity -- <reference.zip> <candidate.zip> [--mean] [--json] [--allow-rate-mismatch]
//
// The reference is the session that defines what is right: a stored baseline of an earlier engine
// version. Both are averaged into 250 ms buckets, the first and last two seconds are dropped, and
// each channel is compared on mean absolute deviation and correlation. Exit status is 0 when no
// stream failed, 1 when one did or one is missing, 2 on a usage error or a session that cannot be
// compared. Sessions recorded at frame rates more than a quarter apart are refused unless
// --allow-rate-mismatch is given: several outputs depend on the frame time by design.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    bucketSession,
    compareSessions,
    comparisonPassed,
    frameRatesComparable,
    REGRESSION_TOLERANCES,
    SessionFormatError,
    type StreamComparison,
} from '../src/runtime/audio/parity';

const args = process.argv.slice(2);
const flags = new Set(args.filter(arg => arg.startsWith('--')));
const [referencePath, candidatePath] = args.filter(arg => !arg.startsWith('--'));

if (referencePath === undefined || candidatePath === undefined) {
    console.error('usage: audio-parity <reference.zip> <candidate.zip> [--mean] [--json] [--allow-rate-mismatch]');
    process.exit(2);
}

const load = (path: string): ReturnType<typeof bucketSession> =>
    bucketSession(new Uint8Array(readFileSync(resolve(path))), { reduce: flags.has('--mean') ? 'mean' : 'bins' });

const fixed = (value: number | null, digits: number): string =>
    value === null || Number.isNaN(value) ? '-' : value.toFixed(digits);

function line(comparison: StreamComparison): string {
    const bias = comparison.biasRelative === null ? '-' : `${(comparison.biasRelative * 100).toFixed(1)} %`;
    return (
        `${comparison.status.toUpperCase().padEnd(7)} ${comparison.stream.padEnd(22)}` +
        ` mad ${fixed(comparison.mad, 4)}  p95 ${fixed(comparison.p95, 4)}  corr ${fixed(comparison.correlation, 4)}  bias ${bias}`
    );
}

function loadOrExit(path: string): ReturnType<typeof bucketSession> {
    try {
        return load(path);
    } catch (error) {
        if (error instanceof SessionFormatError) {
            console.error(`audio-parity: ${path}: ${error.message}`);
            process.exit(2);
        }
        throw error;
    }
}

const reference = loadOrExit(referencePath);
const candidate = loadOrExit(candidatePath);
if (!flags.has('--allow-rate-mismatch') && !frameRatesComparable(reference, candidate)) {
    console.error(
        `audio-parity: the sessions ran at ${reference.framesPerSecond.toFixed(1)} and ${candidate.framesPerSecond.toFixed(1)} fps; ` +
            'outputs that depend on the frame time are not comparable across that difference (--allow-rate-mismatch compares anyway)'
    );
    process.exit(2);
}
const comparisons = compareSessions(reference, candidate, REGRESSION_TOLERANCES);

if (flags.has('--json')) {
    console.log(
        JSON.stringify({ buckets: Math.min(reference.bucketCount, candidate.bucketCount), comparisons }, null, 2)
    );
} else {
    console.log(
        `${Math.min(reference.bucketCount, candidate.bucketCount)} buckets of ${reference.bucketMs} ms (${reference.frames} and ${candidate.frames} frames)`
    );
    for (const comparison of comparisons) console.log(line(comparison));
}
process.exit(comparisonPassed(comparisons) ? 0 : 1);
