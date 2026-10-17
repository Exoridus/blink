import { SSF_CONSTANTS as K } from './constants';
import { clamp, f, lerp, SsfSmoother } from './math';

export interface SsfScalarInputs {
    readonly band: Float32Array;
    readonly z: Float32Array;
    readonly mean: Float32Array;
    readonly raw: number;
    readonly bpm: number;
    readonly confidence: number;
}

function speedScale(value: number, speed: number): number {
    const q = f(speed);
    if (q <= 1e-4) return 0;
    const scale =
        q <= 0.0625
            ? 0.125
            : q <= 0.125
              ? 0.25
              : q <= 0.25
                ? 0.5
                : q >= 0.9999
                  ? 16
                  : q >= 0.9375
                    ? 8
                    : q >= 0.875
                      ? 4
                      : q >= 0.75
                        ? 2
                        : 1;
    return f(f(value) * scale);
}

class BeatGate {
    private armed = true;
    private timer = 0;

    public update(z: number, r: number, dt: number): boolean {
        const p = f(f(z) * K.F_13);
        const threshold = f(f(0.75) - f(0.5 * r));
        this.timer = f(this.timer - dt);
        if (!(this.timer > 0)) this.armed = true;
        if (this.armed && p >= threshold) {
            this.armed = false;
            this.timer = f(0.12);
            return true;
        }
        return false;
    }
}

class BandFamily {
    private readonly level = new SsfSmoother(0.98);
    private readonly hits = new SsfSmoother(0.9);
    private readonly time = new SsfSmoother(0.8);
    private readonly presence = new SsfSmoother(1, 1);
    private clock = 0;
    private high = 1;
    private low = 0;

    public constructor(
        public readonly prefix: string,
        public readonly selector: number
    ) {
        this.presence.r1 = f(K.PRES_ALPHA);
    }

    public update(band: number, z: number, mean: number, r: number, q: number, dt: number): Record<string, number> {
        const r2 = f(2 * r);
        const value = clamp(f(2 * band), 0, 1);
        const cur = f(1 - this.level.r2);
        const target = r2 >= 1 ? value : f(f(Math.sqrt(r2)) * value);
        const rate = r2 >= 1 ? f(cur - (cur - K.LVL_09) * (r2 - 1)) : f((K.LVL_0995 - cur) * (1 - r2) + cur);
        this.level.r1 = f(1 - rate);
        const h = f(K.HITS_H * z);
        const hitTarget =
            r2 < 1 ? clamp(f(f(Math.sqrt(r2)) * h), 0, 1) : clamp(lerp(h, f(f(2 * h) * h), f(r2 - 1)), 0, 1);
        const timeTarget =
            r2 < 1 ? lerp(f(K.D_03), value, r2) : clamp(lerp(value, f(K.TIME_15 * f(value * value)), f(r2 - 1)), 0, 1);
        this.clock = integrateTime(this.clock, this.time.update(timeTarget, dt), dt, q);
        const smooth = this.presence.update(mean, dt);
        const factor = f(K.RAWL_003 * r2 ** 3);
        this.high = f(this.high + f(f(f(smooth - this.high) * dt) * factor));
        if (smooth > this.high) this.high = smooth;
        this.low = f(this.low + f(f(f(smooth - this.low) * dt) * factor));
        if (smooth < this.low) this.low = smooth;
        const range = f(this.high - this.low);
        let presence = range < K.PRES_1E7 ? 0 : clamp(f(f(smooth - this.low) / range), 0, 1);
        if (r2 < 0.2) presence = f(f(r2 * K.PRES_5) * presence);
        return {
            [`syn_${this.prefix}Level`]: this.level.update(target, dt),
            [`syn_${this.prefix}Hits`]: this.hits.update(hitTarget, dt),
            [`syn_${this.prefix}Presence`]: presence,
            [`syn_${this.prefix}Time`]: this.clock,
        };
    }
}

function integrateTime(acc: number, value: number, dt: number, q: number): number {
    return f(f(f(f(q + q) * 7.5) * f(value * dt)) + acc);
}

