import type { UniformValue } from '@codexo/exojs';

import { ExoEnhancedProvider, type ExoTempoEvidence } from '../../packages/ssf/original/enhanced';
import {
    type AnalysisInstant,
    type AudioAnalysisProvider,
    type AudioAnalysisSnapshot,
    SsfOriginalProvider,
} from '../../packages/ssf/original/provider';
import { SsfControlProcessor } from '../../packages/ssf/profile/SsfControlProcessor';
import { SsfScriptRuntime, type SsfUniformValue } from '../../packages/ssf/script/SsfScriptRuntime';
import { SsfScriptSandbox } from '../../packages/ssf/script/SsfScriptSandbox';
import type { BlinkEffectIR } from '../ir/types';
import { ControlValueStore } from '../render/ControlValueStore';
import type { BlinkScriptControlValue } from '../script/types';

export interface ArrayDifference {
    readonly maxAbs: number;
    readonly rms: number;
    readonly firstMismatch: number | null;
    readonly nonfiniteMismatch: number;
}

export function compareArrays(a: Float32Array, b: Float32Array): ArrayDifference {
    if (a.length !== b.length) throw new RangeError('Lab array shapes differ');
    let maximum = 0;
    let squares = 0;
    let first: number | null = null;
    let nonfinite = 0;
    for (let i = 0; i < a.length; i++) {
        if (Object.is(a[i], b[i]) || (Number.isNaN(a[i]) && Number.isNaN(b[i]))) continue;
        first ??= i;
        if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) {
            nonfinite++;
            maximum = Number.POSITIVE_INFINITY;
            continue;
        }
        const difference = Math.abs(a[i] - b[i]);
        maximum = Math.max(maximum, difference);
        squares += difference * difference;
    }
    return {
        maxAbs: maximum,
        rms: nonfinite > 0 ? Number.POSITIVE_INFINITY : Math.sqrt(squares / a.length),
        firstMismatch: first,
        nonfiniteMismatch: nonfinite,
    };
}

export interface LabLaneFrame {
    readonly snapshot: AudioAnalysisSnapshot;
    readonly controls: Readonly<Record<string, UniformValue>>;
    readonly uniforms: Readonly<Record<string, UniformValue>>;
    readonly analysisMs: number;
    readonly scriptMs: number;
}

export interface LabFrame {
    readonly frame: number;
    readonly time: number;
    readonly a: LabLaneFrame;
    readonly b: LabLaneFrame;
    readonly validity: readonly string[];
    readonly comparison: {
        readonly scalarMaxAbs: number;
        readonly firstScalar: string | null;
        readonly spectrum: ArrayDifference;
        readonly levelTrail: ArrayDifference;
    };
}

export interface LabRenderer {
    render(frame: LabLaneFrame, clock: { frame: number; time: number; delta: number }): Promise<void>;
    reset(): Promise<void>;
}

interface ControlTransaction {
    readonly frame: number;
    readonly sequence: number;
    readonly controlId: string;
    readonly value: number | readonly number[];
    readonly lane: 'shared' | 'a' | 'b';
    readonly source: 'user';
}

interface Lane {
    provider: AudioAnalysisProvider;
    controls: ControlValueStore;
    processor: SsfControlProcessor;
    effective: Record<string, UniformValue>;
    script: SsfScriptRuntime | null;
    sandbox: SsfScriptSandbox | null;
    ready: Promise<void>;
    values: Record<string, SsfUniformValue>;
    scriptError: string | null;
}

export interface AudioAnalysisLabOptions {
    readonly fps?: number;
    readonly outputSize?: readonly [number, number];
    readonly enhanced?: boolean;
    readonly exoVersion?: string;
    readonly scriptSource?: string;
    readonly sandboxScripts?: boolean;
    readonly reportFrameLimit?: number;
    readonly renderers?: readonly [LabRenderer, LabRenderer];
    readonly tempoEvidence?: () => ExoTempoEvidence | null;
    readonly reactivity?: number;
    readonly audioSpeed?: number;
}

