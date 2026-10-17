// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlinkEffectIR } from '../../runtime/ir/types';
import type { BlinkScriptModule } from '../../runtime/script/types';
import type { GlobalUniforms, RendererConfig } from '../../types';
import { UniformType } from '../../types';
import type { AudioService } from '../AudioService';

interface StartData {
    readonly onUpdate: (delta: number) => void;
    readonly drawPasses: (context: unknown) => void;
}

const backendStats = { gpuFrameTimeMs: null as number | null, gpuMemoryBytes: 4096 };
const engineErrorHandlers: ((error: Error) => void)[] = [];
const setGpuTimingEnabled = vi.fn((enabled: boolean): boolean => enabled && gpuTimerPresent);
let gpuTimerPresent = true;

class StubExoApplication {
    public readonly backend = {
        stats: backendStats,
        setGpuTimingEnabled,
    };
    public readonly canvas = { width: 320, height: 240 };
    public readonly rendering = { supportsColorFormat: (): boolean => true };
    public readonly onError = { add: (handler: (error: Error) => void): number => engineErrorHandlers.push(handler) };
    public constructor(public readonly options: unknown) {}
    public start = vi.fn((): Promise<void> => Promise.resolve());
    public resize = vi.fn((width: number, height: number) => {
        this.canvas.width = width;
        this.canvas.height = height;
    });
    public stop = vi.fn();
    public destroy = vi.fn((): Promise<void> => Promise.resolve());
}

vi.mock('@codexo/exojs', async importOriginal => {
    const actual = await importOriginal<typeof import('@codexo/exojs')>();
    return { ...actual, Application: StubExoApplication };
});

const execute = vi.fn();

vi.mock('../../runtime/render/pass', () => ({
    BlinkPassRuntime: class {
        public dispose = vi.fn();
        public build = vi.fn();
        public execute = execute;
        public resize = vi.fn();
        public describePasses = vi.fn(() => []);
        public isDeclared = vi.fn(() => false);
    },
}));

vi.mock('../../runtime/audio/BlinkAudioTextureRuntime', () => ({
    BlinkAudioTextureRuntime: class {
        public frameIndex = 0;
        public destroy = vi.fn();
        public update = vi.fn();
        public surface = vi.fn(() => null);
    },
}));

const { RenderService } = await import('../RenderService');

const uniforms: GlobalUniforms = {
    TIME: UniformType.FLOAT,
    TIMEDELTA: UniformType.FLOAT,
    FRAMECOUNT: UniformType.INT,
    PASSINDEX: UniformType.INT,
    RESOLUTION: UniformType.FLOAT_VEC2,
    DATE: UniformType.FLOAT_VEC4,
    SURFACEPOSITION: UniformType.FLOAT_VEC2,
    MOUSE: UniformType.FLOAT_VEC4,
    BASS: UniformType.FLOAT_VEC4,
    MID: UniformType.FLOAT_VEC4,
    TREBLE: UniformType.FLOAT_VEC4,
    BASSTIME: UniformType.FLOAT,
    MIDTIME: UniformType.FLOAT,
    TREBLETIME: UniformType.FLOAT,
    BPM: UniformType.INT,
};

const rendererConfig = (): RendererConfig => ({
    view: document.createElement('canvas'),
    width: 320,
    height: 240,
    backgroundColor: 0x000000,
    backgroundAlpha: 1,
    useContextAlpha: false,
    antialias: false,
    clearBeforeRender: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
});

const audioService = (): AudioService =>
    ({
        destroy: vi.fn(),
        subscribePcm: vi.fn(() => Promise.resolve(() => undefined)),
        update: vi.fn(),
        bpm: 0,
        beatIntensity: 0,
        downbeatIntensity: 0,
        bassPhaseDrive: 0,
        midPhaseDrive: 0,
        treblePhaseDrive: 0,
        beatPhase: 0,
        onsetStrength: 0,
        beatPulseLevel: 0,
        downbeatPulseLevel: 0,
        inputLevel: 0,
        sampleRate: 48_000,
        frequencyEnergy: new Float32Array(12),
        rawFrequencyEnergy: new Float32Array(12),
        waveformData: null,
        fftSpectrum: null,
        fftSpectrumLog: null,
    }) as unknown as AudioService;

