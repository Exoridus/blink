/**
 * Stable, backend-neutral audio frame for native BlinkFX shaders.
 *
 * This is a pure data shape — no ExoJS types, no audio hardware
 * references.  Builders / adapters are responsible for populating
 * it from the platform-specific audio pipeline.
 */
export interface BlinkAudioFrame {
    /** Overall energy level [0, 1]. */
    readonly level: number;

    /** Low-frequency energy [0, 1]. */
    readonly bass: number;

    /** Low-mid frequency energy [0, 1]. */
    readonly mid: number;

    /** High-mid frequency energy [0, 1]. */
    readonly midHigh: number;

    /** High-frequency energy [0, 1]. */
    readonly high: number;

    /** Onset-detector transient strength [0, 1]. */
    readonly onset: number;

    /** Composite hit / transient strength [0, 1]. */
    readonly hit: number;

    /** Bass-band transient strength [0, 1]. */
    readonly bassHit: number;

    /** Mid-band transient strength [0, 1]. */
    readonly midHit: number;

    /** Mid-high-band transient strength [0, 1]. */
    readonly midHighHit: number;

    /** High-band transient strength [0, 1]. */
    readonly highHit: number;

    /** Sustained energy without beat transients [0, 1]. */
    readonly presence: number;

    /** Bass-band sustained energy [0, 1]. */
    readonly bassPresence: number;

    /** Mid-band sustained energy [0, 1]. */
    readonly midPresence: number;

    /** Mid-high-band sustained energy [0, 1]. */
    readonly midHighPresence: number;

    /** High-band sustained energy [0, 1]. */
    readonly highPresence: number;

    /** Current beat pulse envelope [0, 1] (decays between beats). */
    readonly beatPulse: number;

    /** Current downbeat / bar pulse envelope [0, 1]. */
    readonly barPulse: number;

    /** Normalised beat-phase position [0, 1]. */
    readonly beatPhase: number;

    /** Detected tempo in beats per minute. */
    readonly bpm: number;

    /** Confidence in the current BPM estimate [0, 1]. */
    readonly bpmConfidence: number;

    // -----------------------------------------------------------------------
    // SSF compatibility signals — added by forensics compatibility pass
    // -----------------------------------------------------------------------

    /** Peak-normalized raw level [0, 1] — SSF syn_RawLevel compatible. */
    readonly rawLevel: number;

    /** Direct input-level passthrough [0, 1] — SSF syn_InputLevel compatible. */
    readonly inputLevel: number;

    /** Adaptive beat pulse with refractory [0, 1] — SSF syn_OnBeat compatible. */
    readonly onBeat: number;

    /** Monotonically increasing beat counter — SSF syn_BeatTime compatible. */
    readonly beatTime: number;

    /** Energy-warped time accumulator [0, 1] — SSF syn_CurvedTime compatible. */
    readonly curvedTime: number;

    /** 8-cycles-per-beat sine LFO [0, 1] — SSF syn_BPMSin8 compatible. */
    readonly bpmsin8: number;

    /** 8-cycles-per-beat triangle LFO [0, 1] — SSF syn_BPMTri8 compatible. */
    readonly bpmtri8: number;

    /** BPM-synchronous phase twitch approximation [0, 1]. */
    readonly bpmTwitcher: number;
}

/** Convenience factory for a silent / default-zero frame. */
export function silentBlinkAudioFrame(): BlinkAudioFrame {
    return {
        level: 0,
        bass: 0,
        mid: 0,
        midHigh: 0,
        high: 0,
        onset: 0,
        hit: 0,
        bassHit: 0,
        midHit: 0,
        midHighHit: 0,
        highHit: 0,
        presence: 0,
        bassPresence: 0,
        midPresence: 0,
        midHighPresence: 0,
        highPresence: 0,
        beatPulse: 0,
        barPulse: 0,
        beatPhase: 0,
        bpm: 0,
        bpmConfidence: 0,
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
