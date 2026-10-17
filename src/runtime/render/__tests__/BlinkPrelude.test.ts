import { describe, expect, it } from 'vitest';

import { silentBlinkAudioFrame } from '../../audio/BlinkAudioFrame';
import type { BlinkControlSpec } from '../../ir/types';
import {
    buildBlinkAudioValues,
    buildBlinkFrameValues,
    buildBlinkPointerValues,
    buildBlinkPrelude,
    buildDefaultUniformValues,
} from '../BlinkPrelude';

describe('buildBlinkPrelude', () => {
    it('includes #version 300 es header', () => {
        const result = buildBlinkPrelude([]);
        expect(result.source).toContain('#version 300 es');
    });

    it('includes precision highp float', () => {
        const result = buildBlinkPrelude([]);
        expect(result.source).toContain('precision highp float;');
    });

    it('includes out vec4 fragColor', () => {
        const result = buildBlinkPrelude([]);
        expect(result.source).toContain('out vec4 fragColor;');
    });

    it('includes all BlinkFrame built-in uniforms', () => {
        const result = buildBlinkPrelude([]);
        expect(result.source).toContain('uniform float bl_time;');
        expect(result.source).toContain('uniform float bl_deltaTime;');
        expect(result.source).toContain('uniform int bl_frame;');
        expect(result.source).toContain('uniform vec2 bl_resolution;');
    });

    it('includes all BlinkAudio built-in uniforms', () => {
        const result = buildBlinkPrelude([]);
        const required = [
            'uniform float au_level;',
            'uniform float au_rms;',
            'uniform float au_bass;',
            'uniform float au_mid;',
            'uniform float au_midHigh;',
            'uniform float au_high;',
            'uniform float au_onset;',
            'uniform float au_hit;',
            'uniform float au_bassHit;',
            'uniform float au_midHit;',
            'uniform float au_midHighHit;',
            'uniform float au_highHit;',
            'uniform float au_presence;',
            'uniform float au_bassPresence;',
            'uniform float au_midPresence;',
            'uniform float au_midHighPresence;',
            'uniform float au_highPresence;',
            'uniform float au_pulse;',
            'uniform float au_beatPulse;',
            'uniform float au_barPulse;',
            'uniform float au_beatPhase;',
            'uniform float au_bpm;',
            'uniform float au_bpmConfidence;',
        ];
        for (const decl of required) {
            expect(result.source).toContain(decl);
        }
    });

    it('declares au_bpm as float, not int (R2 spec 10.4)', () => {
        const result = buildBlinkPrelude([]);
        expect(result.source).not.toContain('uniform int au_bpm;');
    });

    it('declares no source-format vocabulary: that belongs to a compatibility profile', () => {
        const result = buildBlinkPrelude([]);
        expect(result.source).not.toMatch(/\b(syn_|fx_)\w+/);
        expect(result.source).not.toContain('sampler2D');
    });

    it('returns empty control names when no controls', () => {
        const result = buildBlinkPrelude([]);
        expect(result.controlNames).toEqual([]);
    });

    it('includes control uniform declarations', () => {
        const controls: BlinkControlSpec[] = [
            {
                name: 'speed',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 1,
                min: null,
                max: null,
                step: null,
            },
            { name: 'tint', label: null, description: null, group: null, type: 'color', default: [1, 1, 1, 1] },
        ];
        const result = buildBlinkPrelude(controls);
        expect(result.source).toContain('uniform float speed;');
        expect(result.source).toContain('uniform vec4 tint;');
    });

    it('returns control names for non-bang controls', () => {
        const controls: BlinkControlSpec[] = [
            {
                name: 'a',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 0,
                min: null,
                max: null,
                step: null,
            },
            { name: 'b', label: null, description: null, group: null, type: 'bang' },
            {
                name: 'c',
                label: null,
                description: null,
                group: null,
                type: 'int',
                default: 1,
                min: null,
                max: null,
                step: null,
            },
        ];
        const result = buildBlinkPrelude(controls);
        expect(result.controlNames).toEqual(['a', 'c']);
    });

    it('#version 300 es is the first directive in source', () => {
        const result = buildBlinkPrelude([]);
        const lines = result.source.split('\n');
        expect(lines[0].trim()).toBe('#version 300 es');
    });

    it('prelude ends with out vec4 fragColor; before user source', () => {
        const result = buildBlinkPrelude([]);
        const lines = result.source.split('\n');
        const filtered = lines.filter(l => l.trim().length > 0);
        expect(filtered[filtered.length - 1]).toBe('out vec4 fragColor;');
    });

    it('prelude is deterministic', () => {
        const a = buildBlinkPrelude([]);
        const b = buildBlinkPrelude([]);
        expect(a.source).toBe(b.source);
        expect(a.controlNames).toEqual(b.controlNames);
    });
});

