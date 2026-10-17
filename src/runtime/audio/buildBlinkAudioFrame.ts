import type { BlinkAudioFrame } from './BlinkAudioFrame';

/**
 * Snapshot of the audio analyser state needed to build a BlinkAudioFrame.
 *
 * This interface deliberately avoids ExoJS types — it is the contract
 * that any audio backend (or test stub) must satisfy to feed the builder.
 */
export interface AudioFrameSource {
    /** 12-band frequency-energy array (Float32Array from AudioService). */
    readonly frequencyEnergy: Float32Array;

    /** Current beat intensity [0, 1] (composite beat + downbeat + phase). */
    readonly beatIntensity: number;

    /** Current downbeat / bar intensity [0, 1]. */
    readonly downbeatIntensity: number;

    /** Beat-pulse envelope [0, 1] (raised on beat, decays). */
    readonly beatPulse: number;

    /** Bar-pulse envelope [0, 1] (raised on downbeat, decays). */
    readonly barPulse: number;

    /** Normalised position within current beat [0, 1]. */
    readonly beatPhase: number;

    /** Onset strength from the onset-detector [0, 1]. */
    readonly onsetStrength: number;

    /** Detected beats per minute. */
    readonly bpm: number;
}

function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
}

/**
 * Build a BlinkAudioFrame from an AudioFrameSource snapshot.
 *
 * Frequency-energy mapping (AudioService 12-band layout → Blink 4-band):
 *
 *   AudioService indices        Blink band
 *   ─────────────────────        ──────────
 *   [0] 20–40 Hz   (sub)  ─┐
 *   [1] 40–80 Hz   (bass)  ├── bass     = avg(0, 1, 2)
 *   [2] 80–160 Hz  (upper) ─┘
 *   [3] 20–160 Hz  (broad) ─── bassPresence / bassHit anchor
 *
 *   [4] 160–320 Hz (low)   ─┐
 *   [5] 320–640 Hz (mid)    ├── mid      = avg(4, 5)
 *   [6] 640–1280 Hz(up-mid) ─┐
 *   [7] 160–1280 Hz(broad)   └── mid-low anchor
 *
 *   [6] 640–1280 Hz(up-mid) ─┐
 *   [8] 1280–2560 Hz(lo-tr) ├── midHigh  = avg(6, 8)
 *   [9] 2560–5120 Hz(treb)  ─┐
 *   [10]5120–10240 Hz(up-tr) ├── high     = avg(9, 10)
 *   [11]1280–10240 Hz(broad) ─┘
 */
export function buildBlinkAudioFrame(source: AudioFrameSource): BlinkAudioFrame {
    const e = source.frequencyEnergy;

    const bass = clamp01((e[0] + e[1] + e[2]) / 3);
    const mid = clamp01((e[4] + e[5]) / 2);
    const midHigh = clamp01((e[6] + e[8]) / 2);
    const high = clamp01((e[9] + e[10]) / 2);

    const level = clamp01(Math.max(bass, mid, midHigh, high));

    const onset = clamp01(source.onsetStrength);

    const hit = clamp01(source.beatIntensity * (0.7 + level * 0.3));

    const bassHit = clamp01(source.beatPulse * clamp01(e[3]));
    const midHit = clamp01(source.beatPulse * clamp01(e[7]));
    const midHighHit = clamp01(source.beatPulse * Math.max(clamp01(e[6]), clamp01(e[8])));
    const highHit = clamp01(source.beatPulse * Math.max(clamp01(e[10]), clamp01(e[11])));

    const presence = clamp01((clamp01(e[3]) + clamp01(e[7]) + clamp01(e[11])) / 3);
    const bassPresence = clamp01(e[3]);
    const midPresence = clamp01(e[7]);
    const midHighPresence = clamp01(Math.max(clamp01(e[6]), clamp01(e[8])));
    const highPresence = clamp01(Math.max(clamp01(e[10]), clamp01(e[11])));

    const bpmConfidence = clamp01(source.onsetStrength * 0.7 + (1 - Math.abs(source.bpm - 120) / 80) * 0.3);

    return {
        level,
        bass,
        mid,
        midHigh,
        high,
        onset,
        hit,
        bassHit,
        midHit,
        midHighHit,
        highHit,
        presence,
        bassPresence,
        midPresence,
        midHighPresence,
        highPresence,
        beatPulse: clamp01(source.beatPulse),
        barPulse: clamp01(source.barPulse),
        beatPhase: clamp01(source.beatPhase),
        bpm: Math.round(source.bpm),
        bpmConfidence: clamp01(bpmConfidence),
        rawLevel: 0,
        inputLevel: 0,
        onBeat: 0,
        beatTime: 0,
        curvedTime: 0,
        bpmsin8: 0,
        bpmtri8: 0,
        bpmTwitcher: 0,
    };
}