/** Deterministic fixed-rate replay; each lane owns all mutable scene and analyzer state. */
export class AudioAnalysisLab {
    private readonly pcm: Float32Array;
    private get fps(): number {
        return this.options.fps ?? 60;
    }
    private lanes: [Lane, Lane];
    private frame = 0;
    private sample = 0;
    private epoch = 0;
    private busy = false;
    private readonly transactions: ControlTransaction[] = [];
    private readonly frames: Array<{
        frame: number;
        time: number;
        instant: AnalysisInstant;
        validity: readonly string[];
        comparison: LabFrame['comparison'];
        performance: { a: number; b: number; scriptA: number; scriptB: number };
    }> = [];

    public constructor(
        private readonly effect: BlinkEffectIR,
        pcm: Float32Array,
        private readonly options: AudioAnalysisLabOptions = {}
    ) {
        if (!Number.isSafeInteger(options.reportFrameLimit ?? 3600) || (options.reportFrameLimit ?? 3600) < 1)
            throw new RangeError('Invalid Lab report frame limit');
        if (!Number.isFinite(this.fps) || this.fps < 1 || this.fps > 240)
            throw new RangeError('Invalid Lab frame rate');
        this.pcm = new Float32Array(pcm);
        this.lanes = [this.createLane(false), this.createLane(options.enhanced === true)];
    }

    public setControl(name: string, value: number | readonly number[], lane: 'shared' | 'a' | 'b' = 'shared'): void {
        if (!this.effect.controls.some(control => control.name === name))
            throw new Error(`Unknown scene control: ${name}`);
        this.transactions.push({
            frame: this.frame,
            sequence: this.transactions.length,
            controlId: name,
            value: typeof value === 'number' ? value : [...value],
            lane,
            source: 'user',
        });
    }

    public async step(): Promise<LabFrame> {
        if (this.busy) throw new Error('Lab step already in progress');
        this.busy = true;
        try {
            const frame = await this.advance();
            if (this.options.renderers !== undefined) {
                await Promise.all(
                    this.options.renderers.map((renderer, index) =>
                        renderer.render(index === 0 ? frame.a : frame.b, {
                            frame: frame.frame,
                            time: frame.time,
                            delta: 1 / this.fps,
                        })
                    )
                );
            }
            this.frames.push({
                frame: frame.frame,
                time: frame.time,
                instant: { ...frame.a.snapshot.instant },
                validity: [...frame.validity],
                comparison: frame.comparison,
                performance: {
                    a: frame.a.analysisMs,
                    b: frame.b.analysisMs,
                    scriptA: frame.a.scriptMs,
                    scriptB: frame.b.scriptMs,
                },
            });
            if (this.frames.length > (this.options.reportFrameLimit ?? 3600)) this.frames.shift();
            this.frame++;
            return frame;
        } finally {
            this.busy = false;
        }
    }

    public async seek(targetFrame: number): Promise<LabFrame> {
        if (this.busy) throw new Error('Cannot seek during a Lab step');
        if (
            !Number.isSafeInteger(targetFrame) ||
            targetFrame < 0 ||
            targetFrame > Math.ceil(this.pcm.length / (44100 / this.fps))
        )
            throw new RangeError('Lab seek outside PCM');
        for (const lane of this.lanes) {
            lane.provider.destroy();
            lane.script?.dispose();
            lane.sandbox?.dispose();
        }
        this.epoch++;
        this.lanes = [this.createLane(false), this.createLane(this.options.enhanced === true)];
        for (const lane of this.lanes) lane.provider.reset(this.epoch);
        this.frame = this.sample = 0;
        this.frames.length = 0;
        await Promise.all(this.options.renderers?.map(renderer => renderer.reset()) ?? []);
        let result = await this.step();
        for (let i = 0; i < targetFrame; i++) result = await this.step();
        return result;
    }

    public report(): {
        verdicts: { ssfParity: string; musicalAccuracy: string; visualPreference: string };
        transactions: readonly ControlTransaction[];
        frames: unknown[];
        metadata: object;
    } {
        return {
            verdicts: { ssfParity: 'INCONCLUSIVE', musicalAccuracy: 'UNKNOWN', visualPreference: 'UNKNOWN' },
            metadata: {
                sceneId: this.effect.metadata.id,
                sampleRate: 44100,
                hop: 512,
                fps: this.fps,
                sourceEpoch: this.epoch,
                exoVersion: this.options.exoVersion ?? 'not selected',
                numericalProfile: 'portable-f64-fft-pc53-zen2-smooth',
                totalFrames: this.frame,
                retainedFrames: this.frames.length,
                firstRetainedFrame: this.frames[0]?.frame ?? null,
                originalSource: '1.25.2.185',
                vm: 'modern JS portable host; Duktape parity unverified',
            },
            transactions: this.transactions.map(transaction => ({ ...transaction })),
            frames: structuredClone(this.frames),
        };
    }

