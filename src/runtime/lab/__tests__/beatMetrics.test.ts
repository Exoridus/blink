import { describe, expect, it } from 'vitest';

import { compareBeatEvents, validateBeatAnnotations } from '../beatMetrics';

describe('independent musical accuracy metrics', () => {
    it('penalizes doubled detections instead of counting both as true positives', () => {
        const score = compareBeatEvents([0, 0.25, 0.5, 0.75, 1], [0, 0.5, 1]);
        expect(score).toMatchObject({
            matched: 3,
            falsePositive: 2,
            falseNegative: 0,
            precision: 0.6,
            recall: 1,
            f1: 0.75,
        });
    });
    it('uses one-to-one maximum matching and measures event time rather than arrival delay', () => {
        const score = compareBeatEvents([0.05, 0.12, 1.02], [0, 0.08, 1]);
        expect(score.matched).toBe(3);
        expect(score.meanSignedMs).toBeCloseTo(110 / 3);
        expect(score.p90AbsoluteMs).toBeCloseTo(50);
        expect(compareBeatEvents([], []).f1).toBeNull();
    });
    it('requires reviewed annotations bound to the actual decoded PCM', () => {
        const annotation = {
            pcmSha256: 'abc',
            annotationId: 'review-1',
            reviewed: true,
            pulseConvention: 'quarter',
            beats: [0.1, 0.5],
            tempoBpm: 120,
        };
        expect(validateBeatAnnotations(annotation, 'abc', 1)).toMatchObject(annotation);
        expect(() => validateBeatAnnotations(annotation, 'def', 1)).toThrow('PCM');
        expect(() => validateBeatAnnotations({ ...annotation, reviewed: false }, 'abc', 1)).toThrow('reviewed');
        expect(() => validateBeatAnnotations({ ...annotation, beats: [0.5, 0.1] }, 'abc', 1)).toThrow('increasing');
    });
});