/** Independent scene generator state; controlled native CRT stream starts at seed 1. */
export class SsfScalarBank {
    private readonly families = [
        new BandFamily('', 0),
        new BandFamily('Bass', 2),
        new BandFamily('Mid', 5),
        new BandFamily('MidHigh', 3),
        new BandFamily('High', 6),
    ];
    private readonly curved = new SsfSmoother(0.8);
    private readonly expo = new SsfSmoother(0.98);
    private readonly onBeat = new SsfSmoother(0.8);
    private readonly gates = Array.from({ length: 4 }, () => new BeatGate());
    private time = 0;
    private curvedTime = 0;
    private fade = 0;
    private intensity = 0;
    private rawPeak = f(0.001);
    private primeElapsed = 0;
    private primeArmed = false;
    private primeLow = 20;
    private primeMid = 30;
    private primeHigh = 60;
    private toggleTarget = 1;
    private togglePrevious = 0;
    private toggleValue = 0;
    private toggleElapsed = 0;
    private randomTarget = 1;
    private randomPrevious = 0;
    private randomValue = 0;
    private randomElapsed = 0;
    private rng = 1;
    private beatCount = 0;
    private twitchPhase = 0;
    private readonly phases = new Float32Array(8);

    public update(input: SsfScalarInputs, reactivity: number, speed: number, delta: number): Record<string, number> {
        const r = f(reactivity);
        const q = f(speed);
        const dt = f(delta);
        const r2 = f(2 * r);
        const band = input.band[0];
        this.time = f(this.time + f(f(2 * q) * dt));
        const curved = this.curved.update(band, dt);
        const square = f(curved * curved);
        const curve = r2 < 1 ? lerp(K.CURVED_0125, square, r2) : lerp(square, f(K.CURVED_25 * f(square * square)), r2);
        this.curvedTime = integrateTime(this.curvedTime, curve, dt, q);
        const fadeTarget = r2 < 1 ? lerp(1, band, r2) : band;
        this.fade = Math.min(
            f(fadeTarget > K.FADE_005 ? fadeTarget * K.FADE_9D * dt + this.fade : (1 - dt * K.D_03) * this.fade),
            1
        );
        this.intensity = Math.min(
            f(band > K.F_01 ? band * K.INT_018 * dt + this.intensity : (1 - dt * K.INT_156) * this.intensity),
            1
        );
        const raw = Number.isFinite(input.raw) ? f(input.raw) : 0;
        const peak = raw > this.rawPeak ? raw : this.rawPeak;
        this.rawPeak = f((1 - dt * K.RAWL_003) * peak);
        const expo = this.expo.update(input.band[2], dt);
        const base = f(f(200 * r2) + 50);
        const numerator = f(f(Math.pow(base, expo)) - 1);
        const denominator = f(f(200 * r2) + 49);
        const output: Record<string, number> = {
            TIME: this.time,
            syn_CurvedTime: this.curvedTime,
            syn_FadeInOut: this.fade,
            syn_Intensity: this.intensity,
            syn_RawLevel: f(raw / peak),
            syn_InputLevel: f(input.raw),
            syn_BPM: f(input.bpm),
            syn_BPMConfidence: f(Math.min(Math.max(f(f(f(input.confidence) + r) - f(0.5)), 0), 1)),
            syn_BassExpoCurve: f(1e-4) <= r2 ? f(numerator / denominator) : 0,
            syn_PrimeBang: this.prime(input.z[0], r2, dt),
        };
        for (const family of this.families)
            Object.assign(
                output,
                family.update(
                    input.band[family.selector],
                    input.z[family.selector],
                    input.mean[family.selector],
                    r,
                    q,
                    dt
                )
            );
        Object.assign(output, this.beats(input.z[7], r, q, dt));
        Object.assign(output, this.oscillators(input.bpm, input.confidence, r, q, dt));
        return output;
    }

