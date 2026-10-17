// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlinkControlSpec, BlinkEffectIR, BlinkRenderTargetSpec } from '../../runtime/ir/types';
import type { BlinkScriptModule } from '../../runtime/script/types';
import type { GlobalUniforms, RendererConfig } from '../../types';
import { UniformType } from '../../types';
import type { AudioService } from '../AudioService';

let supportsColorFormat = true;

class StubExoApplication {
    public readonly canvas = { width: 320, height: 240 };
    public readonly rendering = {
        supportsColorFormat: (): boolean => supportsColorFormat,
    };
    public constructor(public readonly options: unknown) {}
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

const audioService = (): AudioService => ({ destroy: vi.fn() }) as unknown as AudioService;

function control(name: string): BlinkControlSpec {
    return {
        name,
        label: null,
        description: null,
        group: null,
        type: 'float',
        default: 0.25,
        min: 0,
        max: 1,
        step: null,
    } as unknown as BlinkControlSpec;
}

function target(format: 'rgba8' | 'rgba16f'): BlinkRenderTargetSpec {
    return { name: 'hdr', width: null, height: null, scale: null, format, persistent: false } as BlinkRenderTargetSpec;
}

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

describe('RenderService.updateBlinkFxShader - capability enforcement', () => {
    beforeEach(() => {
        supportsColorFormat = true;
        passBuild.mockReset();
    });

    it('rejects an effect whose required feature this runtime does not provide', async () => {
        const service = new RenderService(audioService(), rendererConfig(), uniforms);

        await expect(
            service.updateBlinkFxShader(effect({ requirements: { features: ['audio-generation'], backends: [] } }))
        ).rejects.toThrow(/audio-generation/);
        expect(passBuild).not.toHaveBeenCalled();
    });

    // The capability check has to run before anything else: a package that cannot run must not
    // cost a shader fetch, an asset load or a pass build first.
    it('leaves the previously loaded effect in charge after a rejected swap', async () => {
        const service = new RenderService(audioService(), rendererConfig(), uniforms);
        await service.updateBlinkFxShader(effect({ controls: [control('speed')] }));

        await expect(
            service.updateBlinkFxShader(
                effect({
                    controls: [control('other')],
                    requirements: { features: ['sync-final-pass-readback'], backends: [] },
                })
            )
        ).rejects.toThrow(/sync-final-pass-readback/);

        expect(service.controlSpecs.map(c => c.name)).toEqual(['speed']);
    });

    it('rejects a float target on a backend without float support when no fallback was declared', async () => {
        supportsColorFormat = false;
        const service = new RenderService(audioService(), rendererConfig(), uniforms);

        await expect(service.updateBlinkFxShader(effect({ renderTargets: [target('rgba16f')] }))).rejects.toThrow(
            /float-targets/
        );
    });

    it('permits the same effect once it declares the rgba8 fallback', async () => {
        supportsColorFormat = false;
        const service = new RenderService(audioService(), rendererConfig(), uniforms);

        await service.updateBlinkFxShader(
            effect({ renderTargets: [target('rgba16f')], fallbacks: { 'float-targets': 'rgba8' } })
        );

        expect(passBuild).toHaveBeenCalledTimes(1);
        // The build options carry the permission the pool needs to downgrade.
        expect(passBuild.mock.calls[0][2].allowFloatDowngrade).toBe(true);
    });
});

describe('RenderService.updateBlinkFxShader - script lifecycle', () => {
    const scriptEffect = (): BlinkEffectIR =>
        effect({
            controls: [control('speed')],
            script: { entry: 'scripts/main.js', abi: 'blink/1', events: [] },
        });

    beforeEach(() => {
        supportsColorFormat = true;
        passBuild.mockReset();
    });

    it('runs the incoming script setup as part of the swap', async () => {
        const setup = vi.fn();
        const service = new RenderService(audioService(), rendererConfig(), uniforms, () =>
            Promise.resolve({ setup } as BlinkScriptModule)
        );

        await service.updateBlinkFxShader(scriptEffect());

        expect(setup).toHaveBeenCalledTimes(1);
    });

    // The script must see the controls it is about to drive, not the outgoing effect's: its
    // setup runs before the swap commits, so a surface bound to the live store would write into
    // the wrong effect - or throw on a control the new effect declares and the old one does not.
    it("binds the script to the incoming effect's controls, not the running one's", async () => {
        const writes: string[] = [];
        const service = new RenderService(audioService(), rendererConfig(), uniforms, () =>
            Promise.resolve({
                setup: (ctx: { controls: { set(name: string, value: number): void } }) => {
                    ctx.controls.set('speed', 0.9);
                    writes.push('speed');
                },
            } as unknown as BlinkScriptModule)
        );
        await service.updateBlinkFxShader(effect({ controls: [control('legacy')] }));

        await service.updateBlinkFxShader(scriptEffect());

        expect(writes).toEqual(['speed']);
        expect(service.controlSpecs.map(c => c.name)).toEqual(['speed']);
    });

    it('rejects the swap when the script writes a control the effect does not declare', async () => {
        const service = new RenderService(audioService(), rendererConfig(), uniforms, () =>
            Promise.resolve({
                setup: (ctx: { controls: { set(name: string, value: number): void } }) => {
                    ctx.controls.set('nope', 1);
                },
            } as unknown as BlinkScriptModule)
        );
        await service.updateBlinkFxShader(effect({ controls: [control('legacy')] }));

        await expect(service.updateBlinkFxShader(scriptEffect())).rejects.toThrow(/unknown control "nope"/);
        expect(service.controlSpecs.map(c => c.name)).toEqual(['legacy']);
    });

    it('rejects the swap when the script module cannot be loaded, keeping the previous effect', async () => {
        const service = new RenderService(audioService(), rendererConfig(), uniforms, entry =>
            Promise.reject(new Error(`no module at ${entry}`))
        );
        await service.updateBlinkFxShader(effect({ controls: [control('speed')] }));

        await expect(service.updateBlinkFxShader(scriptEffect())).rejects.toThrow(/no module at/);

        expect(service.controlSpecs.map(c => c.name)).toEqual(['speed']);
    });

    it('rejects the swap when the script declares an ABI this runtime does not execute', async () => {
        const service = new RenderService(audioService(), rendererConfig(), uniforms, () =>
            Promise.resolve({} as BlinkScriptModule)
        );

        await expect(
            service.updateBlinkFxShader(effect({ script: { entry: 'scripts/main.js', abi: 'blink/2', events: [] } }))
        ).rejects.toThrow(/blink\/2/);
    });

    it('disposes the outgoing script only after the incoming one has committed', async () => {
        const order: string[] = [];
        let which = 0;
        const service = new RenderService(audioService(), rendererConfig(), uniforms, () => {
            which += 1;
            const id = which;
            return Promise.resolve({
                setup: () => order.push(`setup-${id}`),
                dispose: () => order.push(`dispose-${id}`),
            } as unknown as BlinkScriptModule);
        });

        await service.updateBlinkFxShader(scriptEffect());
        await service.updateBlinkFxShader(scriptEffect());
        await Promise.resolve();

        expect(order).toEqual(['setup-1', 'setup-2', 'dispose-1']);
    });
});

describe('RenderService.updateBlinkFxShader - foreign script ABIs', () => {
    beforeEach(() => {
        supportsColorFormat = true;
        passBuild.mockReset();
    });

    // An ssf/1 script runs through its own runtime, never the blink/1 module path.
    it('starts an ssf/1 script from its source text without touching the blink/1 module loader', async () => {
        const loadModule = vi.fn();
        const loadSource = vi.fn(() => Promise.resolve('function setup() { setUniform("ready", 1); }'));
        const service = new RenderService(audioService(), rendererConfig(), uniforms, loadModule, loadSource);

        await service.updateBlinkFxShader(effect({ script: { entry: 'script.js', abi: 'ssf/1', events: [] } }));

        expect(loadSource).toHaveBeenCalledWith('script.js');
        expect(loadModule).not.toHaveBeenCalled();
        expect(passBuild).toHaveBeenCalledTimes(1);
    });

    it('fails the load, and keeps the running effect, when an ssf/1 setup throws', async () => {
        const loadSource = vi.fn(() => Promise.resolve('function setup() { throw new Error("no start"); }'));
        const service = new RenderService(audioService(), rendererConfig(), uniforms, vi.fn(), loadSource);

        await expect(
            service.updateBlinkFxShader(effect({ script: { entry: 'script.js', abi: 'ssf/1', events: [] } }))
        ).rejects.toThrow('no start');
    });
});

describe('RenderService.updateBlinkFxShader - host inputs', () => {
    it('preserves the running graph if incoming original PCM capture fails', async () => {
        const audio = audioService();
        audio.subscribePcm = vi.fn().mockRejectedValue(new Error('PCM capture unavailable'));
        const service = new RenderService(audio, rendererConfig(), uniforms);
        await service.updateBlinkFxShader(effect({ controls: [control('keep')] }));
        passBuild.mockClear();
        await expect(
            service.updateBlinkFxShader(
                effect({
                    compatibility: {
                        profile: 'ssf/1',
                        source: null,
                        mode: 'preserve',
                        converter: 'fixture',
                        controls: {},
                        scriptUniforms: {},
                    },
                })
            )
        ).rejects.toThrow('PCM capture unavailable');
        expect(passBuild).not.toHaveBeenCalled();
        expect(service.controlSpecs[0].name).toBe('keep');
    });
    beforeEach(() => {
        supportsColorFormat = true;
        passBuild.mockReset();
    });

    const imageInput = (required: boolean): BlinkEffectIR['hostInputs'] =>
        [
            { name: 'frame', type: 'image', required, samples: null, representation: null },
        ] as BlinkEffectIR['hostInputs'];

    // An input the package says it needs and nothing can provide is exactly the case the
    // capability model exists for: fail, rather than sample a dummy texture forever.
    it('rejects an effect whose required image input has no registered producer', async () => {
        const service = new RenderService(audioService(), rendererConfig(), uniforms);

        await expect(service.updateBlinkFxShader(effect({ hostInputs: imageInput(true) }))).rejects.toThrow(
            /requires host inputs/
        );
    });

    it('loads the same effect when the input is optional', async () => {
        const service = new RenderService(audioService(), rendererConfig(), uniforms);

        await expect(service.updateBlinkFxShader(effect({ hostInputs: imageInput(false) }))).resolves.toBeUndefined();
    });

    it('binds an audio-shaped input so the pass store resolves it to a surface', async () => {
        const service = new RenderService(audioService(), rendererConfig(), uniforms);

        await service.updateBlinkFxShader(
            effect({
                hostInputs: [
                    { name: 'wave', type: 'audio', required: true, samples: 8, representation: null },
                ] as BlinkEffectIR['hostInputs'],
            })
        );

        const store = passBuild.mock.calls[0][2].store as { hostInput(name: string): unknown };
        expect(store.hostInput('wave')).toBeDefined();
        expect(store.hostInput('nope')).toBeUndefined();
    });

    it("keeps the running effect's inputs bound when a later swap fails", async () => {
        const service = new RenderService(audioService(), rendererConfig(), uniforms);
        await service.updateBlinkFxShader(
            effect({
                hostInputs: [
                    { name: 'wave', type: 'audio', required: true, samples: 8, representation: null },
                ] as BlinkEffectIR['hostInputs'],
            })
        );
        const store = passBuild.mock.calls[0][2].store as { hostInput(name: string): unknown };

        await expect(service.updateBlinkFxShader(effect({ hostInputs: imageInput(true) }))).rejects.toThrow(
            /requires host inputs/
        );

        expect(store.hostInput('wave')).toBeDefined();
    });
});
