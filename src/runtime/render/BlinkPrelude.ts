import type { BlinkAudioFrame } from '../audio/BlinkAudioFrame';
import type { BlinkControlSpec } from '../ir/types';
import { mapControlSpecs } from './controlUniformMapper';

const BLINK_FRAME_DECLARATIONS = `uniform float bl_time;
uniform float bl_deltaTime;
uniform int bl_frame;
uniform vec2 bl_resolution;`;

// Output-space pixels with a bottom-left origin, never normalized and never rescaled per pass.
const BLINK_POINTER_DECLARATIONS = `uniform vec2 bl_pointerPosition;
uniform vec2 bl_pointerPressOrigin;
uniform float bl_pointerDown;
uniform float bl_pointerActive;
uniform vec3 bl_pointerButtons;`;

const BLINK_AUDIO_DECLARATIONS = `uniform float au_level;
uniform float au_rms;
uniform float au_bass;
uniform float au_mid;
uniform float au_midHigh;
uniform float au_high;
uniform float au_onset;
uniform float au_hit;
uniform float au_bassHit;
uniform float au_midHit;
uniform float au_midHighHit;
uniform float au_highHit;
uniform float au_presence;
uniform float au_bassPresence;
uniform float au_midPresence;
uniform float au_midHighPresence;
uniform float au_highPresence;
uniform float au_pulse;
uniform float au_beatPulse;
uniform float au_barPulse;
uniform float au_beatPhase;
uniform float au_bpm;
uniform float au_bpmConfidence;`;

const PRELUDE_HEADER = `#version 300 es
precision highp float;

`;

const PRELUDE_FOOTER = `
out vec4 fragColor;
`;

export interface PreludeResult {
    source: string;
    controlNames: string[];
}

export function buildBlinkPrelude(controls: readonly BlinkControlSpec[]): PreludeResult {
    const controlUniforms = mapControlSpecs(controls);
    const controlDeclarations = controlUniforms.map(c => c.glslDeclaration).join('\n');
    const controlNames = controlUniforms.map(c => c.name);

    const source = `${PRELUDE_HEADER + BLINK_FRAME_DECLARATIONS}\n${BLINK_POINTER_DECLARATIONS}\n${
        BLINK_AUDIO_DECLARATIONS
    }\n${controlDeclarations ? `${controlDeclarations}\n` : ''}${PRELUDE_FOOTER}`;

    return { source, controlNames };
}

export function buildDefaultUniformValues(
    controls: readonly BlinkControlSpec[]
): Record<string, number | Float32Array | Int32Array> {
    const values: Record<string, number | Float32Array | Int32Array> = {};
    const entries = mapControlSpecs(controls);
    for (const entry of entries) {
        values[entry.name] = entry.defaultValue;
    }
    return values;
}

/**
 * `bl_pass` is uploaded separately by the caller, alongside `PASSINDEX`; it is
 * not part of this record.
 *
 * `resolutionBuffer` lets a hot-path caller (one call per pass, per frame)
 * reuse a single Float32Array for `bl_resolution` instead of allocating one
 * on every call; omit it for a one-off call.
 */
/**
 * The pointer uniform block, packed for upload.
 *
 * `position` and `pressOrigin` are already in the spec's convention - output-space pixels,
 * bottom-left origin - because the pointer binder converts once, at the event boundary. Nothing
 * downstream rescales them, in particular not to a pass's own target size.
 *
 * `buttons` orders primary/left, right and middle; omitted uses the primary state alone.
 */
export function buildBlinkPointerValues(
    position: readonly [number, number],
    pressOrigin: readonly [number, number],
    down: number,
    active: number,
    positionBuffer: Float32Array = new Float32Array(2),
    pressOriginBuffer: Float32Array = new Float32Array(2),
    buttons: readonly [number, number, number] = [down, 0, 0],
    buttonsBuffer: Float32Array = new Float32Array(3)
): Record<string, number | Float32Array> {
    positionBuffer[0] = position[0];
    positionBuffer[1] = position[1];
    pressOriginBuffer[0] = pressOrigin[0];
    pressOriginBuffer[1] = pressOrigin[1];
    buttonsBuffer.set(buttons);
    return {
        bl_pointerPosition: positionBuffer,
        bl_pointerPressOrigin: pressOriginBuffer,
        bl_pointerDown: down,
        bl_pointerActive: active,
        bl_pointerButtons: buttonsBuffer,
    };
}

export function buildBlinkFrameValues(
    resolution: readonly [number, number],
    time: number,
    deltaTime: number,
    frame: number,
    resolutionBuffer: Float32Array = new Float32Array(2)
): Record<string, number | Float32Array> {
    resolutionBuffer[0] = resolution[0];
    resolutionBuffer[1] = resolution[1];
    return {
        bl_time: time,
        bl_deltaTime: deltaTime,
        bl_frame: Math.floor(frame),
        bl_resolution: resolutionBuffer,
    };
}

export function buildBlinkAudioValues(audio: BlinkAudioFrame): Record<string, number> {
    return {
        au_level: audio.level,
        au_rms: audio.inputLevel,
        au_bass: audio.bass,
        au_mid: audio.mid,
        au_midHigh: audio.midHigh,
        au_high: audio.high,
        au_onset: audio.onset,
        au_hit: audio.hit,
        au_bassHit: audio.bassHit,
        au_midHit: audio.midHit,
        au_midHighHit: audio.midHighHit,
        au_highHit: audio.highHit,
        au_presence: audio.presence,
        au_bassPresence: audio.bassPresence,
        au_midPresence: audio.midPresence,
        au_midHighPresence: audio.midHighPresence,
        au_highPresence: audio.highPresence,
        au_pulse: audio.beatPulse,
        au_beatPulse: audio.beatPulse,
        au_barPulse: audio.barPulse,
        au_beatPhase: audio.beatPhase,
        au_bpm: audio.bpm,
        au_bpmConfidence: audio.bpmConfidence,
    };
}