    public destroy(): void {
        for (const lane of this.lanes) {
            lane.provider.destroy();
            lane.script?.dispose();
            lane.sandbox?.dispose();
        }
    }

    private createLane(enhanced: boolean): Lane {
        const controls = new ControlValueStore();
        controls.loadDefaults(this.effect.controls);
        const processor = new SsfControlProcessor(this.effect.controls, this.effect.compatibility?.controls ?? {});
        const lane: Lane = {
            provider: enhanced
                ? new ExoEnhancedProvider(this.options.exoVersion ?? 'unverified')
                : new SsfOriginalProvider(),
            controls,
            processor,
            effective: processor.process(controls.values, 0),
            script: null,
            sandbox: null,
            ready: Promise.resolve(),
            values: {},
            scriptError: null,
        };
        const neutralProvider = new SsfOriginalProvider();
        for (const [name, signal] of neutralProvider.snapshot(0).signals)
            if (typeof signal.value === 'number') lane.values[name] = signal.value;
        neutralProvider.destroy();
        Object.assign(lane.values, lane.effective, {
            TIME: 0,
            TIMEDELTA: Math.fround(0.017),
            FRAMECOUNT: 0,
            RENDERSIZE: new Float32Array(this.options.outputSize ?? [1920, 1080]),
        });
        if (this.options.scriptSource !== undefined && this.options.scriptSource !== '') {
            if (this.options.sandboxScripts === true) {
                lane.sandbox = new SsfScriptSandbox();
                lane.ready = lane.sandbox
                    .init(
                        this.options.scriptSource,
                        this.effect.controls,
                        new Map(Object.entries(lane.values)),
                        controls.values as Record<string, BlinkScriptControlValue>,
                        this.effect.compatibility?.scriptUniforms ?? {}
                    )
                    .then(result => {
                        if (!result.ok) lane.scriptError = result.error;
                        else {
                            Object.assign(lane.values, result.uniforms);
                            for (const [name, value] of Object.entries(result.controls)) controls.set(name, value);
                        }
                    })
                    .catch(error => {
                        lane.scriptError = String(error);
                    });
            } else {
                lane.script = new SsfScriptRuntime({
                    source: this.options.scriptSource,
                    nativeLifecycle: true,
                    controls: this.effect.controls,
                    declaredUniforms: this.effect.compatibility?.scriptUniforms ?? {},
                    surface: {
                        get: name => controls.values[name] as BlinkScriptControlValue,
                        set: (name, value) => controls.set(name, value),
                    },
                });
                lane.script.init(new Map(Object.entries(lane.values)));
            }
        }
        return lane;
    }

