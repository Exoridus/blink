// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlinkControlSpec } from '../../runtime/ir/types';
import type { EnvService } from '../../services/EnvService';
import type { RenderService } from '../../services/RenderService';
import type { ShellRuntimeState } from '../../ui/shell/ShellHost';

const statisticsCtor = vi.fn();
const statisticsDestroy = vi.fn();
const bridge = { marker: 'bridge' };

vi.mock('../Statistics', () => ({
    Statistics: class {
        public constructor(renderService: unknown) {
            statisticsCtor(renderService);
        }
        public destroy(): void {
            statisticsDestroy();
        }
    },
}));

vi.mock('../../runtime/audio/BlinkAudioDebugBridge', () => ({
    createBlinkAudioDebugBridge: (): typeof bridge => bridge,
}));

const { Application } = await import('../Application');

interface RenderServiceStub {
    stop: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    applyControlValues: ReturnType<typeof vi.fn>;
    getDiagnosticsSnapshot: ReturnType<typeof vi.fn>;
    controlSpecs: readonly BlinkControlSpec[];
    controlValues: Record<string, number>;
    /** Drives the host's diagnostics pump the way the frame loop would. */
    tick: () => void;
    frameListenerCount: () => number;
}

const createRenderService = (): RenderService & RenderServiceStub => {
    const frameListeners = new Set<() => void>();
    const service = {
        stop: vi.fn(),
        destroy: vi.fn((): Promise<void> => Promise.resolve()),
        applyControlValues: vi.fn(),
        fireBangControl: vi.fn(),
        resetControlValue: vi.fn(),
        getDiagnosticsSnapshot: vi.fn(() => ({ frame: 7 })),
        compatibilityReport: vi.fn(() => null),
        faults: vi.fn(() => []),
        analysisMode: 'original',
        presetAnalysisMode: vi.fn(),
        setAnalysisMode: vi.fn((): Promise<void> => Promise.resolve()),
        setProfilingEnabled: vi.fn(() => true),
        onHealthChange: { add: vi.fn(), remove: vi.fn() },
        controlSpecs: [] as readonly BlinkControlSpec[],
        controlValues: {} as Record<string, number>,
        audioTextureRuntime: {},
        currentFrameIndex: 0,
        currentAnalyserDb: null,
        getAnalyserMetadata: (): Record<string, unknown> => ({}),
        onUpdate: {
            add: vi.fn((handler: () => void) => frameListeners.add(handler)),
            remove: vi.fn((handler: () => void) => frameListeners.delete(handler)),
        },
        addChild: vi.fn(),
        screenHeight: 0,
        application: {},
        tick: (): void => {
            for (const handler of [...frameListeners]) {
                handler();
            }
        },
        frameListenerCount: (): number => frameListeners.size,
    };
    return service as unknown as RenderService & RenderServiceStub;
};

const envService = (environment: 'development' | 'production'): EnvService =>
    ({
        environment,
        version: '0.0.0-test',
        inProductionBuild: environment === 'production',
        isDevelopmentBuild: environment === 'development',
    }) as EnvService;

const blinkFxService = {
    getPackageList: vi.fn(),
    loadPackage: vi.fn(),
    installPackage: vi.fn(),
    removePackage: vi.fn(),
    releasePackage: vi.fn(),
};

const globalWindow = window as unknown as Record<string, unknown>;

describe('Application.destroy', () => {
    beforeEach(() => {
        delete globalWindow.blinkAudioDebug;
        statisticsCtor.mockClear();
        statisticsDestroy.mockClear();
    });

    it('destroys the render service instead of only halting its loop', async () => {
        const renderService = createRenderService();
        const application = new Application(envService('production'), renderService, blinkFxService as never);

        await application.destroy();

        expect(renderService.destroy).toHaveBeenCalledTimes(1);
        expect(renderService.stop).not.toHaveBeenCalled();
    });

    it('drops the development debug bridge that would otherwise keep the audio runtime alive', async () => {
        const application = new Application(envService('development'), createRenderService(), blinkFxService as never);
        expect(globalWindow.blinkAudioDebug).toBe(bridge);

        await application.destroy();

        expect('blinkAudioDebug' in globalWindow).toBe(false);
    });

    it('drops the debug bridge even when the render service teardown throws', async () => {
        const renderService = createRenderService();
        renderService.destroy.mockRejectedValueOnce(new Error('backend teardown failed'));
        const application = new Application(envService('development'), renderService, blinkFxService as never);

        await expect(application.destroy()).rejects.toThrow('backend teardown failed');

        expect('blinkAudioDebug' in globalWindow).toBe(false);
    });

    it('detaches the statistics overlay before the render service it subscribes to', async () => {
        const renderService = createRenderService();
        renderService.destroy.mockImplementationOnce((): Promise<void> => {
            expect(statisticsDestroy).toHaveBeenCalledTimes(1);
            return Promise.resolve();
        });
        const application = new Application(envService('development'), renderService, blinkFxService as never);

        await application.destroy();

        expect(statisticsDestroy).toHaveBeenCalledTimes(1);
    });
});

