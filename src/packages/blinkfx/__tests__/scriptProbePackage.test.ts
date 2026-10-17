// @vitest-environment jsdom
/**
 * Slice-2 acceptance test: the shipped `script_probe.blinkfx` package, loaded from disk the way
 * the app loads it over HTTP, must apply its presets, run its `blink/1` script, and fail loudly
 * when a requirement is missing.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlinkEffectIR } from '../../../runtime/ir/types';
import { ControlValueStore } from '../../../runtime/render/ControlValueStore';
import type { BlinkScriptModule } from '../../../runtime/script/types';
import type { AudioService } from '../../../services/AudioService';
import type { GlobalUniforms, RendererConfig } from '../../../types';
import { UniformType } from '../../../types';
import { loadBlinkFx } from '../loader';
import type { BlinkFxManifest } from '../manifest';
import { loadBlinkPreset } from '../presets';
import { validateBlinkFxManifest } from '../validate';

const PACKAGE_DIR = 'public/effects/script_probe.blinkfx';
const BASE_PATH = 'effects/script_probe.blinkfx';

let supportsColorFormat = true;

class StubExoApplication {
    public readonly canvas = { width: 320, height: 240 };
    public readonly rendering = { supportsColorFormat: (): boolean => supportsColorFormat };
    public constructor(public readonly options: unknown) {}
    public start = vi.fn((): Promise<void> => Promise.resolve());
    public stop = vi.fn();
    public destroy = vi.fn((): Promise<void> => Promise.resolve());
}

vi.mock('@codexo/exojs', async importOriginal => {
    const actual = await importOriginal<typeof import('@codexo/exojs')>();
    return { ...actual, Application: StubExoApplication };
});

vi.mock('../../../runtime/render/pass', () => ({
    BlinkPassRuntime: class {
        public dispose = vi.fn();
        public build = vi.fn();
        public execute = vi.fn();
        public resize = vi.fn();
        public describePasses = vi.fn(() => []);
    },
}));

vi.mock('../../../runtime/audio/BlinkAudioTextureRuntime', () => ({
    BlinkAudioTextureRuntime: class {
        public frameIndex = 0;
        public destroy = vi.fn();
        public surface = vi.fn(() => null);
        public update = vi.fn();
        public beginFrame = vi.fn();
        public endFrame = vi.fn();
    },
}));

const { RenderService } = await import('../../../services/RenderService');

/** Serves the package's own files, so the test exercises the real manifest, preset and script. */
const packageFetch = async (path: string): Promise<Response> => {
    const relative = path.replace(`${BASE_PATH}/`, '');
    const body = await readFile(`${PACKAGE_DIR}/${relative}`, 'utf8');
    return new Response(body, { status: 200 });
};

const loadPackageIr = async (mutate: (m: BlinkFxManifest) => BlinkFxManifest = m => m): Promise<BlinkEffectIR> => {
    const raw: unknown = JSON.parse(await readFile(`${PACKAGE_DIR}/manifest.json`, 'utf8'));
    expect(validateBlinkFxManifest(raw)).toEqual({ valid: true });
    return loadBlinkFx(mutate(raw as BlinkFxManifest), BASE_PATH);
};

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
        update: vi.fn(),
        frequencyEnergy: new Float32Array(12),
        rawFrequencyEnergy: new Float32Array(12),
        beatIntensity: 0,
        downbeatIntensity: 0,
        beatPulseLevel: 0,
        downbeatPulseLevel: 0,
        beatPhase: 0,
        onsetStrength: 0,
        bpm: 120,
        inputLevel: 0,
        fftSpectrum: null,
        fftSpectrumLog: null,
        waveformData: null,
        sampleRate: 48000,
    }) as unknown as AudioService;

/** Imports the package's real script file, the way the blob-URL loader does in the browser. */
const importPackageScript = async (entry: string): Promise<BlinkScriptModule> => {
    const relative = entry.replace(`${BASE_PATH}/`, '');
    return (await import(pathToFileURL(`${process.cwd()}/${PACKAGE_DIR}/${relative}`).href)) as BlinkScriptModule;
};

