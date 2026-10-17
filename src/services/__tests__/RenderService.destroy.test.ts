// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GlobalUniforms, RendererConfig } from '../../types';
import { UniformType } from '../../types';
import type { AudioService } from '../AudioService';

const calls: string[] = [];

class StubExoApplication {
    public readonly canvas = { width: 320, height: 240 };
    public constructor(public readonly options: unknown) {}
    public start = vi.fn((): Promise<void> => Promise.resolve());
    public stop = vi.fn(() => {
        calls.push('app.stop');
    });
    public destroy = vi.fn((): Promise<void> => {
        calls.push('app.destroy');
        return Promise.resolve();
    });
}

vi.mock('@codexo/exojs', async importOriginal => {
    const actual = await importOriginal<typeof import('@codexo/exojs')>();
    return {
        ...actual,
        Application: StubExoApplication,
        Container: class extends actual.Container {
            public override destroy(): void {
                calls.push('overlay.destroy');
                super.destroy();
            }
        },
    };
});

const passRuntimeDispose = vi.fn(() => {
    calls.push('passRuntime.dispose');
});

vi.mock('../../runtime/render/pass', () => ({
    BlinkPassRuntime: class {
        public dispose = passRuntimeDispose;
        public build = vi.fn();
        public execute = vi.fn();
        public resize = vi.fn();
        public describePasses = vi.fn(() => []);
    },
}));

vi.mock('../../runtime/audio/BlinkAudioTextureRuntime', () => ({
    BlinkAudioTextureRuntime: class {
        public frameIndex = 0;
        public destroy = vi.fn(() => {
            calls.push('audioTextures.destroy');
        });
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

const audioServiceStub = (): AudioService & { destroy: ReturnType<typeof vi.fn> } =>
    ({
        destroy: vi.fn(() => {
            calls.push('audioService.destroy');
        }),
    }) as unknown as AudioService & { destroy: ReturnType<typeof vi.fn> };

describe('RenderService.destroy', () => {
    beforeEach(() => {
        calls.length = 0;
        passRuntimeDispose.mockClear();
        passRuntimeDispose.mockImplementation(() => {
            calls.push('passRuntime.dispose');
        });
    });

    it('releases GPU resources before the backend, and the audio taps after it', async () => {
        const audioService = audioServiceStub();
        const service = new RenderService(audioService, rendererConfig(), uniforms);

        await service.destroy();

        expect(calls).toEqual([
            'app.stop',
            'passRuntime.dispose',
            'audioTextures.destroy',
            'overlay.destroy',
            'app.destroy',
            'audioService.destroy',
        ]);
    });

    it('stops answering resize events', async () => {
        const service = new RenderService(audioServiceStub(), rendererConfig(), uniforms);
        const resize = vi.spyOn(service, 'resize');

        await service.destroy();
        window.dispatchEvent(new Event('resize'));

        expect(resize).not.toHaveBeenCalled();
    });

    it('completes teardown and rethrows when a disposal throws', async () => {
        const audioService = audioServiceStub();
        const service = new RenderService(audioService, rendererConfig(), uniforms);
        passRuntimeDispose.mockImplementation(() => {
            throw new Error('context lost');
        });

        await expect(service.destroy()).rejects.toThrow('context lost');

        expect(calls).toEqual([
            'app.stop',
            'audioTextures.destroy',
            'overlay.destroy',
            'app.destroy',
            'audioService.destroy',
        ]);
    });
});