describe('buildDefaultUniformValues', () => {
    it('returns empty object for no controls', () => {
        const values = buildDefaultUniformValues([]);
        expect(values).toEqual({});
    });

    it('returns float default as number', () => {
        const controls: BlinkControlSpec[] = [
            {
                name: 'speed',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 2.5,
                min: 0,
                max: 10,
                step: null,
            },
        ];
        const values = buildDefaultUniformValues(controls);
        expect(values.speed).toBe(2.5);
    });

    it('returns color default as Float32Array', () => {
        const controls: BlinkControlSpec[] = [
            {
                name: 'color',
                label: null,
                description: null,
                group: null,
                type: 'color',
                default: [0.5, 0.25, 0.75, 1],
            },
        ];
        const values = buildDefaultUniformValues(controls);
        expect(values.color).toEqual(new Float32Array([0.5, 0.25, 0.75, 1]));
    });

    it('excludes bang controls', () => {
        const controls: BlinkControlSpec[] = [
            { name: 'trigger', label: null, description: null, group: null, type: 'bang' },
            {
                name: 'level',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 0.5,
                min: null,
                max: null,
                step: null,
            },
        ];
        const values = buildDefaultUniformValues(controls);
        expect(Object.keys(values)).toEqual(['level']);
        expect(values.trigger).toBeUndefined();
    });
});

describe('buildBlinkFrameValues', () => {
    it('maps resolution to vec2 Float32Array', () => {
        const values = buildBlinkFrameValues([800, 600], 0, 0, 0);
        expect(values.bl_resolution).toEqual(new Float32Array([800, 600]));
    });

    it('maps time as number', () => {
        const values = buildBlinkFrameValues([1, 1], 42.5, 0.016, 0);
        expect(values.bl_time).toBe(42.5);
    });

    it('maps deltaTime as number', () => {
        const values = buildBlinkFrameValues([1, 1], 0, 0.016, 0);
        expect(values.bl_deltaTime).toBe(0.016);
    });

    it('maps frame as integer', () => {
        const values = buildBlinkFrameValues([1, 1], 0, 0, 1234.7);
        expect(values.bl_frame).toBe(1234);
    });

    it('returns a new object each call', () => {
        const a = buildBlinkFrameValues([100, 200], 0, 0, 0);
        const b = buildBlinkFrameValues([100, 200], 0, 0, 0);
        expect(a).not.toBe(b);
    });

    it('uploads the pass resolution, not the screen resolution', () => {
        expect(buildBlinkFrameValues([960, 540], 1, 0.016, 7)).toMatchObject({
            bl_resolution: new Float32Array([960, 540]),
            bl_frame: 7,
        });
    });
});

describe('buildBlinkAudioValues', () => {
    it('returns the 23 native audio uniform values', () => {
        const frame = silentBlinkAudioFrame();
        const values = buildBlinkAudioValues(frame);
        const expected = [
            'au_level',
            'au_rms',
            'au_bass',
            'au_mid',
            'au_midHigh',
            'au_high',
            'au_onset',
            'au_hit',
            'au_bassHit',
            'au_midHit',
            'au_midHighHit',
            'au_highHit',
            'au_presence',
            'au_bassPresence',
            'au_midPresence',
            'au_midHighPresence',
            'au_highPresence',
            'au_pulse',
            'au_beatPulse',
            'au_barPulse',
            'au_beatPhase',
            'au_bpm',
            'au_bpmConfidence',
        ];
        for (const key of expected) {
            expect(values).toHaveProperty(key);
        }
        expect(Object.keys(values)).toHaveLength(23);
    });

    it('all values are zero for silent frame', () => {
        const frame = silentBlinkAudioFrame();
        const values = buildBlinkAudioValues(frame);
        for (const v of Object.values(values)) {
            expect(v).toBe(0);
        }
    });

    it('passes through bass value', () => {
        const frame = { ...silentBlinkAudioFrame(), bass: 0.75 };
        const values = buildBlinkAudioValues(frame);
        expect(values.au_bass).toBe(0.75);
    });

    it('feeds au_bpm as a float, not rounded (R2 spec 10.4)', () => {
        const frame = { ...silentBlinkAudioFrame(), bpm: 128.7 };
        const values = buildBlinkAudioValues(frame);
        expect(values.au_bpm).toBeCloseTo(128.7, 5);
    });

    it('maps au_rms from the frame inputLevel (RMS-derived)', () => {
        const frame = { ...silentBlinkAudioFrame(), inputLevel: 0.42 };
        const values = buildBlinkAudioValues(frame);
        expect(values.au_rms).toBe(0.42);
    });

    it('maps au_onset from the frame onset', () => {
        const frame = { ...silentBlinkAudioFrame(), onset: 0.33 };
        const values = buildBlinkAudioValues(frame);
        expect(values.au_onset).toBe(0.33);
    });

    it('maps au_pulse from the frame beatPulse', () => {
        const frame = { ...silentBlinkAudioFrame(), beatPulse: 0.77 };
        const values = buildBlinkAudioValues(frame);
        expect(values.au_pulse).toBe(0.77);
    });

    it('returns a new object each call', () => {
        const frame = silentBlinkAudioFrame();
        const a = buildBlinkAudioValues(frame);
        const b = buildBlinkAudioValues(frame);
        expect(a).not.toBe(b);
    });
});

