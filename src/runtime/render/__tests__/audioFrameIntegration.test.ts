import type { UniformValue } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import type { BlinkAudioFrame } from '../../audio/BlinkAudioFrame';
import { type AudioFrameSource, buildBlinkAudioFrame } from '../../audio/buildBlinkAudioFrame';
import { buildBlinkAudioValues, buildBlinkFrameValues } from '../BlinkPrelude';

class MockAudioFrameSource implements AudioFrameSource {
    readonly frequencyEnergy: Float32Array;

    constructor() {
        this.frequencyEnergy = new Float32Array(12);
    }

    beatIntensity = 0.5;
    downbeatIntensity = 0.3;
    beatPulse = 0.8;
    barPulse = 0.4;
    beatPhase = 0.25;
    onsetStrength = 0.6;
    bpm = 128;
}

function isUniformValueCompatible(value: unknown): value is UniformValue {
    if (typeof value === 'number') return true;
    if (value instanceof Float32Array) return true;
    if (value instanceof Int32Array) return true;
    if (Array.isArray(value) && [2, 3, 4].includes(value.length)) return true;
    return false;
}

describe('audio frame integration boundary', () => {
    it('AudioFrameSource → BlinkAudioFrame → BlinkAudioValues chain works', () => {
        const source = new MockAudioFrameSource();
        source.frequencyEnergy.fill(0.5);

        const frame: BlinkAudioFrame = buildBlinkAudioFrame(source);
        const values = buildBlinkAudioValues(frame);

        expect(values.au_level).toBeGreaterThan(0);
        expect(values.au_bass).toBeGreaterThan(0);
        expect(values.au_mid).toBeGreaterThan(0);
        expect(values.au_midHigh).toBeGreaterThan(0);
        expect(values.au_high).toBeGreaterThan(0);
    });

    it('all audio output values are UniformValue compatible', () => {
        const source = new MockAudioFrameSource();
        const frame = buildBlinkAudioFrame(source);
        const values = buildBlinkAudioValues(frame);

        for (const value of Object.values(values)) {
            expect(isUniformValueCompatible(value)).toBe(true);
        }
    });

    it('all frame output values are UniformValue compatible', () => {
        const values = buildBlinkFrameValues([800, 600], 10, 0.016, 100);

        for (const value of Object.values(values)) {
            expect(isUniformValueCompatible(value)).toBe(true);
        }
    });

    it('AudioFrameSource conforms to the contract AudioService satisfies', () => {
        const source: AudioFrameSource = {
            frequencyEnergy: new Float32Array(12),
            beatIntensity: 0,
            downbeatIntensity: 0,
            beatPulse: 0,
            barPulse: 0,
            beatPhase: 0,
            onsetStrength: 0,
            bpm: 0,
        };

        expect(source.frequencyEnergy).toBeInstanceOf(Float32Array);
        expect(source.frequencyEnergy.length).toBe(12);
        expect(typeof source.beatIntensity).toBe('number');
        expect(typeof source.downbeatIntensity).toBe('number');
        expect(typeof source.beatPulse).toBe('number');
        expect(typeof source.barPulse).toBe('number');
        expect(typeof source.beatPhase).toBe('number');
        expect(typeof source.onsetStrength).toBe('number');
        expect(typeof source.bpm).toBe('number');
    });

    it('buildBlinkAudioFrame from live-energy source produces non-negative values', () => {
        const source = new MockAudioFrameSource();
        source.frequencyEnergy.set([0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05, 0.02, 0.01, 0]);

        const frame = buildBlinkAudioFrame(source);

        for (const [key, value] of Object.entries(frame)) {
            expect(value, `${key} should be >= 0`).toBeGreaterThanOrEqual(0);
        }
    });

    it('buildBlinkAudioFrame from live-energy source produces values <= 1 (except bpm)', () => {
        const source = new MockAudioFrameSource();
        source.frequencyEnergy.fill(1.0);
        source.beatIntensity = 1.0;
        source.beatPulse = 1.0;
        source.barPulse = 1.0;
        source.beatPhase = 1.0;
        source.onsetStrength = 1.0;
        source.bpm = 200;

        const frame = buildBlinkAudioFrame(source);

        for (const [key, value] of Object.entries(frame)) {
            if (key === 'bpm') {
                expect(value, `bpm should be integer`).toBe(Math.round(value));
            } else {
                expect(value, `${key} should be <= 1`).toBeLessThanOrEqual(1);
            }
        }
    });

    it('BlinkAudioFrame fields match the ABI spec (29 fields, specific names)', () => {
        const frame = buildBlinkAudioFrame(new MockAudioFrameSource());
        const names = Object.keys(frame).sort();

        const expected = [
            'barPulse',
            'bass',
            'bassHit',
            'bassPresence',
            'beatPhase',
            'beatPulse',
            'beatTime',
            'bpm',
            'bpmConfidence',
            'bpmTwitcher',
            'bpmsin8',
            'bpmtri8',
            'curvedTime',
            'high',
            'highHit',
            'highPresence',
            'hit',
            'inputLevel',
            'level',
            'mid',
            'midHigh',
            'midHighHit',
            'midHighPresence',
            'midHit',
            'midPresence',
            'onBeat',
            'onset',
            'presence',
            'rawLevel',
        ];

        expect(names).toEqual(expected);
    });

    it('BlinkAudioValues field names match the prelude declarations', () => {
        const frame = buildBlinkAudioFrame(new MockAudioFrameSource());
        const values = buildBlinkAudioValues(frame);
        const names = Object.keys(values).sort();

        const expected = [
            'au_barPulse',
            'au_bass',
            'au_bassHit',
            'au_bassPresence',
            'au_beatPhase',
            'au_beatPulse',
            'au_bpm',
            'au_bpmConfidence',
            'au_high',
            'au_highHit',
            'au_highPresence',
            'au_hit',
            'au_level',
            'au_mid',
            'au_midHigh',
            'au_midHighHit',
            'au_midHighPresence',
            'au_midHit',
            'au_midPresence',
            'au_onset',
            'au_presence',
            'au_pulse',
            'au_rms',
        ];

        expect(names).toEqual(expected);
    });

    it('BlinkFrame values field names are stable', () => {
        const values = buildBlinkFrameValues([100, 200], 0, 0, 0);
        const names = Object.keys(values).sort();

        expect(names).toEqual(['bl_deltaTime', 'bl_frame', 'bl_resolution', 'bl_time']);
    });

    it('round-trip: BlinkAudioFrame built then serialized to values retains data integrity', () => {
        const source = new MockAudioFrameSource();
        source.frequencyEnergy.set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.1, 0.2, 0.3, 0.7, 0.8, 0.5]);
        source.beatPulse = 0.9;
        source.barPulse = 0.45;
        source.beatPhase = 0.33;
        source.bpm = 140;

        const frame = buildBlinkAudioFrame(source);
        const values = buildBlinkAudioValues(frame);

        expect(values.au_bass).toBe(frame.bass);
        expect(values.au_mid).toBe(frame.mid);
        expect(values.au_midHigh).toBe(frame.midHigh);
        expect(values.au_high).toBe(frame.high);
        expect(values.au_beatPulse).toBe(frame.beatPulse);
        expect(values.au_barPulse).toBe(frame.barPulse);
        expect(values.au_beatPhase).toBe(frame.beatPhase);
        expect(values.au_bpm).toBe(frame.bpm);
        expect(values.au_bpmConfidence).toBe(frame.bpmConfidence);
    });
});