describe('Application.stop', () => {
    it('halts the frame loop without destroying anything', () => {
        const renderService = createRenderService();
        const application = new Application(envService('production'), renderService, blinkFxService as never);

        application.stop();

        expect(renderService.stop).toHaveBeenCalledTimes(1);
        expect(renderService.destroy).not.toHaveBeenCalled();
    });
});

const stubShaderUpdateFor = (renderService: RenderService & RenderServiceStub): void => {
    (renderService as unknown as { updateBlinkFxShader: unknown }).updateBlinkFxShader = vi.fn((): Promise<void> =>
        Promise.resolve()
    );
};

describe('Application as a ShellHost', () => {
    const buildHost = (renderService: RenderService & RenderServiceStub): InstanceType<typeof Application> =>
        new Application(envService('production'), renderService, blinkFxService as never);

    const stubShaderUpdate = (renderService: RenderService & RenderServiceStub, onUpdate?: () => void): void => {
        (renderService as unknown as { updateBlinkFxShader: unknown }).updateBlinkFxShader = vi.fn(
            (): Promise<void> => {
                onUpdate?.();
                return Promise.resolve();
            }
        );
    };

    it('publishes source-control widget metadata and clears it on a native switch', async () => {
        const renderService = createRenderService();
        const application = buildHost(renderService);
        const listener = vi.fn();
        application.subscribeState(listener);
        const sources = { knob: { format: 'ssf', type: 'knob smooth', modifiers: ['smooth'] } };
        blinkFxService.loadPackage.mockResolvedValueOnce({ compatibility: { controls: sources } });
        stubShaderUpdate(renderService);
        await application.switchEffect('gallery');
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ controlSources: sources }));
        blinkFxService.loadPackage.mockResolvedValueOnce({ compatibility: null });
        await application.switchEffect('native');
        expect((listener.mock.calls.at(-1)?.[0] as ShellRuntimeState | undefined)?.controlSources).toBeUndefined();
    });

    it('forwards trigger and reset actions to the active control runtime', () => {
        const renderService = createRenderService();
        const application = buildHost(renderService);
        application.fireBang('trigger');
        application.resetControl('speed');
        expect(
            (renderService as unknown as { fireBangControl: ReturnType<typeof vi.fn> }).fireBangControl
        ).toHaveBeenCalledWith('trigger');
        expect(
            (renderService as unknown as { resetControlValue: ReturnType<typeof vi.fn> }).resetControlValue
        ).toHaveBeenCalledWith('speed');
    });

    it('pushes the current state to a new state subscriber before returning', () => {
        const renderService = createRenderService();
        renderService.controlSpecs = [{ name: 'gain' } as BlinkControlSpec];
        const listener = vi.fn();

        buildHost(renderService).subscribeState(listener);

        expect(listener).toHaveBeenCalledWith({
            activeEffectId: null,
            controls: renderService.controlSpecs,
            presets: [],
            controlValues: {},
            compatibility: null,
            faults: [],
            media: { inputs: [], kind: 'none', label: '' },
            analysis: { mode: 'original', applicable: false },
        });
    });

    it('pushes the new controls once an effect switch has committed', async () => {
        const renderService = createRenderService();
        const application = buildHost(renderService);
        const listener = vi.fn();
        application.subscribeState(listener);
        listener.mockClear();

        const switched = [{ name: 'cutoff' } as BlinkControlSpec];
        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'com.codexo.b' });
        stubShaderUpdate(renderService, () => {
            renderService.controlSpecs = switched;
        });

        await application.switchEffect('com.codexo.b');

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
            activeEffectId: 'com.codexo.b',
            controls: switched,
            presets: [],
            controlValues: {},
            compatibility: null,
            faults: [],
            media: { inputs: [], kind: 'none', label: '' },
            analysis: { mode: 'original', applicable: false },
        });
    });

    it('stops pushing state to an unsubscribed listener', async () => {
        const renderService = createRenderService();
        const application = buildHost(renderService);
        const listener = vi.fn();
        const unsubscribe = application.subscribeState(listener);
        listener.mockClear();
        unsubscribe();

        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'com.codexo.b' });
        stubShaderUpdate(renderService);
        await application.switchEffect('com.codexo.b');

        expect(listener).not.toHaveBeenCalled();
    });

    it('runs the frame-loop subscription only while diagnostics are being listened to', () => {
        const renderService = createRenderService();
        const application = buildHost(renderService);
        expect(renderService.frameListenerCount()).toBe(0);

        const first = application.subscribeDiagnostics(vi.fn());
        const second = application.subscribeDiagnostics(vi.fn());
        expect(renderService.frameListenerCount()).toBe(1);

        first();
        expect(renderService.frameListenerCount()).toBe(1);
        second();
        expect(renderService.frameListenerCount()).toBe(0);
    });

    it('pushes one diagnostics event immediately and then at the host rate, not per frame', () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'));
            const renderService = createRenderService();
            const listener = vi.fn();
            buildHost(renderService).subscribeDiagnostics(listener);
            expect(listener).toHaveBeenCalledTimes(1);

            renderService.tick();
            renderService.tick();
            expect(listener).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(100);
            renderService.tick();
            expect(listener).toHaveBeenCalledTimes(2);
            expect(listener).toHaveBeenLastCalledWith({ ok: true, snapshot: { frame: 7 } });
        } finally {
            vi.useRealTimers();
        }
    });

    it('turns a failing snapshot into a diagnostics event rather than a throw', () => {
        const renderService = createRenderService();
        renderService.getDiagnosticsSnapshot.mockImplementation(() => {
            throw new Error('unknown render target');
        });
        const listener = vi.fn();

        buildHost(renderService).subscribeDiagnostics(listener);

        expect(listener).toHaveBeenCalledWith({ ok: false, message: 'unknown render target' });
    });

    it('drops every subscription and the frame-loop hook on destroy', async () => {
        const renderService = createRenderService();
        const application = buildHost(renderService);
        const diagnostics = vi.fn();
        application.subscribeDiagnostics(diagnostics);
        diagnostics.mockClear();

        await application.destroy();

        expect(renderService.frameListenerCount()).toBe(0);
        renderService.tick();
        expect(diagnostics).not.toHaveBeenCalled();
    });
});