describe('prelude + shader concatenation contract', () => {
    it('prelude source does NOT contain void main()', () => {
        const result = buildBlinkPrelude([]);
        expect(result.source).not.toContain('void main');
    });

    it('prelude source leaves room for user to provide main()', () => {
        const result = buildBlinkPrelude([]);
        const userMain = 'void main() { fragColor = vec4(1.0, 0.0, 0.0, 1.0); }';
        const fullSource = result.source + '\n' + userMain;
        expect(fullSource).toContain('void main');
        expect(fullSource).toContain('fragColor');
        expect(fullSource.indexOf('#version 300 es')).toBe(0);
    });

    it('prelude with controls declares them before fragColor output', () => {
        const controls: BlinkControlSpec[] = [
            {
                name: 'zoom',
                label: null,
                description: null,
                group: null,
                type: 'float',
                default: 1,
                min: null,
                max: null,
                step: null,
            },
        ];
        const result = buildBlinkPrelude(controls);
        const zoomIndex = result.source.indexOf('uniform float zoom;');
        const fragColorIndex = result.source.indexOf('out vec4 fragColor;');
        expect(zoomIndex).toBeGreaterThan(0);
        expect(fragColorIndex).toBeGreaterThan(zoomIndex);
    });
});

describe('pointer uniform block', () => {
    it('declares the four pointer uniforms the spec fixes', () => {
        const { source } = buildBlinkPrelude([]);

        expect(source).toContain('uniform vec2 bl_pointerPosition;');
        expect(source).toContain('uniform vec2 bl_pointerPressOrigin;');
        expect(source).toContain('uniform float bl_pointerDown;');
        expect(source).toContain('uniform float bl_pointerActive;');
    });

    // The binder already converted to output pixels with a bottom-left origin; the packing must
    // pass those through untouched rather than normalizing or flipping a second time.
    it('packs the pointer state without transforming it', () => {
        const values = buildBlinkPointerValues([120, 340], [10, 20], 1, 1);

        expect(Array.from(values.bl_pointerPosition as Float32Array)).toEqual([120, 340]);
        expect(Array.from(values.bl_pointerPressOrigin as Float32Array)).toEqual([10, 20]);
        expect(values.bl_pointerDown).toBe(1);
        expect(values.bl_pointerActive).toBe(1);
    });

    it('reuses the buffers a caller passes in, once per frame per pass', () => {
        const position = new Float32Array(2);
        const pressOrigin = new Float32Array(2);

        const first = buildBlinkPointerValues([1, 2], [3, 4], 0, 1, position, pressOrigin);
        const second = buildBlinkPointerValues([5, 6], [7, 8], 0, 1, position, pressOrigin);

        expect(first.bl_pointerPosition).toBe(second.bl_pointerPosition);
        expect(Array.from(position)).toEqual([5, 6]);
    });
});

describe('optional pointer button tuple', () => {
    it('declares and uploads left, right and middle independently while preserving primary defaults', () => {
        expect(buildBlinkPrelude([]).source).toContain('uniform vec3 bl_pointerButtons;');
        const buffer = new Float32Array(3);
        const values = buildBlinkPointerValues([1, 2], [3, 4], 0, 1, undefined, undefined, [0, 1, 1], buffer);
        expect(values.bl_pointerButtons).toBe(buffer);
        expect(Array.from(buffer)).toEqual([0, 1, 1]);
        expect(values.bl_pointerDown).toBe(0);
        expect(buildBlinkPointerValues([1, 2], [3, 4], 1, 1).bl_pointerButtons).toEqual(new Float32Array([1, 0, 0]));
    });
});