function effect(overrides: Partial<BlinkEffectIR> = {}): BlinkEffectIR {
    return {
        format: 'blinkfx-ir/1',
        metadata: {
            id: 'com.test.fx',
            title: 'FX',
            version: null,
            author: null,
            description: null,
            license: null,
            thumbnail: null,
            tags: [],
        },
        kind: 'generator',
        controls: [],
        hostInputs: [],
        assets: [],
        renderTargets: [],
        passes: [{ name: 'main', shader: 'main', target: 'screen', inputs: [] }] as unknown as BlinkEffectIR['passes'],
        shaders: { glsl: { main: { path: null, source: 'void main() {}', vertex: null, stage: 'visual' } }, wgsl: {} },
        presets: [],
        script: null,
        outputs: { visual: true, audio: null },
        requirements: { features: [], backends: [] },
        fallbacks: {},
        compatibility: null,
        diagnostics: [],
        ...overrides,
    };
}

async function startedService(
    loadModule?: () => Promise<BlinkScriptModule>,
    loadSource?: (entry: string) => Promise<string>
): Promise<{ service: InstanceType<typeof RenderService>; frame: StartData }> {
    const service = new RenderService(audioService(), rendererConfig(), uniforms, loadModule, loadSource);
    await service.start();
    const app = (service as unknown as { app: StubExoApplication }).app;
    const frame = (app.start.mock.calls[0] as unknown as [unknown, { data: StartData }])[1].data;
    return { service, frame };
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('RenderService - fault isolation', () => {
    it('resizes presentation without changing target dimensions or pass history', async () => {
        const { service } = await startedService();
        const app = service.application as unknown as StubExoApplication;
        expect((app.options as { canvas: { width: number; height: number } }).canvas).toMatchObject({
            width: 1920,
            height: 1080,
        });
        service.resize(600, 600);
        expect(app.resize).not.toHaveBeenCalled();
        const original = service.outputSettings;
        service.setOutputSettings({ ...original, fitting: 'cover', uiScale: 1.5 });
        expect(app.resize).not.toHaveBeenCalled();
        service.setOutputSettings({ ...original, width: 1280, height: 720 });
        expect(app.resize).toHaveBeenCalledTimes(1);
        expect(app.resize).toHaveBeenCalledWith(1280, 720);
        service.resize(100, 900);
        expect(app.resize).toHaveBeenCalledTimes(1);
        expect(service.getDiagnosticsSnapshot().screen).toEqual([1280, 720]);
        await service.destroy();
    });

    beforeEach(() => {
        execute.mockReset();
        backendStats.gpuFrameTimeMs = null;
        engineErrorHandlers.length = 0;
        setGpuTimingEnabled.mockClear();
        gpuTimerPresent = true;
    });

    it('keeps the frame loop alive when the passes throw, and switches them off after repeated failures', async () => {
        const { service, frame } = await startedService();
        await service.updateBlinkFxShader(effect());
        execute.mockImplementation(() => {
            throw new Error('shader exploded');
        });

        expect(() => {
            for (let i = 0; i < 5; i++) frame.drawPasses({});
        }).not.toThrow();

        expect(execute).toHaveBeenCalledTimes(3);
        expect(service.faults()).toEqual([
            { source: 'render', kind: 'error', message: 'shader exploded', occurrences: 3, disabled: true },
        ]);
    });

    it('tells a listener when a part first faults and when it is switched off', async () => {
        const { service, frame } = await startedService();
        await service.updateBlinkFxShader(effect());
        execute.mockImplementation(() => {
            throw new Error('shader exploded');
        });
        const listener = vi.fn();
        service.onHealthChange.add(listener);

        for (let i = 0; i < 3; i++) frame.drawPasses({});

        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('lets a pass failure that fixes itself pass without disabling anything', async () => {
        const { service, frame } = await startedService();
        await service.updateBlinkFxShader(effect());
        execute.mockImplementationOnce(() => {
            throw new Error('one bad frame');
        });

        for (let i = 0; i < 5; i++) frame.drawPasses({});

        expect(execute).toHaveBeenCalledTimes(5);
        expect(service.faults()[0]).toMatchObject({ source: 'render', occurrences: 1, disabled: false });
    });

    it('clears the faults when another effect is loaded', async () => {
        const { service, frame } = await startedService();
        await service.updateBlinkFxShader(effect());
        execute.mockImplementation(() => {
            throw new Error('shader exploded');
        });
        for (let i = 0; i < 3; i++) frame.drawPasses({});
        expect(service.faults()).toHaveLength(1);

        execute.mockReset();
        await service.updateBlinkFxShader(effect());
        frame.drawPasses({});

        expect(service.faults()).toEqual([]);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('measures every frame against the budget', async () => {
        const { service, frame } = await startedService();
        await service.updateBlinkFxShader(effect());

        for (let i = 0; i < 4; i++) {
            frame.onUpdate(1 / 60);
            frame.drawPasses({});
        }

        const report = service.frameTimeReport();
        expect(report.frames).toBe(4);
        expect(report.frame.budgetMs).toBeGreaterThan(0);
        expect(service.getDiagnosticsSnapshot().frameTimes?.frames).toBe(4);
    });

    it('records the hardware GPU time once profiling is on, each result once', async () => {
        const { service, frame } = await startedService();
        await service.updateBlinkFxShader(effect());

        expect(service.setProfilingEnabled(true)).toBe(true);
        for (const ms of [4, 4, 4, 8]) {
            backendStats.gpuFrameTimeMs = ms;
            frame.drawPasses({});
        }

        expect(service.frameTimeReport().gpu).toMatchObject({ meanMs: 6, maxMs: 8 });
    });

    it('records no GPU time while profiling is off', async () => {
        const { service, frame } = await startedService();
        await service.updateBlinkFxShader(effect());

        backendStats.gpuFrameTimeMs = 5;
        frame.drawPasses({});

        expect(service.frameTimeReport().gpu).toBeNull();
        expect(setGpuTimingEnabled).not.toHaveBeenCalled();
    });

    it('says so when the device has no GPU timer, and records nothing', async () => {
        gpuTimerPresent = false;
        const { service, frame } = await startedService();
        await service.updateBlinkFxShader(effect());

        expect(service.setProfilingEnabled(true)).toBe(false);
        backendStats.gpuFrameTimeMs = 5;
        frame.drawPasses({});

        expect(service.frameTimeReport().gpu).toBeNull();
    });

    it('reports the engine estimate of GPU memory in the diagnostics', async () => {
        const { service } = await startedService();

        expect(service.getDiagnosticsSnapshot().gpuMemoryBytes).toBe(4096);
    });

    // The engine's error signal carries both frame errors (a queued draw that fails at the
    // end-of-frame flush) and the backend's asynchronous render errors.
    it('records an error the engine reports after the draw call returned', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { service } = await startedService();
        await service.updateBlinkFxShader(effect());

        engineErrorHandlers[0](new Error('WGSL compilation failed'));

        expect(service.faults()).toEqual([
            { source: 'render', kind: 'error', message: 'WGSL compilation failed', occurrences: 1, disabled: false },
        ]);
    });

    it('switches off a blink/1 script whose frame never settles, and keeps rendering', async () => {
        const module: BlinkScriptModule = { update: () => new Promise<void>(() => undefined) };
        const { service, frame } = await startedService(() => Promise.resolve(module));
        await service.updateBlinkFxShader(effect({ script: { entry: 'scripts/main.js', abi: 'blink/1', events: [] } }));

        const realNow = performance.now.bind(performance);
        let offset = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => realNow() + offset);
        try {
            frame.onUpdate(1 / 60);
            offset = 5000;
            frame.onUpdate(1 / 60);
        } finally {
            vi.restoreAllMocks();
        }
        frame.drawPasses({});

        expect(service.faults()).toEqual([expect.objectContaining({ source: 'script', kind: 'hang', disabled: true })]);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('records a script that throws every frame and then stops running it', async () => {
        const update = vi.fn(() => {
            throw new Error('script bug');
        });
        const { service, frame } = await startedService(() => Promise.resolve({ update } as BlinkScriptModule));
        await service.updateBlinkFxShader(effect({ script: { entry: 'scripts/main.js', abi: 'blink/1', events: [] } }));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        for (let i = 0; i < 6; i++) {
            frame.onUpdate(1 / 60);
            await settle();
        }

        expect(update).toHaveBeenCalledTimes(3);
        expect(service.faults()).toEqual([
            { source: 'script', kind: 'error', message: 'script bug', occurrences: 3, disabled: true },
        ]);
    });

    it('delivers queued native bangs once each to an SSF script and clears event state', async () => {
        const source = 'var count = 0; function update() { if (Trigger > 0) count++; setUniform("level", count); }';
        const { service, frame } = await startedService(undefined, () => Promise.resolve(source));
        await service.updateBlinkFxShader(
            effect({
                controls: [{ name: 'Trigger', label: null, description: null, group: null, type: 'bang' }],
                script: { entry: 'script.js', abi: 'ssf/1', events: [] },
                compatibility: {
                    source: { format: 'ssf', version: null },
                    profile: 'ssf/1',
                    mode: 'preserve',
                    converter: null,
                    controls: {},
                    scriptUniforms: { level: 'float' },
                },
            })
        );
        service.fireBangControl('Trigger');
        service.fireBangControl('Trigger');
        service.fireBangControl('Trigger');
        for (let i = 0; i < 6; i++) frame.onUpdate(1 / 60);
        expect(service.getDiagnosticsSnapshot().audio.level).toBe(3);
        expect(service.controlValues.Trigger).toBe(0);
        expect(service.faults()).toEqual([]);
        service.fireBangControl('Trigger');
        service.resetControlValue('Trigger');
        frame.onUpdate(1 / 60);
        expect(service.getDiagnosticsSnapshot().audio.level).toBe(3);
        await service.destroy();
    });

    it('resets raw defaults and compatibility state together', async () => {
        const { service, frame } = await startedService();
        await service.updateBlinkFxShader(
            effect({
                controls: [
                    {
                        name: 'Counter',
                        label: null,
                        description: null,
                        group: null,
                        type: 'float',
                        default: 0,
                        min: 0,
                        max: 64,
                        step: null,
                    },
                ],
                compatibility: {
                    source: { format: 'ssf', version: null },
                    profile: 'ssf/1',
                    mode: 'preserve',
                    converter: null,
                    controls: { Counter: { format: 'ssf', type: 'bang counter', modifiers: ['counter'] } },
                    scriptUniforms: {},
                },
            })
        );
        service.fireBangControl('Counter');
        frame.onUpdate(1 / 60);
        expect(
            (service as unknown as { profileControlValues: Record<string, number> }).profileControlValues.Counter
        ).toBe(1);
        service.resetControlValue('Counter');
        frame.onUpdate(1 / 60);
        expect(service.controlValues.Counter).toBe(0);
        expect(
            (service as unknown as { profileControlValues: Record<string, number> }).profileControlValues.Counter
        ).toBe(0);
        expect(() => service.fireBangControl('missing')).toThrow();
        await service.destroy();
    });

    it('routes right, middle and chord DOM events to SSF scripts and common shader uniforms', async () => {
        const source = 'function update() { setUniform("level", _click.x + _click.y * 10 + _click.z * 100); }';
        const { service, frame } = await startedService(undefined, () => Promise.resolve(source));
        await service.updateBlinkFxShader(
            effect({
                script: { entry: 'script.js', abi: 'ssf/1', events: [] },
                compatibility: {
                    source: { format: 'ssf', version: null },
                    profile: 'ssf/1',
                    mode: 'preserve',
                    converter: null,
                    controls: {},
                    scriptUniforms: { level: 'float' },
                },
            })
        );
        vi.spyOn(service.view, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 1920,
            height: 1080,
        } as DOMRect);
        const events: [string, number, number, number, number[]][] = [
            ['pointerdown', 2, 2, 10, [0, 1, 0]],
            ['pointermove', 0, 7, 111, [1, 1, 1]],
            ['pointermove', 2, 5, 101, [1, 0, 1]],
            ['pointermove', 1, 1, 1, [1, 0, 0]],
            ['pointerup', 0, 0, 0, [0, 0, 0]],
            ['pointerdown', 1, 4, 100, [0, 0, 1]],
            ['pointercancel', 1, 0, 0, [0, 0, 0]],
        ];
        const runtime = service as unknown as {
            collectFrameUniforms(
                out: Record<string, unknown>,
                pass: number,
                resolution: readonly [number, number],
                audio: Record<string, unknown>
            ): Record<string, unknown>;
        };
        for (const [type, button, buttons, expected, tuple] of events) {
            service.view.dispatchEvent(new MouseEvent(type, { clientX: 400, clientY: 200, button, buttons }));
            frame.onUpdate(1 / 60);
            expect(service.getDiagnosticsSnapshot().audio.level).toBe(expected);
            const values = runtime.collectFrameUniforms({}, 0, [1920, 1080], {});
            expect(Array.from(values.bl_pointerButtons as Float32Array)).toEqual(tuple);
            expect(values.bl_pointerDown).toBe(tuple[0]);
        }
        expect(service.faults()).toEqual([]);
        await service.destroy();
    });

    it('publishes SSF pointer globals before priming and each script frame', async () => {
        const source =
            'var initial = -1; function update() { if (initial < 0) initial = _click.x; setUniform("level", initial + _click.x + _muv.x + _muvc.y + 1); }';
        const { service, frame } = await startedService(undefined, () => Promise.resolve(source));
        await service.updateBlinkFxShader(
            effect({
                script: { entry: 'script.js', abi: 'ssf/1', events: [] },
                compatibility: {
                    source: { format: 'ssf', version: null },
                    profile: 'ssf/1',
                    mode: 'preserve',
                    converter: null,
                    controls: {},
                    scriptUniforms: { level: 'float' },
                },
            })
        );
        frame.onUpdate(1 / 60);
        expect(service.faults()).toEqual([]);
        expect(service.getDiagnosticsSnapshot().audio.level).toBe(0.5);
    });

    it('uses the resized output height for pointer events before the next frame', async () => {
        const source = 'function update() { setUniform("level", _muv.y); }';
        const { service, frame } = await startedService(undefined, () => Promise.resolve(source));
        await service.updateBlinkFxShader(
            effect({
                script: { entry: 'script.js', abi: 'ssf/1', events: [] },
                compatibility: {
                    source: { format: 'ssf', version: null },
                    profile: 'ssf/1',
                    mode: 'preserve',
                    converter: null,
                    controls: {},
                    scriptUniforms: { level: 'float' },
                },
            })
        );
        frame.onUpdate(1 / 60);
        service.setOutputSettings({ ...service.outputSettings, width: 800, height: 800, fitting: 'fill' });
        vi.spyOn(service.view, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 800,
            height: 800,
        } as DOMRect);
        service.view.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 0 }));
        frame.onUpdate(1 / 60);
        expect(service.getDiagnosticsSnapshot().audio.level).toBe(1);
        await service.destroy();
    });

    it('records an ssf/1 script that throws every frame, and keeps its last uniforms', async () => {
        const source =
            'let n = 0; function update() { n += 1; setUniform("level", n); if (n > 1) throw new Error("ssf bug"); }';
        const { service, frame } = await startedService(undefined, () => Promise.resolve(source));
        await service.updateBlinkFxShader(
            effect({
                script: { entry: 'script.js', abi: 'ssf/1', events: [] },
                compatibility: {
                    source: { format: 'ssf', version: null },
                    profile: 'ssf/1',
                    mode: 'preserve',
                    converter: null,
                    controls: {},
                    scriptUniforms: { level: 'float' },
                },
            })
        );
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        for (let i = 0; i < 6; i++) frame.onUpdate(1 / 60);

        expect(service.faults()).toEqual([
            expect.objectContaining({ source: 'ssfScript', kind: 'error', disabled: true }),
        ]);
        expect(service.getDiagnosticsSnapshot().audio.level).toBeGreaterThan(0);
    });
    it('keeps native bang inputs available after event and update awaits while clearing raw frame values', async () => {
        type Context = Parameters<NonNullable<BlinkScriptModule['update']>>[0];
        const observed: number[] = [];
        const module: BlinkScriptModule = {
            hit: async (ctx: Context, value: unknown): Promise<void> => {
                await Promise.resolve();
                observed.push(Number(value), Number(ctx.controls.get('Trigger')));
            },
            update: async (ctx: Context): Promise<void> => {
                await Promise.resolve();
                observed.push(Number(ctx.controls.get('Trigger')));
            },
        };
        const { service, frame } = await startedService(() => Promise.resolve(module));
        await service.updateBlinkFxShader(
            effect({
                controls: [{ name: 'Trigger', label: null, description: null, group: null, type: 'bang' }],
                script: {
                    entry: 'script.js',
                    abi: 'blink/1',
                    events: [{ input: 'Trigger', on: 'offToOn', handler: 'hit' }],
                },
            })
        );
        service.fireBangControl('Trigger');
        frame.onUpdate(1 / 60);
        expect(service.controlValues.Trigger).toBe(0);
        await settle();
        expect(observed).toEqual([1, 1, 1]);
        expect(service.faults()).toEqual([]);
        await service.destroy();
    });

    it('retains a queued native bang and its zero gap while an event handler spans several frames', async () => {
        type Context = Parameters<NonNullable<BlinkScriptModule['update']>>[0];
        let release = (): void => undefined;
        const blocked = new Promise<void>(resolve => {
            release = resolve;
        });
        let hits = 0;
        const observed: number[] = [];
        const updates: number[] = [];
        const module: BlinkScriptModule = {
            hit: async (ctx: Context): Promise<void> => {
                hits += 1;
                if (hits === 1) await blocked;
                await Promise.resolve();
                observed.push(Number(ctx.controls.get('Trigger')));
            },
            update: (ctx: Context): void => {
                updates.push(Number(ctx.controls.get('Trigger')));
            },
        };
        const { service, frame } = await startedService(() => Promise.resolve(module));
        await service.updateBlinkFxShader(
            effect({
                controls: [{ name: 'Trigger', label: null, description: null, group: null, type: 'bang' }],
                script: {
                    entry: 'script.js',
                    abi: 'blink/1',
                    events: [{ input: 'Trigger', on: 'offToOn', handler: 'hit' }],
                },
            })
        );
        service.fireBangControl('Trigger');
        frame.onUpdate(1 / 60);
        service.fireBangControl('Trigger');
        for (let i = 0; i < 4; i++) frame.onUpdate(1 / 60);
        expect(hits).toBe(1);
        expect(updates).toEqual([]);
        expect(service.controlValues.Trigger).toBe(0);

        release();
        await settle();
        expect(observed).toEqual([1]);
        expect(updates).toEqual([1]);
        frame.onUpdate(1 / 60);
        await settle();
        expect(hits).toBe(1);
        expect(updates).toEqual([1, 0]);
        frame.onUpdate(1 / 60);
        await settle();
        expect(hits).toBe(2);
        expect(observed).toEqual([1, 1]);
        expect(updates).toEqual([1, 0, 1]);
        expect(service.controlValues.Trigger).toBe(0);
        expect(service.faults()).toEqual([]);
        await service.destroy();
    });
});