    private prime(z: number, r2: number, dt: number): number {
        if (r2 < 1) {
            this.primeLow = lerp(60, 20, r2);
            this.primeMid = lerp(90, 30, r2);
            this.primeHigh = lerp(180, 60, r2);
        }
        this.primeElapsed = f(this.primeElapsed + dt);
        if (this.primeElapsed >= this.primeLow) this.primeArmed = true;
        if (!this.primeArmed || r2 === 0) return 0;
        const p = f(z * K.F_13);
        const pulse =
            p >= K.PRIME_115 ||
            (this.primeElapsed >= this.primeMid ? p >= K.PRIME_08 : this.primeElapsed >= this.primeHigh && p >= 0.5);
        if (!pulse) return 0;
        this.primeArmed = false;
        this.primeElapsed = 0;
        return 1;
    }

    private beats(z: number, r: number, q: number, dt: number): Record<string, number> {
        const trigger = this.gates.map(gate => gate.update(z, r, dt));
        this.onBeat.r1 = f(1 - f(0.2 + 0.399 * (0.5 - r)));
        const beat = this.onBeat.update(trigger[0] ? 1 : 0, dt);
        this.toggleElapsed = f(this.toggleElapsed + dt);
        if (trigger[1]) {
            this.toggleTarget = this.toggleTarget === 0 ? 1 : 0;
            this.togglePrevious = this.toggleValue;
            this.toggleElapsed = 0;
        }
        const expToggle = f(f(Math.exp(f(this.toggleElapsed * f(-7.2)))) + 1);
        const transition = f(2 / expToggle - 1);
        this.toggleValue = f(f(transition * f(this.toggleTarget - this.togglePrevious)) + this.togglePrevious);
        this.randomElapsed = f(this.randomElapsed + dt);
        if (trigger[2] && r > 0.001) {
            this.randomPrevious = this.randomValue;
            this.rng = (Math.imul(this.rng, 214013) + 2531011) >>> 0;
            let target = f(f(((this.rng >>> 16) & 0x7fff) % 1000) * f(0.001));
            if (Math.abs(target - this.randomPrevious) < 0.3) target = f(f(this.randomPrevious + 0.5) % 1);
            this.randomTarget = target;
            this.randomElapsed = 0;
        }
        const expRandom = f(Math.exp(f(this.randomElapsed * -6)));
        this.randomValue = f(f(f(this.randomTarget - this.randomPrevious) / f(expRandom + 1)) + this.randomPrevious);
        if (trigger[3] && r > 0.001 && q > 0.001) this.beatCount = f(this.beatCount + 1);
        return {
            syn_OnBeat: r < 0.001 ? 0 : beat,
            syn_ToggleOnBeat: r < 0.001 ? 0 : this.toggleValue,
            syn_RandomOnBeat: this.randomValue,
            syn_BeatTime: this.beatCount,
        };
    }

    private oscillators(bpm: number, confidence: number, r: number, q: number, dt: number): Record<string, number> {
        const increment = f(f(speedScale(bpm, q) * dt) * f(0.01666666753590107));
        const output: Record<string, number> = {};
        for (let i = 0; i < 8; i++) {
            const divisor = 2 ** (i % 4);
            let phase = f(this.phases[i] + f(increment / divisor));
            if (phase > 1) phase = f(phase - 1);
            this.phases[i] = phase;
            const value =
                i < 4
                    ? f(f((Math.sin(phase * 6.28318 + 1.570795) + 1) * 0.5) * f(confidence))
                    : f(phase * f(confidence));
            output[`syn_BPM${i < 4 ? 'Sin' : 'Tri'}${divisor === 1 ? '' : divisor}`] = r > 0.001 ? value : 0;
        }
        this.twitchPhase = f(this.twitchPhase + increment);
        const whole = Math.floor(this.twitchPhase);
        const fraction = f(this.twitchPhase - f(whole));
        const r2 = f(2 * r);
        if (r2 < 1) {
            const exponential = f(Math.exp(f(fraction * -9)));
            const first = f(f(whole) + f(1 - exponential));
            output.syn_BPMTwitcher = f(f(r2 * first) + f(f(1 - r2) * this.twitchPhase));
        } else {
            const slope = f(-9 - f(25 * f(r2 - 1)));
            output.syn_BPMTwitcher = f(f(whole) + f(1 - f(Math.exp(f(fraction * slope)))));
        }
        return output;
    }
}
