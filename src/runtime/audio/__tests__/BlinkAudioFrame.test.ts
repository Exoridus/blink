import { describe, expect, it } from 'vitest';

import { silentBlinkAudioFrame } from '../BlinkAudioFrame';
import { type AudioFrameSource, buildBlinkAudioFrame } from '../buildBlinkAudioFrame';

function silentSource(): AudioFrameSource {
    return {
        frequencyEnergy: new Float32Array(12),
        beatIntensity: 0,
        downbeatIntensity: 0,
        beatPulse: 0,
        barPulse: 0,
        beatPhase: 0,
        onsetStrength: 0,
        bpm: 0,
    };
}

function sourceAt(energy: number, beatIntensity: number): AudioFrameSource {
    const e = new Float32Array(12);
    e.fill(energy);
    return {
        frequencyEnergy: e,
        beatIntensity,
        downbeatIntensity: beatIntensity * 0.5,
        beatPulse: beatIntensity,
        barPulse: beatIntensity * 0.5,
        beatPhase: 0.5,
        onsetStrength: beatIntensity,
        bpm: 128,
    };
}

describe('silentBlinkAudioFrame', () => {
    it('all fields are zero', () => {
        const frame = silentBlinkAudioFrame();
        for (const value of Object.values(frame)) {
            expect(value).toBe(0);
        }
    });

    it('has all 29 expected fields', () => {
        const frame = silentBlinkAudioFrame();
        const keys = Object.keys(frame);
        expect(keys).toHaveLength(29);
        const expected = [
            'level',
            'bass',
            'mid',
            'midHigh',
            'high',
            'onset',
            'hit',
            'bassHit',
            'midHit',
            'midHighHit',
            'highHit',
            'presence',
            'bassPresence',
            'midPresence',
            'midHighPresence',
            'highPresence',
            'beatPulse',
            'barPulse',
            'beatPhase',
            'bpm',
            'bpmConfidence',
            'rawLevel',
            'inputLevel',
            'onBeat',
            'beatTime',
            'curvedTime',
            'bpmsin8',
            'bpmtri8',
            'bpmTwitcher',
        ];
        for (const key of expected) {
            expect(keys).toContain(key);
        }
    });
});