describe('Application push isolation and ordering', () => {
    const buildHost = (renderService: RenderService & RenderServiceStub): InstanceType<typeof Application> =>
        new Application(envService('production'), renderService, blinkFxService as never);

    it('keeps pushing state to the other subscribers when one of them throws', async () => {
        const renderService = createRenderService();
        const application = buildHost(renderService);
        const failing = vi.fn(() => {
            throw new Error('panel is broken');
        });
        const healthy = vi.fn();
        application.subscribeState(failing);
        application.subscribeState(healthy);
        healthy.mockClear();

        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'com.codexo.b' });
        (renderService as unknown as { updateBlinkFxShader: unknown }).updateBlinkFxShader = vi.fn((): Promise<void> =>
            Promise.resolve()
        );

        // The effect is already running at this point, so a broken panel must not turn the
        // switch into a failure.
        await expect(application.switchEffect('com.codexo.b')).resolves.toBeUndefined();
        expect(healthy).toHaveBeenCalledTimes(1);
    });

    it('keeps the diagnostics pump alive when a subscriber throws', () => {
        const renderService = createRenderService();
        const application = buildHost(renderService);
        application.subscribeDiagnostics(() => {
            throw new Error('panel is broken');
        });
        const healthy = vi.fn();
        application.subscribeDiagnostics(healthy);
        healthy.mockClear();

        expect(() => renderService.tick()).not.toThrow();
        expect(renderService.frameListenerCount()).toBe(1);
    });

    it('does not reset the shared push cadence when a later subscriber joins', () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'));
            const renderService = createRenderService();
            const application = buildHost(renderService);
            const first = vi.fn();
            application.subscribeDiagnostics(first);
            first.mockClear();

            vi.advanceTimersByTime(90);
            application.subscribeDiagnostics(vi.fn());

            vi.advanceTimersByTime(10);
            renderService.tick();

            expect(first).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('commits overlapping switches in the order they were issued', async () => {
        const renderService = createRenderService();
        const application = buildHost(renderService);
        const listener = vi.fn();
        application.subscribeState(listener);
        listener.mockClear();

        // The first switch loads slowly, the second instantly: without serialization the slow
        // one would commit last and the shell would end up on the effect nobody asked for.
        let releaseSlow = (): void => undefined;
        const slowLoad = new Promise<{ id: string }>((resolve): void => {
            releaseSlow = (): void => resolve({ id: 'slow' });
        });
        blinkFxService.loadPackage.mockImplementationOnce(() => slowLoad).mockResolvedValueOnce({ id: 'fast' });
        (renderService as unknown as { updateBlinkFxShader: unknown }).updateBlinkFxShader = vi.fn((): Promise<void> =>
            Promise.resolve()
        );

        const slow = application.switchEffect('slow');
        const fast = application.switchEffect('fast');
        releaseSlow();
        await Promise.all([slow, fast]);

        const pushedIds = listener.mock.calls.map(([state]) => (state as ShellRuntimeState).activeEffectId);
        expect(pushedIds).toEqual(['slow', 'fast']);
    });
});