    private async advance(): Promise<LabFrame> {
        const target = Math.min(this.pcm.length, Math.floor(((this.frame + 1) * 44100) / this.fps));
        const block = {
            samples: this.pcm.subarray(this.sample, target),
            sampleRate: 44100,
            firstSample: this.sample,
            sourceEpoch: this.epoch,
        };
        const transactions = this.transactions.filter(transaction => transaction.frame === this.frame);
        const evidence = this.options.tempoEvidence?.();
        const laneFrames = await Promise.all(
            this.lanes.map(async (lane, index): Promise<LabLaneFrame> => {
                await lane.ready;
                for (const transaction of transactions) {
                    if (transaction.lane === 'shared' || transaction.lane === (index === 0 ? 'a' : 'b')) {
                        lane.controls.set(
                            transaction.controlId,
                            typeof transaction.value === 'number'
                                ? transaction.value
                                : new Float32Array(transaction.value)
                        );
                    }
                }
                if (lane.provider instanceof ExoEnhancedProvider && evidence !== undefined && evidence !== null)
                    lane.provider.publishTempo(evidence);
                const start = performance.now();
                lane.provider.process(block);
                let analysisMs = performance.now() - start;
                const scriptStart = performance.now();
                const scriptValues = new Map(
                    Object.entries({
                        ...lane.values,
                        ...lane.effective,
                        RENDERSIZE: new Float32Array(this.options.outputSize ?? [1920, 1080]),
                        TIME: Math.fround(this.frame / this.fps),
                        FRAMECOUNT: Math.fround(this.frame | 0),
                        TIMEDELTA: Math.fround(1 / this.fps),
                    }) as Array<[string, SsfUniformValue]>
                );
                const scriptUniforms: Record<string, SsfUniformValue> = {};
                if (lane.script !== null) {
                    const result = lane.script.step({ dt: Math.fround(1 / this.fps), values: scriptValues });
                    if (!result.ok) lane.scriptError = String(result.error);
                    Object.assign(scriptUniforms, lane.script.uniforms());
                }
                if (lane.sandbox !== null && lane.scriptError === null) {
                    try {
                        const result = await lane.sandbox.step(
                            { dt: Math.fround(1 / this.fps), values: scriptValues },
                            lane.controls.values as Record<string, BlinkScriptControlValue>
                        );
                        if (!result.ok) lane.scriptError = result.error;
                        Object.assign(scriptUniforms, result.uniforms);
                        for (const [name, value] of Object.entries(result.controls)) lane.controls.set(name, value);
                    } catch (error) {
                        lane.scriptError = String(error);
                    }
                }
                const scriptMs = performance.now() - scriptStart;
                lane.effective = lane.processor.process(lane.controls.values, 1 / this.fps);
                const publicationStart = performance.now();
                const snapshot = lane.provider.snapshot(1 / this.fps, this.options.reactivity, this.options.audioSpeed);
                analysisMs += performance.now() - publicationStart;
                const uniforms: Record<string, UniformValue> = {};
                for (const [name, signal] of snapshot.signals)
                    if (typeof signal.value === 'number') uniforms[name] = signal.value;
                Object.assign(uniforms, scriptUniforms, {
                    TIME: Math.fround(this.frame / this.fps),
                    FRAMECOUNT: Math.fround(this.frame | 0),
                });
                lane.values = Object.fromEntries(
                    Object.entries(uniforms).filter(
                        (entry): entry is [string, SsfUniformValue] =>
                            typeof entry[1] === 'number' || entry[1] instanceof Float32Array
                    )
                );
                return { snapshot, controls: structuredClone(lane.effective), uniforms, analysisMs, scriptMs };
            })
        );
        this.sample = target;
        const [a, b] = laneFrames;
        let scalarMaxAbs = 0;
        let firstScalar: string | null = null;
        for (const [name, signal] of a.snapshot.signals) {
            const other = b.snapshot.signals.get(name)?.value;
            if (typeof signal.value !== 'number' || typeof other !== 'number') continue;
            const difference = compareArrays(new Float32Array([signal.value]), new Float32Array([other]));
            scalarMaxAbs = Math.max(scalarMaxAbs, difference.maxAbs);
            if (difference.firstMismatch !== null) firstScalar ??= name;
        }
        const validity: string[] = [];
        for (const [index, lane] of this.lanes.entries())
            if (lane.scriptError !== null)
                validity.push(`SCRIPT_ABORTED_${index === 0 ? 'A' : 'B'}: ${lane.scriptError}`);
        if (JSON.stringify(a.controls) !== JSON.stringify(b.controls)) validity.push('CONTROL_MISMATCH');
        if (a.snapshot.diagnostics.warmup === 'WARMING_UP' || b.snapshot.diagnostics.warmup === 'WARMING_UP')
            validity.push('WARMING_UP');
        if (b.snapshot.diagnostics.enhancedTempo === 'ORIGINAL_FALLBACK') validity.push('ORIGINAL_FALLBACK');
        return {
            frame: this.frame,
            time: this.frame / this.fps,
            a,
            b,
            validity,
            comparison: {
                scalarMaxAbs,
                firstScalar,
                spectrum: compareArrays(a.snapshot.spectrum, b.snapshot.spectrum),
                levelTrail: compareArrays(a.snapshot.levelTrail, b.snapshot.levelTrail),
            },
        };
    }
}
