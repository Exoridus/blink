import type { BlinkAudioFrame } from '../../../runtime/audio/BlinkAudioFrame';

/**
 * The `syn_*` scalar block, computed from Blink's own audio frame.
 *
 * The names, types and ranges follow the public Synesthesia audio-uniform reference. The values
 * the frame already carries (levels, hits, presence, beat clocks) pass straight through; the
 * rest are derived here with simple, documented behavior. That is API and semantic
 * compatibility: a scene reacts for the same conceptual reason, not with Synesthesia's exact
 * numbers.
 */

export const SSF_SCALAR_NAMES = [
    'syn_Level',
    'syn_BassLevel',
    'syn_MidLevel',
    'syn_MidHighLevel',
    'syn_HighLevel',
    'syn_RawLevel',
    'syn_InputLevel',
    'syn_Hits',
    'syn_BassHits',
    'syn_MidHits',
    'syn_MidHighHits',
    'syn_HighHits',
    'syn_Presence',
    'syn_BassPresence',
    'syn_MidPresence',
    'syn_MidHighPresence',
    'syn_HighPresence',
    'syn_Time',
    'syn_BassTime',
    'syn_MidTime',
    'syn_MidHighTime',
    'syn_HighTime',
    'syn_CurvedTime',
    'syn_OnBeat',
    'syn_ToggleOnBeat',
    'syn_RandomOnBeat',
    'syn_BeatTime',
    'syn_BPM',
    'syn_BPMConfidence',
    'syn_BPMTwitcher',
    'syn_BPMSin',
    'syn_BPMSin2',
    'syn_BPMSin4',
    'syn_BPMSin8',
    'syn_BPMTri',
    'syn_BPMTri2',
    'syn_BPMTri4',
    'syn_BPMTri8',
    'syn_FadeInOut',
    'syn_Intensity',
    'syn_BassExpoCurve',
    'syn_MediaType',
] as const;

export type SsfScalarName = (typeof SSF_SCALAR_NAMES)[number];

export const SSF_SCALAR_PRELUDE = `${SSF_SCALAR_NAMES.map(name => `uniform float ${name};`).join('\n')}\n`;

/** Rate of a band clock at silence and at full level, in clock seconds per second. */
const CLOCK_BASE_RATE = 0.25;
const CLOCK_LEVEL_GAIN = 1.5;

/** A signal below this is treated as "no music" for the fade envelope. */
const SILENCE_FLOOR = 0.004;
const FADE_RISE_SECONDS = 2;
const FADE_FALL_SECONDS = 5;
const INTENSITY_SECONDS = 10;

function follow(current: number, target: number, seconds: number, dt: number): number {
    return current + (target - current) * (1 - Math.exp(-dt / seconds));
}

function triangle(phase: number): number {
    const wrapped = phase - Math.floor(phase);
    return wrapped < 0.5 ? wrapped * 2 : (1 - wrapped) * 2;
}

export class SsfAudioAdapter {
    private clockAll = 0;
    private clockBass = 0;
    private clockMid = 0;
    private clockMidHigh = 0;
    private clockHigh = 0;
    private fade = 0;
    private intensity = 0;
    private toggle = 0;
    private random = 0;
    private previousOnBeat = 0;

    /** All names at zero: the neutral state a material schema is declared with. */
    public static neutral(): Record<SsfScalarName, number> {
        return Object.fromEntries(SSF_SCALAR_NAMES.map(name => [name, 0])) as Record<SsfScalarName, number>;
    }

    public update(frame: BlinkAudioFrame, dt: number, mediaActive: boolean): Record<SsfScalarName, number> {
        const step = Math.min(Math.max(dt, 0), 0.25);

        this.clockAll += step * (CLOCK_BASE_RATE + CLOCK_LEVEL_GAIN * frame.level);
        this.clockBass += step * (CLOCK_BASE_RATE + CLOCK_LEVEL_GAIN * frame.bass);
        this.clockMid += step * (CLOCK_BASE_RATE + CLOCK_LEVEL_GAIN * frame.mid);
        this.clockMidHigh += step * (CLOCK_BASE_RATE + CLOCK_LEVEL_GAIN * frame.midHigh);
        this.clockHigh += step * (CLOCK_BASE_RATE + CLOCK_LEVEL_GAIN * frame.high);

        const audible = frame.inputLevel > SILENCE_FLOOR || frame.rawLevel > SILENCE_FLOOR;
        this.fade = follow(this.fade, audible ? 1 : 0, audible ? FADE_RISE_SECONDS : FADE_FALL_SECONDS, step);
        this.intensity = follow(this.intensity, frame.level, INTENSITY_SECONDS, step);

        // A beat is the rising edge of the on-beat pulse.
        if (frame.onBeat > 0.5 && this.previousOnBeat <= 0.5) {
            this.toggle = 1 - this.toggle;
            this.random = Math.random();
        }
        this.previousOnBeat = frame.onBeat;

        // Beat clock in beats: whole detected beats plus the position inside the current one.
        const beats = frame.beatTime + frame.beatPhase;
        const sine = (cycles: number): number => 0.5 + 0.5 * Math.sin(beats * cycles * Math.PI * 2);

        return {
            syn_Level: frame.level,
            syn_BassLevel: frame.bass,
            syn_MidLevel: frame.mid,
            syn_MidHighLevel: frame.midHigh,
            syn_HighLevel: frame.high,
            syn_RawLevel: frame.rawLevel,
            syn_InputLevel: frame.inputLevel,
            syn_Hits: frame.hit,
            syn_BassHits: frame.bassHit,
            syn_MidHits: frame.midHit,
            syn_MidHighHits: frame.midHighHit,
            syn_HighHits: frame.highHit,
            syn_Presence: frame.presence,
            syn_BassPresence: frame.bassPresence,
            syn_MidPresence: frame.midPresence,
            syn_MidHighPresence: frame.midHighPresence,
            syn_HighPresence: frame.highPresence,
            syn_Time: this.clockAll,
            syn_BassTime: this.clockBass,
            syn_MidTime: this.clockMid,
            syn_MidHighTime: this.clockMidHigh,
            syn_HighTime: this.clockHigh,
            syn_CurvedTime: frame.curvedTime,
            syn_OnBeat: frame.onBeat,
            syn_ToggleOnBeat: this.toggle,
            syn_RandomOnBeat: this.random,
            syn_BeatTime: frame.beatTime,
            syn_BPM: frame.bpm,
            syn_BPMConfidence: frame.bpmConfidence,
            syn_BPMTwitcher: frame.bpmTwitcher,
            // The 8x oscillators come from the validated signal pass; the slower ones follow the same
            // convention of "n cycles per beat" so the family stays consistent.
            syn_BPMSin: sine(1),
            syn_BPMSin2: sine(2),
            syn_BPMSin4: sine(4),
            syn_BPMSin8: frame.bpmsin8,
            syn_BPMTri: triangle(beats),
            syn_BPMTri2: triangle(beats * 2),
            syn_BPMTri4: triangle(beats * 4),
            syn_BPMTri8: frame.bpmtri8,
            syn_FadeInOut: this.fade,
            syn_Intensity: this.intensity,
            syn_BassExpoCurve: frame.bass * frame.bass,
            syn_MediaType: mediaActive ? 1 : 0,
        };
    }
}