describe('Application.applyPreset', () => {
    const withPresets = (renderService: RenderService & RenderServiceStub): InstanceType<typeof Application> =>
        new Application(envService('production'), renderService, blinkFxService as never);

    it('rejects a preset the running effect does not declare', async () => {
        const application = withPresets(createRenderService());

        await expect(application.applyPreset('nope')).rejects.toThrow(/Unknown preset/);
    });

    // The preset file fetch is long enough for a switch to land; writing afterwards would put one
    // effect's values into another's controls wherever a control name happens to be shared.
    it('discards a preset whose effect was switched away while it loaded', async () => {
        const renderService = createRenderService();
        const application = withPresets(renderService);
        stubShaderUpdateFor(renderService);

        let releaseFetch = (): void => undefined;
        const pending = new Promise<Response>(resolve => {
            releaseFetch = () => resolve(new Response('{"values":{"gain":0.5}}', { status: 200 }));
        });
        vi.stubGlobal('fetch', () => pending);

        blinkFxService.loadPackage.mockResolvedValueOnce({
            id: 'a',
            controls: [{ name: 'gain' } as BlinkControlSpec],
            presets: [{ name: 'warm', path: 'presets/warm.json' }],
        });
        await application.switchEffect('a');

        const applying = application.applyPreset('warm');
        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'b', controls: [], presets: [] });
        await application.switchEffect('b');
        releaseFetch();

        await expect(applying).rejects.toThrow(/the effect changed while it loaded/);
        expect(renderService.applyControlValues).not.toHaveBeenCalled();
    });

    const buildHost = (renderService: RenderService & RenderServiceStub): InstanceType<typeof Application> =>
        new Application(envService('production'), renderService, blinkFxService as never);

    it('hands an archive to the service to install and returns its list entry', async () => {
        const entry = {
            id: 'mine',
            title: 'Mine',
            description: '',
            basePath: 'blinkfx-installed/mine',
            installed: true,
        };
        blinkFxService.installPackage.mockResolvedValueOnce(entry);
        const archive = new Uint8Array([1, 2, 3]);

        await expect(buildHost(createRenderService()).installPackage(archive)).resolves.toBe(entry);

        expect(blinkFxService.installPackage).toHaveBeenCalledWith(archive, undefined);
    });

    it('removes an installed package through the service', async () => {
        blinkFxService.removePackage.mockResolvedValueOnce(undefined);

        await buildHost(createRenderService()).removePackage('mine');

        expect(blinkFxService.removePackage).toHaveBeenCalledWith('mine');
    });

    // The running effect's shaders, assets and presets are served from the package being removed.
    it('refuses to remove the running effect and leaves it installed', async () => {
        blinkFxService.removePackage.mockClear();
        const renderService = createRenderService();
        stubShaderUpdateFor(renderService);
        const application = buildHost(renderService);
        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'running', controls: [], presets: [] });
        await application.switchEffect('running');

        await expect(application.removePackage('running')).rejects.toThrow(/running effect/);

        expect(blinkFxService.removePackage).not.toHaveBeenCalled();
    });

    // GPU timing costs query objects and a timestamp pair per pass: it runs only while a panel shows it.
    it('measures GPU time only while someone is subscribed to the diagnostics', () => {
        const renderService = createRenderService();
        const host = buildHost(renderService);

        const first = host.subscribeDiagnostics(vi.fn());
        const second = host.subscribeDiagnostics(vi.fn());
        expect(renderService.setProfilingEnabled).toHaveBeenCalledTimes(1);
        expect(renderService.setProfilingEnabled).toHaveBeenLastCalledWith(true);

        first();
        expect(renderService.setProfilingEnabled).toHaveBeenCalledTimes(1);
        second();
        expect(renderService.setProfilingEnabled).toHaveBeenCalledTimes(2);
        expect(renderService.setProfilingEnabled).toHaveBeenLastCalledWith(false);
    });

    it('tells the service which package is running, so installing cannot replace or evict it', async () => {
        const renderService = createRenderService();
        stubShaderUpdateFor(renderService);
        const application = buildHost(renderService);
        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'running', controls: [], presets: [] });
        await application.switchEffect('running');
        blinkFxService.installPackage.mockClear();

        await application.installPackage(new Uint8Array([1]));

        expect(blinkFxService.installPackage).toHaveBeenCalledWith(expect.any(Uint8Array), 'running');
    });

    // The switch has not committed its id yet, so a removal that ran meanwhile would pass the
    // running-effect check and unmount files the switch is still loading.
    it('removes a package only after a switch in flight has finished', async () => {
        blinkFxService.removePackage.mockClear();
        const renderService = createRenderService();
        let finishLoad = (): void => undefined;
        (renderService as unknown as { updateBlinkFxShader: unknown }).updateBlinkFxShader = vi.fn(
            () =>
                new Promise<void>(resolve => {
                    finishLoad = resolve;
                })
        );
        const application = buildHost(renderService);
        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'target', controls: [], presets: [] });
        const switching = application.switchEffect('target');
        await Promise.resolve();

        const removing = application.removePackage('target');
        await Promise.resolve();
        expect(blinkFxService.removePackage).not.toHaveBeenCalled();

        finishLoad();
        await switching;
        await expect(removing).rejects.toThrow(/running effect/);
        expect(blinkFxService.removePackage).not.toHaveBeenCalled();
    });

    // The old effect's shaders, assets and presets come from its mount until the new one commits.
    it("frees the previous effect's package only after the next effect has loaded", async () => {
        blinkFxService.releasePackage.mockClear();
        const renderService = createRenderService();
        stubShaderUpdateFor(renderService);
        const application = buildHost(renderService);
        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'a', controls: [], presets: [] });
        await application.switchEffect('a');
        expect(blinkFxService.releasePackage).not.toHaveBeenCalled();

        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'b', controls: [], presets: [] });
        await application.switchEffect('b');

        expect(blinkFxService.releasePackage).toHaveBeenCalledTimes(1);
        expect(blinkFxService.releasePackage).toHaveBeenCalledWith('a');
    });

    it('keeps the previous package mounted when the switch fails', async () => {
        blinkFxService.releasePackage.mockClear();
        const renderService = createRenderService();
        stubShaderUpdateFor(renderService);
        const application = buildHost(renderService);
        blinkFxService.loadPackage.mockResolvedValueOnce({ id: 'a', controls: [], presets: [] });
        await application.switchEffect('a');

        blinkFxService.loadPackage.mockRejectedValueOnce(new Error('broken'));
        await expect(application.switchEffect('b')).rejects.toThrow('broken');

        expect(blinkFxService.releasePackage).not.toHaveBeenCalled();
    });
});

