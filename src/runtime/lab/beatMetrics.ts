export interface BeatAnnotations {
    readonly pcmSha256: string;
    readonly annotationId: string;
    readonly reviewed: true;
    readonly pulseConvention: string;
    readonly beats: readonly number[];
    readonly tempoBpm?: number;
    readonly onsets?: readonly number[];
}

function validateEventTimes(events: unknown, name: string, duration: number): void {
    if (!Array.isArray(events) || events.length > 10000) throw new Error(`Invalid ${name} annotations`);
    let previous = -1;
    for (const event of events as unknown[]) {
        if (typeof event !== 'number' || !Number.isFinite(event) || event < 0 || event > duration || event <= previous)
            throw new Error(`${name} must be strictly increasing finite audio times within PCM`);
        previous = event;
    }
}

export function validateBeatAnnotations(value: unknown, pcmSha256: string, duration: number): BeatAnnotations {
    if (value === null || typeof value !== 'object') throw new Error('Beat annotations must be an object');
    const data = value as Record<string, unknown>;
    if (data.reviewed !== true) throw new Error('Annotations must be independently reviewed');
    if (data.pcmSha256 !== pcmSha256) throw new Error('Annotation PCM hash does not match decoded PCM');
    if (
        typeof data.annotationId !== 'string' ||
        data.annotationId.length === 0 ||
        typeof data.pulseConvention !== 'string' ||
        data.pulseConvention.length === 0
    )
        throw new Error('Annotation identity and pulse convention are required');
    for (const name of ['beats', 'onsets']) {
        const events = data[name];
        if (name === 'onsets' && events === undefined) continue;
        validateEventTimes(events, name, duration);
    }
    if (
        data.tempoBpm !== undefined &&
        (typeof data.tempoBpm !== 'number' || !Number.isFinite(data.tempoBpm) || data.tempoBpm <= 0)
    )
        throw new Error('Invalid annotated tempo');
    return structuredClone(data) as unknown as BeatAnnotations;
}

function betterMatch(count: number, cost: number, previousCount: number, previousCost: number): boolean {
    return count > previousCount || (count === previousCount && cost < previousCost);
}

/** Maximum one-to-one matching, then minimum timing error. Tolerance is fixed before evaluation. */
export function compareBeatEvents(
    detected: readonly number[],
    annotated: readonly number[],
    toleranceSec = 0.07
): {
    matched: number;
    falsePositive: number;
    falseNegative: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    meanSignedMs: number | null;
    p90AbsoluteMs: number | null;
    toleranceSec: number;
} {
    if (!Number.isFinite(toleranceSec) || toleranceSec <= 0) throw new RangeError('Invalid beat tolerance');
    const a = [...detected].sort((x, y) => x - y);
    const b = [...annotated].sort((x, y) => x - y);
    if ([...a, ...b].some(value => !Number.isFinite(value))) throw new RangeError('Nonfinite beat event');
    const width = b.length + 1;
    if ((a.length + 1) * width > 2000000) throw new RangeError('Beat comparison exceeds Lab event budget');
    const path = new Uint8Array((a.length + 1) * width);
    let counts = new Uint32Array(width);
    let costs = new Float64Array(width);
    for (let i = 1; i <= a.length; i++) {
        const nextCounts = new Uint32Array(width);
        const nextCosts = new Float64Array(width);
        for (let j = 1; j <= b.length; j++) {
            let count = counts[j];
            let cost = costs[j];
            let direction = 1;
            if (betterMatch(nextCounts[j - 1], nextCosts[j - 1], count, cost)) {
                count = nextCounts[j - 1];
                cost = nextCosts[j - 1];
                direction = 2;
            }
            const error = Math.abs(a[i - 1] - b[j - 1]);
            if (error <= toleranceSec && betterMatch(counts[j - 1] + 1, costs[j - 1] + error, count, cost)) {
                count = counts[j - 1] + 1;
                cost = costs[j - 1] + error;
                direction = 3;
            }
            nextCounts[j] = count;
            nextCosts[j] = cost;
            path[i * width + j] = direction;
        }
        counts = nextCounts;
        costs = nextCosts;
    }
    let i = a.length;
    let j = b.length;
    const errors: number[] = [];
    while (i > 0 && j > 0) {
        const direction = path[i * width + j];
        if (direction === 3) {
            errors.push((a[--i] - b[--j]) * 1000);
        } else if (direction === 1) i--;
        else j--;
    }
    const matched = errors.length;
    const precision = a.length === 0 ? null : matched / a.length;
    const recall = b.length === 0 ? null : matched / b.length;
    const absolute = errors.map(Math.abs).sort((x, y) => x - y);
    return {
        matched,
        falsePositive: a.length - matched,
        falseNegative: b.length - matched,
        precision,
        recall,
        f1: a.length + b.length === 0 ? null : (2 * matched) / (a.length + b.length),
        meanSignedMs: matched === 0 ? null : errors.reduce((sum, error) => sum + error, 0) / matched,
        p90AbsoluteMs: matched === 0 ? null : absolute[Math.ceil(matched * 0.9) - 1],
        toleranceSec,
    };
}