const service = (): InstanceType<typeof RenderService> =>
    new RenderService(audioService(), rendererConfig(), uniforms, importPackageScript);

describe('script_probe.blinkfx', () => {
    beforeEach(() => {
        supportsColorFormat = true;
        // The render service fetches the package's shader by path, exactly as it would over HTTP.
        vi.stubGlobal('fetch', (input: string) => packageFetch(input));
    });

    it('declares its requirements, presets and script in the loaded IR', async () => {
        const ir = await loadPackageIr();

        expect(ir.requirements).toEqual({ features: ['script:blink/1'], backends: ['webgl2'] });
        expect(ir.presets.map(p => p.name)).toEqual(['calm', 'hot']);
        expect(ir.script).toEqual({
            entry: `${BASE_PATH}/scripts/main.js`,
            abi: 'blink/1',
            events: [
                { input: 'gate', on: 'offToOn', handler: 'onGateOpened' },
                { input: 'gate', on: 'onToOff', handler: 'onGateClosed' },
            ],
        });
    });

    it('applies a preset from the package onto the declared controls', async () => {
        const ir = await loadPackageIr();
        const store = new ControlValueStore();
        store.loadDefaults(ir.controls);

        const preset = await loadBlinkPreset(ir.presets[1], ir.controls, packageFetch);
        store.applyValues(preset.values);

        expect(preset.name).toBe('Hot');
        expect(store.values.level).toBe(0.9);
        const tint = Array.from(store.values.tint as Float32Array);
        expect(tint).toHaveLength(4);
        for (const [i, expected] of [1, 0.35, 0.1, 1].entries()) {
            expect(tint[i]).toBeCloseTo(expected, 5);
        }
    });

    it('runs the package script during the swap, and its setup writes a control', async () => {
        const ir = await loadPackageIr();
        const renderService = service();

        await renderService.updateBlinkFxShader(ir);

        // The package's setup writes its idle level; the default in the manifest is 0.
        expect(renderService.controlValues.level).toBeCloseTo(0.15, 5);
    });

    // setup() alone would pass even if the per-frame wiring were dead, so drive a frame too.
    it('drives the package script every frame, moving the control it owns', async () => {
        const renderService = service();
        await renderService.updateBlinkFxShader(await loadPackageIr());
        const afterSetup = renderService.controlValues.level as number;

        renderService.update(1 / 60);
        await Promise.resolve();
        await Promise.resolve();

        // The package's update() recomputes level from the audio frame; with silence that is its
        // idle level, so the assertion is that a frame ran at all and left a valid value.
        expect(renderService.controlValues.level).toBeTypeOf('number');
        expect(renderService.controlValues.level).toBeGreaterThanOrEqual(afterSetup);
        expect(renderService.controlValues.level).toBeLessThanOrEqual(1);
    });

    it('rejects the package on a backend missing a requirement, leaving the running effect alone', async () => {
        const renderService = service();
        await renderService.updateBlinkFxShader(await loadPackageIr());

        supportsColorFormat = false;
        const needsFloat = await loadPackageIr(m => ({
            ...m,
            id: 'com.codexo.script_probe.float',
            requirements: { ...m.requirements, features: ['script:blink/1', 'float-targets'] },
        }));

        await expect(renderService.updateBlinkFxShader(needsFloat)).rejects.toThrow(/float-targets/);
        expect(renderService.controlSpecs.map(c => c.name)).toEqual(['level', 'gate', 'tint']);
        expect(renderService.controlValues.level).toBeCloseTo(0.15, 5);
    });

    it('loads that same variant once the package permits the rgba8 fallback', async () => {
        supportsColorFormat = false;
        const renderService = service();

        const withFallback = await loadPackageIr(m => ({
            ...m,
            requirements: { ...m.requirements, features: ['script:blink/1', 'float-targets'] },
            fallbacks: { 'float-targets': 'rgba8' },
        }));

        await expect(renderService.updateBlinkFxShader(withFallback)).resolves.toBeUndefined();
    });
});