describe('Application failed candidate cleanup', () => {
    it('releases a rejected effect without replacing the committed selection', async () => {
        vi.clearAllMocks();
        const renderService = createRenderService();
        stubShaderUpdateFor(renderService);
        const application = new Application(envService('production'), renderService, blinkFxService as never);
        blinkFxService.loadPackage.mockResolvedValue({ presets: [] });
        await application.switchEffect('running');
        const update = (renderService as unknown as { updateBlinkFxShader: ReturnType<typeof vi.fn> })
            .updateBlinkFxShader;
        update.mockRejectedValueOnce(new Error('shader failed'));
        await expect(application.switchEffect('broken')).rejects.toThrow('shader failed');
        expect(blinkFxService.releasePackage).toHaveBeenCalledWith('broken');
        const listener = vi.fn();
        application.subscribeState(listener);
        expect(listener.mock.calls[0][0].activeEffectId).toBe('running');
    });
});

describe('Application active package cleanup', () => {
    it('releases the current package when the application is destroyed', async () => {
        vi.clearAllMocks();
        const renderService = createRenderService();
        stubShaderUpdateFor(renderService);
        const application = new Application(envService('production'), renderService, blinkFxService as never);
        blinkFxService.loadPackage.mockResolvedValue({ presets: [] });
        await application.switchEffect('running');
        await application.destroy();
        expect(blinkFxService.releasePackage).toHaveBeenCalledWith('running');
    });
});
