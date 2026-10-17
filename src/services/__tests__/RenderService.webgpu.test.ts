// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlinkEffectIR } from '../../runtime/ir/types';
import type { GlobalUniforms, RendererConfig } from '../../types';
import { UniformType } from '../../types';
import type { AudioService } from '../AudioService';

class StubExoApplication {
    public readonly canvas = { width: 320, height: 240 };
    public readonly rendering = { supportsColorFormat: (): boolean => true };
    public constructor(public readonly options: { backend: { type: string } }) {}
    public start = vi.fn((): Promise<void> => Promise.resolve());
    public stop = vi.fn();
    public destroy = vi.fn((): Promise<void> => Promise.resolve());
}

vi.mock('@codexo/exojs', async importOriginal => {
    const actual = await importOriginal<typeof import('@codexo/exojs')>();
    return { ...actual, Application: StubExoApplication };
});

const passBuild = vi.fn();

vi.mock('../../runtime/render/pass', () => ({
    BlinkPassRuntime: class {
        public dispose = vi.fn();
        public build = passBuild;
        public execute = vi.fn();
        public resize = vi.fn();
        public describePasses = vi.fn(() => []);
    },
}));

vi.mock('../../runtime/audio/BlinkAudioTextureRuntime', () => ({
    BlinkAudioTextureRuntime: class {
        public frameIndex = 0;
        public destroy = vi.fn();
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

const config = (backend?: 'webgl2' | 'webgpu'): RendererConfig => ({
    view: document.createElement('canvas'),
    width: 320,
    height: 240,
    backgroundColor: 0,
    backgroundAlpha: 1,
    useContextAlpha: false,
    antialias: false,
    clearBeforeRender: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    ...(backend === undefined ? {} : { backend }),
});

const audioService = (): AudioService => ({ destroy: vi.fn() }) as unknown as AudioService;

const entry = { path: null, source: 'WGSL OR GLSL', vertex: null, stage: 'visual' as const };

function effect(shaders: Partial<BlinkEffectIR['shaders']>, overrides: Partial<BlinkEffectIR> = {}): BlinkEffectIR {
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
        passes: [{ name: 'main', shader: 'main', target: { kind: 'screen' }, inputs: [], clear: true }],
        shaders: { glsl: {}, wgsl: {}, ...shaders },
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

const startedBackend = (service: InstanceType<typeof RenderService>): string =>
    (service as unknown as { app: StubExoApplication }).app.options.backend.type;

describe('RenderService on WebGPU', () => {
    beforeEach(() => {
        passBuild.mockReset();
    });

    it('runs WebGL2 unless WebGPU is asked for', () => {
        expect(startedBackend(new RenderService(audioService(), config(), uniforms))).toBe('webgl2');
        expect(startedBackend(new RenderService(audioService(), config('webgl2'), uniforms))).toBe('webgl2');
        expect(startedBackend(new RenderService(audioService(), config('webgpu'), uniforms))).toBe('webgpu');
    });

    it('hands the pass runtime the WGSL programs and says they are WGSL', async () => {
        const service = new RenderService(audioService(), config('webgpu'), uniforms);

        await service.updateBlinkFxShader(effect({ wgsl: { main: entry } }));

        const [, shaders, options] = passBuild.mock.calls[0] as [
            unknown,
            Map<string, { fragment: string }>,
            { language: string },
        ];
        expect(options.language).toBe('wgsl');
        expect(shaders.get('main')?.fragment).toBe('WGSL OR GLSL');
    });

    it('hands the pass runtime the GLSL programs on WebGL2, as before', async () => {
        const service = new RenderService(audioService(), config(), uniforms);

        await service.updateBlinkFxShader(effect({ glsl: { main: entry } }));

        expect((passBuild.mock.calls[0] as [unknown, unknown, { language: string }])[2].language).toBe('glsl');
    });

    it('refuses a package that only has GLSL, naming the passes that lack WGSL', async () => {
        const service = new RenderService(audioService(), config('webgpu'), uniforms);

        await expect(service.updateBlinkFxShader(effect({ glsl: { main: entry } }))).rejects.toThrow(
            /"main" have no wgsl shader/
        );
        expect(passBuild).not.toHaveBeenCalled();
    });

    it('refuses a package that only has WGSL on WebGL2, naming the passes that lack GLSL', async () => {
        const service = new RenderService(audioService(), config(), uniforms);

        await expect(service.updateBlinkFxShader(effect({ wgsl: { main: entry } }))).rejects.toThrow(
            /"main" have no glsl shader/
        );
    });

    it('refuses a package that declares it needs the other backend', async () => {
        const service = new RenderService(audioService(), config('webgpu'), uniforms);

        await expect(
            service.updateBlinkFxShader(
                effect({ wgsl: { main: entry } }, { requirements: { features: [], backends: ['webgl2'] } })
            )
        ).rejects.toThrow(/backends webgl2.*"webgpu"/);
    });

    it('has no generated audio, whose program is GLSL', async () => {
        vi.stubGlobal('AudioWorkletNode', class {});
        const service = new RenderService(audioService(), config('webgpu'), uniforms);

        await expect(
            service.updateBlinkFxShader(
                effect(
                    { wgsl: { main: entry, sound: { ...entry, stage: 'audio' } } },
                    {
                        outputs: {
                            visual: true,
                            audio: { shader: 'sound', abi: 'blink-audio/1', channels: 2, sampleRate: 'device' },
                        },
                    }
                )
            )
        ).rejects.toThrow(/audio-generation/);
        vi.unstubAllGlobals();
    });

    it('refuses a compatibility profile, whose prelude is GLSL', async () => {
        const service = new RenderService(audioService(), config('webgpu'), uniforms);
        const converted = effect(
            { wgsl: { main: entry } },
            {
                compatibility: {
                    source: { format: 'isf', version: null },
                    profile: 'isf/2',
                    mode: 'native',
                    converter: null,
                    controls: {},
                    scriptUniforms: {},
                },
            }
        );

        await expect(service.updateBlinkFxShader(converted)).rejects.toThrow(
            /compatibility profile "isf\/2".*GLSL-only/
        );
        expect(passBuild).not.toHaveBeenCalled();
    });
});