describe('buildBlinkAudioFrame', () => {
    it('returns all zeros for silent source', () => {
        const frame = buildBlinkAudioFrame(silentSource());
        for (const value of Object.values(frame)) {
            expect(value).toBe(0);
        }
    });

    it('maps bass from energy indices 0-2', () => {
        const e = new Float32Array(12);
        e[0] = 0.3;
        e[1] = 0.6;
        e[2] = 0.9;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.bass).toBeCloseTo((0.3 + 0.6 + 0.9) / 3, 5);
    });

    it('maps mid from energy indices 4-5', () => {
        const e = new Float32Array(12);
        e[4] = 0.4;
        e[5] = 0.8;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.mid).toBeCloseTo((0.4 + 0.8) / 2, 5);
    });

    it('maps midHigh from energy indices 6 and 8', () => {
        const e = new Float32Array(12);
        e[6] = 0.3;
        e[8] = 0.7;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.midHigh).toBeCloseTo((0.3 + 0.7) / 2, 5);
    });

    it('maps high from energy indices 9-10', () => {
        const e = new Float32Array(12);
        e[9] = 0.5;
        e[10] = 0.9;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.high).toBeCloseTo((0.5 + 0.9) / 2, 5);
    });

    it('level is max of all four bands', () => {
        const e = new Float32Array(12);
        e[0] = 0.3;
        e[1] = 0.3;
        e[2] = 0.3;
        e[4] = 0.5;
        e[5] = 0.5;
        e[6] = 0.2;
        e[8] = 0.2;
        e[9] = 0.9;
        e[10] = 0.9;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.level).toBeCloseTo(0.9, 5);
    });

    it('clamps all band values to [0, 1]', () => {
        const e = new Float32Array(12);
        e.fill(5);
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);

        expect(frame.bass).toBe(1);
        expect(frame.mid).toBe(1);
        expect(frame.midHigh).toBe(1);
        expect(frame.high).toBe(1);
        expect(frame.level).toBe(1);
    });

    it('hit is derived from beatIntensity and level', () => {
        const frame = buildBlinkAudioFrame(sourceAt(0.5, 0.8));
        expect(frame.hit).toBeGreaterThan(0);
        expect(frame.hit).toBeLessThanOrEqual(1);
        expect(frame.hit).toBeCloseTo(0.8 * (0.7 + 0.5 * 0.3), 5);
    });

    it('bassHit uses beatPulse and broad-bass energy', () => {
        const e = new Float32Array(12);
        e[3] = 0.6;
        const source: AudioFrameSource = {
            ...silentSource(),
            frequencyEnergy: e,
            beatPulse: 0.9,
        };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.bassHit).toBeCloseTo(0.9 * 0.6, 5);
    });

    it('midHit uses beatPulse and broad-mid energy', () => {
        const e = new Float32Array(12);
        e[7] = 0.7;
        const source: AudioFrameSource = {
            ...silentSource(),
            frequencyEnergy: e,
            beatPulse: 0.9,
        };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.midHit).toBeCloseTo(0.9 * 0.7, 5);
    });

    it('midHighHit uses beatPulse and max of e[6], e[8]', () => {
        const e = new Float32Array(12);
        e[6] = 0.4;
        e[8] = 0.8;
        const source: AudioFrameSource = {
            ...silentSource(),
            frequencyEnergy: e,
            beatPulse: 0.9,
        };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.midHighHit).toBeCloseTo(0.9 * 0.8, 5);
    });

    it('highHit uses beatPulse and max of e[10], e[11]', () => {
        const e = new Float32Array(12);
        e[10] = 0.3;
        e[11] = 0.9;
        const source: AudioFrameSource = {
            ...silentSource(),
            frequencyEnergy: e,
            beatPulse: 0.9,
        };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.highHit).toBeCloseTo(0.9 * 0.9, 5);
    });

    it('presence is average of broad-band energies', () => {
        const e = new Float32Array(12);
        e[3] = 0.3;
        e[7] = 0.6;
        e[11] = 0.9;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.presence).toBeCloseTo((0.3 + 0.6 + 0.9) / 3, 5);
    });

    it('bassPresence is e[3]', () => {
        const e = new Float32Array(12);
        e[3] = 0.45;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.bassPresence).toBeCloseTo(0.45, 5);
    });

    it('midPresence is e[7]', () => {
        const e = new Float32Array(12);
        e[7] = 0.55;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.midPresence).toBeCloseTo(0.55, 5);
    });

    it('midHighPresence is max of e[6], e[8]', () => {
        const e = new Float32Array(12);
        e[6] = 0.3;
        e[8] = 0.7;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.midHighPresence).toBeCloseTo(0.7, 5);
    });

    it('highPresence is max of e[10], e[11]', () => {
        const e = new Float32Array(12);
        e[10] = 0.4;
        e[11] = 0.8;
        const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.highPresence).toBeCloseTo(0.8, 5);
    });

    it('passes onsetStrength through as onset, clamped', () => {
        const source = { ...silentSource(), onsetStrength: 0.66 };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.onset).toBe(0.66);
    });

    it('passes beatPulse through clamped', () => {
        const source = { ...silentSource(), beatPulse: 0.75 };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.beatPulse).toBe(0.75);
    });

    it('passes barPulse through clamped', () => {
        const source = { ...silentSource(), barPulse: 0.6 };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.barPulse).toBe(0.6);
    });

    it('passes beatPhase through clamped', () => {
        const source = { ...silentSource(), beatPhase: 0.42 };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.beatPhase).toBe(0.42);
    });

    it('rounds bpm to integer', () => {
        const source = { ...silentSource(), bpm: 128.7 };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.bpm).toBe(129);
    });

    it('computes bpmConfidence from onsetStrength and bpm distance', () => {
        const source = { ...silentSource(), onsetStrength: 0.9, bpm: 120 };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.bpmConfidence).toBeCloseTo(0.9 * 0.7 + 1.0 * 0.3, 5);
    });

    it('bpmConfidence decreases when bpm is far from 120', () => {
        const source = { ...silentSource(), onsetStrength: 1.0, bpm: 60 };
        const frame = buildBlinkAudioFrame(source);
        expect(frame.bpmConfidence).toBeLessThan(1.0);
        expect(frame.bpmConfidence).toBeGreaterThan(0);
    });

    it('clamps all output to [0, 1]', () => {
        const e = new Float32Array(12);
        e.fill(50);
        const source: AudioFrameSource = {
            frequencyEnergy: e,
            beatIntensity: 10,
            downbeatIntensity: 10,
            beatPulse: 10,
            barPulse: 10,
            beatPhase: 10,
            onsetStrength: 10,
            bpm: 999,
        };
        const frame = buildBlinkAudioFrame(source);

        for (const [key, value] of Object.entries(frame)) {
            if (key === 'bpm') {
                expect(value).toBe(999);
            } else {
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(1);
            }
        }
    });

    it('produces the same shape regardless of input timing', () => {
        const frame1 = buildBlinkAudioFrame(sourceAt(0.5, 0.5));
        const frame2 = buildBlinkAudioFrame(sourceAt(0.5, 0.5));

        const keys1 = Object.keys(frame1).sort();
        const keys2 = Object.keys(frame2).sort();
        expect(keys1).toEqual(keys2);
        for (const key of keys1) {
            expect((frame1 as unknown as Record<string, unknown>)[key]).toEqual(
                (frame2 as unknown as Record<string, unknown>)[key]
            );
        }
    });

    it('is a pure function (same input = same output)', () => {
        const source = sourceAt(0.3, 0.4);
        const frame1 = buildBlinkAudioFrame(source);
        source.frequencyEnergy[0] = 0.9;
        const frame2 = buildBlinkAudioFrame(source);
        expect(frame1.bass).not.toBe(frame2.bass);
    });

    describe('edge cases', () => {
        it('handles empty frequency energy array gracefully', () => {
            const source: AudioFrameSource = {
                ...silentSource(),
                frequencyEnergy: new Float32Array(0),
            };
            const frame = buildBlinkAudioFrame(source);
            expect(frame.level).toBeDefined();
        });

        it('handles negative energy values by clamping to 0', () => {
            const e = new Float32Array(12);
            e.fill(-0.5);
            const source: AudioFrameSource = { ...silentSource(), frequencyEnergy: e };
            const frame = buildBlinkAudioFrame(source);
            expect(frame.bass).toBe(0);
            expect(frame.mid).toBe(0);
        });

        it('handles negative beatPulse by clamping to 0', () => {
            const source = { ...silentSource(), beatPulse: -0.5, barPulse: -1 };
            const frame = buildBlinkAudioFrame(source);
            expect(frame.beatPulse).toBe(0);
            expect(frame.barPulse).toBe(0);
        });

        it('handles negative onsetStrength by clamping to 0', () => {
            const source = { ...silentSource(), onsetStrength: -0.5 };
            const frame = buildBlinkAudioFrame(source);
            expect(frame.onset).toBe(0);
        });

        it('handles BPM zero', () => {
            const source = { ...silentSource(), bpm: 0 };
            const frame = buildBlinkAudioFrame(source);
            expect(frame.bpm).toBe(0);
        });

        it('handles beatPhase edge values', () => {
            const source0 = { ...silentSource(), beatPhase: 0 };
            const source1 = { ...silentSource(), beatPhase: 1 };
            expect(buildBlinkAudioFrame(source0).beatPhase).toBe(0);
            expect(buildBlinkAudioFrame(source1).beatPhase).toBe(1);
        });
    });
});
