import type { MeshMaterial, RenderingContext, RenderNode, Seconds, Texture, UniformValue } from '@codexo/exojs';
import {
    Application as ExoApplication,
    Color,
    Container,
    getAudioContext,
    Scene as ExoScene,
    Signal,
} from '@codexo/exojs';
import { WebGl2Backend } from '@codexo/exojs/renderer-sdk';

import { Clock } from '../classes/Clock';
import { Flags } from '../classes/Flags';
import { isfProfile } from '../packages/isf/profile/IsfProfile';
import { shadertoyProfile } from '../packages/shadertoy/profile/ShadertoyProfile';
import { ssfOriginalProfile } from '../packages/ssf/profile/SsfOriginalProfile';
import { legacySsfProfile, ssfProfile } from '../packages/ssf/profile/SsfProfile';
import { SsfScriptRuntime, type SsfUniformValue } from '../packages/ssf/script/SsfScriptRuntime';
import { type BlinkAudioFrame, silentBlinkAudioFrame } from '../runtime/audio/BlinkAudioFrame';
import {
    BlinkAudioSignalState,
    computeTrailCandidates,
    updateBlinkAudioSignals,
} from '../runtime/audio/BlinkAudioSignals';
import { BlinkAudioTextureRuntime } from '../runtime/audio/BlinkAudioTextureRuntime';
import {
    type AudioOutputStats,
    BlinkAudioOutputRuntime,
    buildAudioShader,
    GpuAudioBlockRenderer,
    WorkletPcmSink,
} from '../runtime/audio-out';
import { AssetBinder } from '../runtime/binding/AssetBinder';
import type { CapabilityResolution } from '../runtime/capability/resolveCapabilities';
import {
    type BackendCapabilities,
    describeCapabilityFailures,
    resolveCapabilities,
} from '../runtime/capability/resolveCapabilities';
import { type CompatibilityProfileInstance, CompatibilityRegistry } from '../runtime/compat/CompatibilityProfile';
import { buildCompatibilityReport, type CompatibilityReport } from '../runtime/diagnostics/CompatibilityReport';
import { FaultGuard, type FaultRecord, FrameTimeMonitor, type FrameTimeReport } from '../runtime/health';
import { type HostAudioSource, HostInputBinder } from '../runtime/hostinput/HostInputBinder';
import { KeyboardBinder } from '../runtime/input/KeyboardBinder';
import { PointerBinder } from '../runtime/input/PointerBinder';
import type {
    BlinkBackend,
    BlinkControlSpec,
    BlinkEffectIR,
    BlinkFeature,
    BlinkShaderEntry,
} from '../runtime/ir/types';
import { fetchPackageFile } from '../runtime/package';
import {
    buildBlinkAudioValues,
    buildBlinkFrameValues,
    buildBlinkPointerValues,
    buildDefaultUniformValues,
} from '../runtime/render/BlinkPrelude';
import { CappedBrowserPlatform } from '../runtime/render/CappedBrowserPlatform';
import { ControlValueStore } from '../runtime/render/ControlValueStore';
import { type BlinkDiagnosticsSnapshot, buildDiagnosticsSnapshot } from '../runtime/render/diagnosticsSnapshot';
import {
    DEFAULT_OUTPUT,
    fitCanvas,
    mapPreviewPoint,
    type OutputSettings,
    validateOutput,
} from '../runtime/render/outputSettings';
import { BlinkPassRuntime, type ResolvedPassShader } from '../runtime/render/pass';
import { registerBlinkFullscreenRenderer } from '../runtime/render/pass/BlinkFullscreenRenderer';
import type { PassResourceStore } from '../runtime/render/pass/resolvePassInput';
import { toColorTextureFormat } from '../runtime/render/textureFormat';
import { BLINK_SCRIPT_ABI, BlinkScriptRuntime } from '../runtime/script';
import type { BlinkScriptControlValue, BlinkScriptModule, ScriptControlSurface } from '../runtime/script/types';
import { resolveAudioShader, resolveVisualShader } from '../runtime/shader/resolveShaderText';
import type { GlobalUniforms, Obj, RendererConfig, UniformType, UniformValues, UniformValueTypes } from '../types';
import { createUniformValue, getUniformByteSize, getUniformLength } from '../utils/render-utils';
import type { AudioService } from './AudioService';

interface Uniform {
    name: string;
    type: UniformType;
    value: UniformValues;
    length: number;
    offset: number;
    byteSize: number;
}

type UniformCollection = {
    [P in keyof GlobalUniforms]: UniformValueTypes[GlobalUniforms[P]];
};

enum UniformFlags {
    none = 0,
    resolution = 1 << 0,
    date = 1 << 1,
    mouse = 1 << 2,
    surfacePosition = 1 << 3,
}

interface BlinkSceneData {
    readonly overlay: Container;
    readonly onUpdate: (deltaSeconds: number) => void;
    readonly drawPasses: (context: RenderingContext) => void;
}

type ExoBackend = InstanceType<typeof ExoApplication>['backend'];

export type { BlinkDiagnosticsSnapshot };

/**
 * Drives the BlinkFX pass runtime and draws the UI overlay on top of it.
 *
 * The engine constructs the scene, so what it needs arrives as activation data
 * instead of through a constructor. The overlay container stays owned by
 * RenderService so overlay children can be added before `start()`.
 */
class BlinkScene extends ExoScene<BlinkSceneData> {
    private _data: Readonly<BlinkSceneData> | null = null;

    public override init(data: Readonly<BlinkSceneData>): void {
        this._data = data;
    }

    public override update(delta: Seconds): void {
        this._data?.onUpdate(delta);
    }

    public override draw(context: RenderingContext): void {
        if (this._data === null) {
            return;
        }
        this._data.drawPasses(context);
        // Use context.screenView (not the default world view) for the overlay: it is
        // re-centered on resize, whereas the world view keeps its center fixed, which
        // would cull the clip-space fullscreen mesh.
        context.render(this._data.overlay, { view: context.screenView });
    }
}

const SCRIPT_HANG_MS = 2000;

/** Fetches a package script's source text. Injected so tests need no network. */
export type ScriptSourceLoader = (entry: string) => Promise<string>;

/** Produces the script module for a package entry path. Injected so tests need no module loading. */
export type ScriptModuleLoader = (entry: string) => Promise<BlinkScriptModule>;

/**
 * Loads a package script as a real ES module.
 *
 * The source is fetched and handed to the platform's own module loader through a blob URL rather
 * than evaluated by the runtime: package scripts are untrusted content, and this keeps them on
 * the one execution path the browser already sandboxes for modules.
 */
async function importScriptModule(entry: string): Promise<BlinkScriptModule> {
    const response = await fetchPackageFile(entry);
    if (!response.ok) {
        throw new Error(`Failed to fetch script: ${entry} (${response.status})`);
    }
    const source = await response.text();
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
        return (await import(/* @vite-ignore */ url)) as BlinkScriptModule;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * A script's window onto one control store. Reads and writes go through the same store the shader
 * upload reads, so a script write is visible to the very next frame - and an unknown control name
 * throws rather than silently creating a value no shader reads.
 */
async function fetchShaderText(url: string): Promise<string> {
    const response = await fetchPackageFile(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch shader: ${url} (${response.status})`);
    }
    return response.text();
}

function scriptControlSurface(
    controls: ControlValueStore,
    bangs: Readonly<Record<string, number>> = {}
): ScriptControlSurface {
    return {
        get: (name): BlinkScriptControlValue => {
            const value = Object.hasOwn(bangs, name) ? bangs[name] : controls.values[name];
            if (value === undefined) {
                throw new Error(`RenderService: script read unknown control "${name}"`);
            }
            return value as BlinkScriptControlValue;
        },
        set: (name, value): void => {
            controls.set(name, value);
        },
    };
}

/** The feature identifier a package's script ABI maps onto, for reading its resolved outcome. */
function scriptFeature(effect: BlinkEffectIR): BlinkFeature {
    return `script:${effect.script?.abi ?? BLINK_SCRIPT_ABI}` as BlinkFeature;
}

const hexToColor = (color: number, alpha: number): Color =>
    new Color((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, alpha);

export class RenderService {
    private readonly audioService: AudioService;
    private readonly app: ExoApplication;
    private readonly canvas: HTMLCanvasElement;
    private readonly overlay = new Container();
    private readonly arrayBuffer: ArrayBuffer;
    private readonly uniformMap: Map<string, Uniform> = new Map<string, Uniform>();
    private readonly dateClock = new Clock();
    private readonly dirtyFlags = new Flags<UniformFlags>(
        UniformFlags.resolution,
        UniformFlags.date,
        UniformFlags.mouse,
        UniformFlags.surfacePosition
    );
    private readonly passRuntime = new BlinkPassRuntime();
    private blinkFxEffect: BlinkEffectIR | null = null;
    // Not readonly: a swap builds the incoming effect's control values in a separate store and
    // installs it only on success, so a script that fails to start cannot leave the running
    // effect's values half-replaced.
    private blinkFxControls = new ControlValueStore();
    private blinkFxTime = 0;
    private blinkFxDeltaTime = 0;
    private blinkFxFrame = 0;
    // Exponential moving average over per-frame delta, not a sample buffer: the
    // debug panel's fps readout only needs to be steady, not precise, and this
    // costs one multiply-add per frame regardless of how often the panel reads it.
    private blinkFxFps = 0;
    // Reused across every pass, every frame, so buildBlinkFrameValues does not
    // allocate a fresh Float32Array per pass for bl_resolution.
    private readonly blinkFxResolutionBuffer = new Float32Array(2);
    private readonly pointerPositionBuffer = new Float32Array(2);
    private readonly pointerPressOriginBuffer = new Float32Array(2);
    private readonly pointerButtonsBuffer = new Float32Array(3);
    private blinkFxAudioValues: Record<string, UniformValue> = {};
    private readonly frameUniformScratch: Record<string, UniformValue> = {};
    private readonly blinkFxAudioTextures: BlinkAudioTextureRuntime;
    private readonly blinkFxAudioSignalState = new BlinkAudioSignalState();
    private blinkFxAssets: AssetBinder | null = null;
    private readonly pointer = new PointerBinder(0);
    private readonly keyboard = new KeyboardBinder();
    private hostInputs = new HostInputBinder(this.hostAudioSource(), () => this.keyboard.textureData);
    private blinkScript: BlinkScriptRuntime | null = null;
    private blinkScriptFrameInFlight = false;
    private ssfScript: SsfScriptRuntime | null = null;
    private audioOut: BlinkAudioOutputRuntime<RenderingContext> | null = null;
    private readonly ssfFrameValues = new Map<string, SsfUniformValue>();
    private readonly loadScriptSource: ScriptSourceLoader;
    private lastAudioFrame: BlinkAudioFrame | null = null;
    private readonly loadScriptModule: ScriptModuleLoader;
    private readonly profiles = new CompatibilityRegistry()
        .register(ssfProfile)
        .register(ssfOriginalProfile)
        .register(legacySsfProfile)
        .register(isfProfile)
        .register(shadertoyProfile);
    private profile: CompatibilityProfileInstance | null = null;
    private releaseProfilePcm: (() => void) | null = null;
    private ssfStageTime = 0;
    private ssfStageCounter = 0;
    private capabilityResolution: CapabilityResolution | null = null;
    private profileControlValues: Record<string, UniformValue> = {};
    private readonly frameTimes = new FrameTimeMonitor();
    private readonly faultGuard = new FaultGuard({ onChange: () => this.onHealthChange.dispatch() });
    private blinkScriptFrameStartedAt = 0;
    private gpuTimingActive = false;
    private readonly backendType: BlinkBackend;

    public readonly onUpdate = new Signal<[number]>();
    /** Fires when a part of the running effect first faults, is switched off, or the faults are cleared. */
    public readonly onHealthChange = new Signal();
    public readonly uniformValues: UniformCollection = {} as unknown as UniformCollection;

    public get audioTextureRuntime(): BlinkAudioTextureRuntime {
        return this.blinkFxAudioTextures;
    }

    public get currentFrameIndex(): number {
        return this.blinkFxAudioTextures.frameIndex;
    }

    public get currentAnalyserDb(): Float32Array | null {
        return this.audioService.fftSpectrum;
    }

    public getAnalyserMetadata(): Record<string, unknown> {
        return {
            source: 'ExoJS AudioAnalyser / Web Audio AnalyserNode',
            fftSize: 2048,
            frequencyBinCount: 1024,
            minDecibels: -90,
            maxDecibels: 0,
            smoothingTimeConstant: 0.8,
        };
    }

    private output: OutputSettings = DEFAULT_OUTPUT;
    private readonly outputPlatform: CappedBrowserPlatform;

    public get outputSettings(): OutputSettings {
        return this.output;
    }

    public setOutputSettings(settings: OutputSettings): void {
        const next = validateOutput(settings);
        const resized = next.width !== this.output.width || next.height !== this.output.height;
        this.output = next;
        this.outputPlatform.fpsCap = next.fpsCap;
        if (resized) {
            this.app.resize(next.width, next.height);
            this.pointer.setOutputHeight(next.height);
            this.passRuntime.resize(next.width, next.height);
            this.dirtyFlags.push(UniformFlags.resolution);
        }
        this.resize(window.innerWidth, window.innerHeight);
    }

    public get screenWidth(): number {
        return this.app.canvas.width;
    }

    public get screenHeight(): number {
        return this.app.canvas.height;
    }

    public get view(): HTMLCanvasElement {
        return this.canvas;
    }

    /**
     * Live control values of the currently loaded effect, keyed by control name.
     *
     * Reflects writes from every source - the control panel, a preset, the package script - so a
     * reader sees what the next frame will upload, not what the effect declared as defaults.
     */
    public get controlValues(): Readonly<Record<string, UniformValue>> {
        return this.blinkFxControls.values;
    }

    /** Controls declared by the currently loaded effect, or empty before one has loaded. */
    public get controlSpecs(): readonly BlinkControlSpec[] {
        return this.blinkFxEffect?.controls ?? [];
    }

    public get application(): ExoApplication {
        return this.app;
    }

    public addChild(...children: RenderNode[]): void {
        for (const child of children) {
            this.overlay.addChild(child);
        }
    }

    public constructor(
        audioService: AudioService,
        rendererConfig: RendererConfig,
        uniforms: GlobalUniforms,
        loadScriptModule: ScriptModuleLoader = importScriptModule,
        loadScriptSource: ScriptSourceLoader = fetchShaderText
    ) {
        this.audioService = audioService;
        this.loadScriptModule = loadScriptModule;
        this.loadScriptSource = loadScriptSource;
        this.blinkFxAudioTextures = new BlinkAudioTextureRuntime();

        this.canvas = rendererConfig.view;
        this.backendType = rendererConfig.backend ?? 'webgl2';
        this.outputPlatform = new CappedBrowserPlatform(this.canvas);
        this.app = new ExoApplication({
            platform: this.outputPlatform,
            clearColor: hexToColor(rendererConfig.backgroundColor, rendererConfig.backgroundAlpha),
            backend: { type: this.backendType },
            canvas: {
                element: rendererConfig.view,
                width: this.output.width,
                height: this.output.height,
                pixelRatio: 1,
                tabIndex: 0,
            },
            rendering: {
                // alpha and premultipliedAlpha are derived from alphaMode, the single
                // knob for how the canvas composites against the page.
                alphaMode: rendererConfig.useContextAlpha ? 'premultiplied' : 'opaque',
                webglAttributes: {
                    antialias: rendererConfig.antialias,
                    preserveDrawingBuffer: rendererConfig.preserveDrawingBuffer,
                    powerPreference: rendererConfig.powerPreference,
                    depth: false,
                },
            },
            scenes: { blink: BlinkScene },
        });

        this.arrayBuffer = new ArrayBuffer(this.getArrayBufferSize(uniforms));

        this.initUniforms(uniforms);

        this.pointer.setOutputHeight(this.screenHeight);
        window.addEventListener('resize', this.handleWindowResize);
        this.canvas.addEventListener('pointermove', this.handlePointerMove);
        this.canvas.addEventListener('pointerdown', this.handlePointerDown);
        this.canvas.addEventListener('pointerup', this.handlePointerUp);
        this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
        this.canvas.addEventListener('pointercancel', this.handlePointerLeave);
        this.canvas.addEventListener('contextmenu', this.handleContextMenu);
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        this.resize(window.innerWidth, window.innerHeight);
        this.dateClock.start();
    }

    /**
     * Converts a browser pointer event into root output pixels for the binder, which owns the
     * flip to the spec's bottom-left origin. The canvas is CSS-sized to the output, so the
     * offsets are already in output space at pixelRatio 1.
     */
    private readonly handlePointerMove = (event: PointerEvent): void => {
        const point = this.previewPoint(event);
        if (point === null) this.pointer.pointerLeft();
        else this.pointer.pointerMoved(point[0], point[1], event.buttons);
    };

    private readonly handlePointerDown = (event: PointerEvent): void => {
        const point = this.previewPoint(event);
        if (point !== null) {
            if (event.button === 1 || event.button === 2) event.preventDefault();
            this.pointer.pointerPressed(point[0], point[1], event.button);
        }
    };

    private previewPoint(event: PointerEvent): readonly [number, number] | null {
        const rect = this.canvas.getBoundingClientRect();
        return mapPreviewPoint(
            event.clientX - rect.left,
            event.clientY - rect.top,
            rect.width,
            rect.height,
            this.output
        );
    }

    private readonly handlePointerUp = (event: PointerEvent): void => {
        this.pointer.pointerReleased(event.button, event.buttons);
    };

    private readonly handleContextMenu = (event: Event): void => {
        event.preventDefault();
    };

    private readonly handlePointerLeave = (): void => {
        this.pointer.pointerLeft();
    };

    // keyCode is the compatibility key space the spec's 256-wide keyboard surface is indexed by,
    // which `code`/`key` cannot express as one byte.
    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        this.keyboard.keyDown(event.keyCode);
    };

    private readonly handleKeyUp = (event: KeyboardEvent): void => {
        this.keyboard.keyUp(event.keyCode);
    };

    private readonly handleWindowResize = (): void => {
        this.resize(window.innerWidth, window.innerHeight);
    };

    public async start(): Promise<void> {
        // The engine halts its frame loop after repeated frame errors and reports them only here.
        // A queued draw, such as the screen pass, is only submitted when the frame is flushed, after
        // the guarded pass loop returned, so a shader that fails to compile surfaces here.
        this.app.onError.add(error => {
            console.error('[blink] engine error:', error);
            this.faultGuard.report('render', 'error', error instanceof Error ? error.message : String(error));
        });
        await this.app.start(BlinkScene, {
            data: {
                overlay: this.overlay,
                onUpdate: this.update.bind(this),
                drawPasses: context => {
                    this.faultGuard.run('render', () =>
                        this.frameTimes.measure('passes', () => {
                            this.passRuntime.execute(
                                context,
                                this.uploadFrameUniforms.bind(this),
                                this.blinkFxControls.values
                            );
                            if (this.profile?.processPcm !== undefined) {
                                this.ssfStageCounter = (this.ssfStageCounter + 1) | 0;
                                this.ssfStageTime = Math.fround(this.ssfStageTime + Math.fround(this.blinkFxDeltaTime));
                            }
                        })
                    );
                    // Generated audio is scheduled against its own sample clock; the frame loop is
                    // only where the GPU can be reached.
                    this.faultGuard.run('audioOutput', () =>
                        this.frameTimes.measure('audioOutput', () => {
                            this.audioOut?.pump(context);
                            this.checkAudioOutputHalt();
                        })
                    );
                    if (this.gpuTimingActive) {
                        this.frameTimes.recordGpu(this.backendStats()?.gpuFrameTimeMs ?? null);
                    }
                    this.frameTimes.endFrame();
                },
            },
        });
    }

    public stop(): void {
        this.app.stop();
    }

    /**
     * Releases everything this service owns: the frame loop, the pass runtime's render targets
     * and materials, the current effect's assets, the audio surfaces, the audio taps, the window
     * resize subscription and finally the render backend itself.
     *
     * `stop()` is not a substitute: it only halts the frame loop and leaves backend, input and
     * audio intact for a later `start()`. A service that will not be restarted - a failed startup
     * attempt, a shutdown - must be destroyed, or its GPU resources and its analyser tap outlive
     * it. The instance is unusable afterwards.
     */
    /**
     * The analyser state the generic host inputs are packed from. Deliberately the raw analyser
     * data, not the native `blink.audio.*` packings: the spec keeps those separate surfaces.
     */
    private hostAudioSource(): HostAudioSource {
        return {
            waveform: () => this.audioService.waveformData,
            spectrumDb: () => this.audioService.fftSpectrum,
            decibelRange: { min: -90, max: 0 },
        };
    }

    /** Register the texture a declared `image` host input samples, or clear it with null. */
    public setHostImageSource(name: string, texture: Texture | null): void {
        this.hostInputs.setImageSource(name, texture);
    }

    public async destroy(): Promise<void> {
        window.removeEventListener('resize', this.handleWindowResize);
        this.canvas.removeEventListener('pointermove', this.handlePointerMove);
        this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
        this.canvas.removeEventListener('pointerup', this.handlePointerUp);
        this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
        this.canvas.removeEventListener('pointercancel', this.handlePointerLeave);
        this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);

        // Halt the frame loop first. `app.destroy()` halts it too, but only after the disposals
        // below have already released the render targets a live frame would draw from.
        this.app.stop();

        // Every step runs even if an earlier one throws - a disposal failing on a lost GL
        // context is exactly the situation this path is entered in, and it must not be what
        // keeps the backend, the analyser taps or the clock alive. The first error still
        // surfaces once nothing is left holding a resource.
        //
        // Ordering: the GPU disposals go through the backend, so they precede `app.destroy()`.
        const steps: ReadonlyArray<() => void | Promise<void>> = [
            () => this.releaseProfilePcm?.(),
            () => this.profile?.dispose?.(),
            () => this.passRuntime.dispose(),
            () => {
                this.blinkFxAssets?.dispose();
                this.blinkFxAssets = null;
            },
            () => this.blinkFxAudioTextures.destroy(),
            () => this.overlay.destroy(),
            () => this.app.destroy(),
            () => this.hostInputs.dispose(),
            () => this.blinkScript?.dispose(),
            () => this.ssfScript?.dispose(),
            () => this.audioOut?.dispose(),
            () => this.audioService.destroy(),
            () => this.dateClock.destroy(),
        ];

        let firstError: unknown;
        for (const step of steps) {
            try {
                await step();
            } catch (error) {
                firstError ??= error;
            }
        }

        if (firstError !== undefined) {
            throw firstError instanceof Error
                ? firstError
                : new Error('RenderService teardown failed', { cause: firstError });
        }
    }

    /**
     * What this runtime can actually do, as opposed to what the backend could in principle.
     *
     * Only features with a working path through the render service belong here: declaring one
     * that is merely planned would let a package load and then quietly not get what it asked for,
     * which is the failure mode the capability check exists to prevent.
     */
    private backendCapabilities(): BackendCapabilities {
        const features = new Set<BlinkFeature>([
            'persistent-feedback',
            'dynamic-target-size',
            'audio-spectrum',
            'audio-level-trail',
            'audio-waveform-input',
            'audio-fft-input',
            'audio-texture-input',
            'pointer-input',
            'keyboard-input',
            // The binding seam exists; whether a producer is registered for a given input is a
            // separate question, answered per effect by the required-input check below.
            'external-image-inputs',
            'script:blink/1',
            'script:ssf/1',
        ]);

        // Generated audio needs a float target to render PCM into and an AudioWorklet to play it,
        // and its program is GLSL: the audio path has no WGSL counterpart.
        if (
            this.backendType === 'webgl2' &&
            typeof AudioWorkletNode !== 'undefined' &&
            this.app.rendering.supportsColorFormat(toColorTextureFormat('rgba32f'))
        ) {
            features.add('audio-generation');
        }

        if (this.app.rendering.supportsColorFormat(toColorTextureFormat('rgba16f'))) {
            features.add('float-targets');
        }

        return { backend: this.backendType, features };
    }

    /** The backend's texture size limit; undefined lets the pass runtime assume a conservative default. */
    private maxTextureSize(): number | undefined {
        const limit = (this.app.backend as { maxTextureSize?: unknown } | undefined)?.maxTextureSize;
        return typeof limit === 'number' && limit > 0 ? limit : undefined;
    }

    public async updateBlinkFxShader(effect: BlinkEffectIR): Promise<void> {
        // Cheapest rejection first, and the one that must never be reached by rendering: a
        // package that needs something this backend cannot give it fails before a single
        // resource is fetched.
        const capabilities = resolveCapabilities(effect, this.backendCapabilities());
        if (capabilities.failures.length > 0) {
            throw new Error(describeCapabilityFailures(capabilities, effect.metadata.id));
        }

        const language = this.backendType === 'webgpu' ? 'wgsl' : 'glsl';
        const resolvedShaders = new Map<string, ResolvedPassShader>();
        for (const pass of effect.passes) {
            if (resolvedShaders.has(pass.shader)) {
                continue;
            }
            const entry: BlinkShaderEntry | undefined = effect.shaders[language]?.[pass.shader];
            if (entry === undefined) {
                throw new Error(
                    `BlinkFX effect "${effect.metadata.id}" references missing ${language} shader "${pass.shader}"`
                );
            }
            resolvedShaders.set(pass.shader, await resolveVisualShader(entry, effect.packageRoot, fetchShaderText));
        }

        // Assets load before the pass runtime is built, so a pass binding asset.<name>
        // always finds a committed texture. A failed load rejects here and leaves the
        // currently running effect (and its AssetBinder) untouched.
        const profile = this.profiles.resolve(effect);
        if (this.backendType === 'webgpu' && profile !== null) {
            profile.dispose?.();
            throw new Error(
                `Effect "${effect.metadata.id}" uses the compatibility profile "${effect.compatibility?.profile ?? '?'}", which is GLSL-only; run it on WebGL2`
            );
        }
        const assets = new AssetBinder(undefined, profile?.assetColor);
        try {
            await assets.load(effect.assets);
        } catch (error) {
            profile?.dispose?.();
            throw error;
        }

        // Built for the incoming effect and installed only on commit, like the assets and the
        // control store: a rejected swap must not leave the running effect's inputs rebound.
        const hostInputs = new HostInputBinder(
            this.hostAudioSource(),
            () => this.keyboard.textureData,
            profile?.assetColor === 'raw' ? { colorSpace: 'none', premultiplyAlpha: false } : {}
        );
        hostInputs.bind(effect.hostInputs);

        const missing = hostInputs
            .unsatisfied()
            .filter(name => effect.hostInputs.find(input => input.name === name)?.required === true);
        if (missing.length > 0) {
            assets.dispose();
            hostInputs.dispose();
            profile?.dispose?.();
            throw new Error(
                `Effect "${effect.metadata.id}" requires host inputs no producer is registered for: ${missing.join(', ')}`
            );
        }

        const store: PassResourceStore = {
            asset: name => assets.get(name),
            hostInput: name => hostInputs.resolve(name),
            blinkAudio: surface => profile?.audioSurface?.(surface) ?? this.blinkFxAudioTextures.surface(surface),
        };

        // The incoming effect's control values live in their own store until the swap commits.
        // The script initializes against that store: its `setup` must see the controls it is
        // about to drive, not the outgoing effect's, and must not touch the running values at all
        // if the swap then fails.
        const controls = new ControlValueStore();
        controls.loadDefaults(effect.controls, effect.compatibility?.controls);

        // A script that cannot start - unknown ABI, a throwing setup, a module that will not load
        // - leaves the running effect and its script exactly where they were.
        let script: BlinkScriptRuntime | null = null;
        let ssfScript: SsfScriptRuntime | null = null;
        let audioOut: BlinkAudioOutputRuntime<RenderingContext> | null = null;
        try {
            const disabled = capabilities.disabled.has(scriptFeature(effect));
            script = await this.startScript(effect, disabled, controls);
            ssfScript = await this.startSsfScript(effect, disabled, controls, profile);
            audioOut = await this.startAudioOutput(effect, controls);
        } catch (error) {
            void script?.dispose();
            ssfScript?.dispose();
            audioOut?.dispose();
            assets.dispose();
            hostInputs.dispose();
            profile?.dispose?.();
            throw error;
        }

        let releasePcm: (() => void) | null = null;
        if (profile?.processPcm !== undefined) {
            let firstSample = 0;
            try {
                releasePcm = await this.audioService.subscribePcm(samples => {
                    profile.processPcm?.({ samples, sampleRate: 44100, firstSample, sourceEpoch: 0 });
                    firstSample += samples.length;
                });
            } catch (error) {
                profile.dispose?.();
                assets.dispose();
                hostInputs.dispose();
                ssfScript?.dispose();
                void script?.dispose();
                audioOut?.dispose();
                throw error;
            }
        }

        try {
            const fullscreenRenderer = this.app.backend instanceof WebGl2Backend;
            if (fullscreenRenderer) registerBlinkFullscreenRenderer(this.app.backend as WebGl2Backend);
            this.passRuntime.build(effect, resolvedShaders, {
                fullscreenRenderer,
                screen: { width: this.screenWidth, height: this.screenHeight },
                supportsFormat: format => this.app.rendering.supportsColorFormat(toColorTextureFormat(format)),
                store,
                allowFloatDowngrade: capabilities.allowFloatDowngrade,
                maxTextureSize: this.maxTextureSize(),
                frameUniforms: this.frameUniformDeclarations(profile),
                profilePrelude: profile?.prelude ?? '',
                screenColor: profile?.screenColor,
                opaqueOutput:
                    !this.app.options.rendering?.alphaMode || this.app.options.rendering.alphaMode === 'opaque',
                language,
            });
        } catch (error) {
            // build() failed after assets loaded successfully: release only what this
            // attempt created. this.blinkFxAssets is left untouched so the previously
            // running effect's textures survive a failed swap.
            releasePcm?.();
            void script?.dispose();
            ssfScript?.dispose();
            audioOut?.dispose();
            assets.dispose();
            hostInputs.dispose();
            profile?.dispose?.();
            throw error;
        }

        // The effect is only committed - both the field controls() reads and the
        // control store's defaults - once every throwing step above has succeeded. A
        // failed switch must leave the previously running effect fully in charge: its
        // own controls, its own pass runtime, its own assets, not a mix where this
        // field already points at an effect whose build never actually landed.
        this.blinkFxEffect = effect;
        this.blinkFxControls = controls;

        // Only dispose the previous binder once the new effect has built successfully,
        // so a build failure never destroys the textures a still-running effect needs.
        this.blinkFxAssets?.dispose();
        this.blinkFxAssets = assets;

        const previousInputs = this.hostInputs;
        this.hostInputs = hostInputs;
        previousInputs.dispose();

        // Same ordering for the script: the outgoing one is disposed only once its replacement
        // is committed and running.
        const previousScript = this.blinkScript;
        this.blinkScript = script;
        this.blinkScriptFrameInFlight = false;
        void previousScript?.dispose();

        this.ssfScript?.dispose();
        this.ssfScript = ssfScript;

        this.audioOut?.dispose();
        this.audioOut = audioOut;

        this.releaseProfilePcm?.();
        this.profile?.dispose?.();
        this.releaseProfilePcm = releasePcm;
        this.profile = profile;
        this.audioService.setGenericAnalysisEnabled?.(profile?.processPcm === undefined);
        this.blinkFxAudioValues = { ...buildBlinkAudioValues(silentBlinkAudioFrame()), ...profile?.neutralUniforms() };
        this.ssfStageTime = 0;
        this.ssfStageCounter = 0;
        this.capabilityResolution = capabilities;
        this.profileControlValues = profile?.processControls(controls.values, 0) ?? {};

        // Faults and timings belong to the effect that produced them.
        this.faultGuard.reset();
        this.frameTimes.reset();
    }

    /**
     * Turns hardware GPU timing on or off and says whether a hardware clock is running. Off by
     * default: timing allocates query objects and costs a timestamp pair per pass, so it should
     * run only while something shows the result. A device without a timer answers false and the
     * report simply carries no GPU figure.
     */
    public setProfilingEnabled(enabled: boolean): boolean {
        const backend = this.app.backend as ExoBackend | undefined;
        this.gpuTimingActive = backend?.setGpuTimingEnabled(enabled) ?? false;
        return this.gpuTimingActive;
    }

    private backendStats(): ExoBackend['stats'] | undefined {
        return (this.app.backend as ExoBackend | undefined)?.stats;
    }

    /** What has gone wrong in the running effect since it was loaded, one record per failing part. */
    public faults(): readonly FaultRecord[] {
        return this.faultGuard.faults();
    }

    /** CPU frame-time statistics for the recent frames, against the frame budget. */
    public frameTimeReport(): FrameTimeReport {
        return this.frameTimes.report();
    }

    private checkAudioOutputHalt(): void {
        if (this.audioOut?.halted === true) {
            this.faultGuard.report(
                'audioOutput',
                'hang',
                `audio generation stopped after repeated failures: ${this.audioOut.stats().lastFailure ?? 'unknown error'}`
            );
        }
    }

    /** Provenance and fidelity of the running effect, or null while none is loaded. */
    public compatibilityReport(): CompatibilityReport | null {
        return this.blinkFxEffect === null
            ? null
            : buildCompatibilityReport(this.blinkFxEffect, this.capabilityResolution);
    }

    /** The generated-audio runtime's counters, or null when the effect produces no audio. */
    public audioOutputStats(): AudioOutputStats | null {
        return this.audioOut?.stats() ?? null;
    }

    /**
     * Builds the audio-output runtime for an effect that declares `outputs.audio`: the PCM shader,
     * its GPU block renderer and the worklet that plays what it renders. Failing to start any of
     * them fails the load, because a package that promises sound must not load silent.
     */
    private async startAudioOutput(
        effect: BlinkEffectIR,
        controls: ControlValueStore
    ): Promise<BlinkAudioOutputRuntime<RenderingContext> | null> {
        const spec = effect.outputs.audio;
        if (spec === null) {
            return null;
        }
        const entry = effect.shaders.glsl?.[spec.shader];
        if (entry === undefined) {
            throw new Error(`BlinkFX effect "${effect.metadata.id}" references missing audio shader "${spec.shader}"`);
        }

        const source = await resolveAudioShader(entry, effect.packageRoot, fetchShaderText);
        const fragment = buildAudioShader(source, spec.abi, effect.controls);
        const context = getAudioContext();
        void context.resume();

        const renderer = new GpuAudioBlockRenderer({
            fragment,
            controls: effect.controls,
            sampleRate: context.sampleRate,
            channels: spec.channels,
            controlValues: () => controls.values,
            readPixels: async target => (await this.app.rendering.readPixels(target, { dataType: 'float32' })).data,
        });
        try {
            const sink = await WorkletPcmSink.create(context);
            return new BlinkAudioOutputRuntime({
                source: renderer,
                sink,
                sampleRate: context.sampleRate,
                maxInFlight: 3,
                release: () => renderer.destroy(),
            });
        } catch (error) {
            renderer.destroy();
            throw error;
        }
    }

    /**
     * Builds and starts the `ssf/1` script of a converted Synesthesia scene, or returns null when
     * the effect has none (or one of another ABI). A script whose `setup` throws fails the load.
     */
    private async startSsfScript(
        effect: BlinkEffectIR,
        disabled: boolean,
        controls: ControlValueStore,
        profile: CompatibilityProfileInstance | null
    ): Promise<SsfScriptRuntime | null> {
        if (effect.script === null || disabled || effect.script.abi !== 'ssf/1') {
            return null;
        }

        const runtime = new SsfScriptRuntime({
            source: await this.loadScriptSource(effect.script.entry),
            nativeLifecycle:
                effect.compatibility?.profile === 'ssf/1' || effect.compatibility?.profile === 'ssf-original/1',
            controls: effect.controls,
            surface: scriptControlSurface(controls),
            declaredUniforms: effect.compatibility?.scriptUniforms ?? {},
        });
        const values = new Map<string, SsfUniformValue>();
        for (const [name, value] of Object.entries(profile?.neutralUniforms() ?? {})) {
            if (name.startsWith('syn_') && (typeof value === 'number' || value instanceof Float32Array))
                values.set(name, value);
        }
        for (const [name, value] of Object.entries(controls.values)) {
            if (typeof value === 'number' || value instanceof Float32Array) values.set(name, value);
        }
        values.set('TIME', 0);
        values.set('FRAMECOUNT', 0);
        values.set('RENDERSIZE', new Float32Array([this.screenWidth, this.screenHeight]));
        this.publishSsfPointer(values);
        runtime.init(values);
        return runtime;
    }

    /**
     * The script phase of an `ssf/1` frame. Original mode reads the previous publication and
     * before the controls are processed, so a `setControl` the script makes reaches this very
     * frame's shader values, and the uniforms it writes are uploaded with them.
     */
    private publishSsfPointer(values: Map<string, SsfUniformValue>): void {
        const pointer = this.pointer.state;
        const [x, y] = pointer.position;
        const [ox, oy] = pointer.pressOrigin;
        const width = this.screenWidth;
        const height = this.screenHeight;
        values.set(
            '_mouse',
            new Float32Array([
                pointer.down ? x : 0,
                pointer.down ? y : 0,
                pointer.down ? ox : -ox,
                pointer.down ? oy : -oy,
            ])
        );
        values.set('_click', new Float32Array(this.pointer.buttons));
        values.set('_muv', new Float32Array([x / width, y / height]));
        values.set('_muvc', new Float32Array([((x / width - 0.5) * width) / height, y / height - 0.5]));
    }

    private runSsfScript(delta: number): void {
        if (this.ssfScript === null) {
            return;
        }
        const values = this.ssfFrameValues;
        values.clear();
        for (const [name, value] of Object.entries(this.blinkFxAudioValues)) {
            values.set(name, value as SsfUniformValue);
        }
        for (const [name, value] of Object.entries(this.profileControlValues)) {
            if (typeof value === 'number' || value instanceof Float32Array) values.set(name, value);
        }
        for (const control of this.blinkFxEffect?.controls ?? []) {
            if (control.type === 'bang') values.set(control.name, this.blinkFxControls.values[control.name] as number);
        }
        values.set('TIME', this.blinkFxTime);
        values.set('TIMEDELTA', delta);
        values.set('FRAMECOUNT', this.blinkFxFrame);
        values.set('RENDERSIZE', new Float32Array([this.screenWidth, this.screenHeight]));

        this.publishSsfPointer(values);
        const script = this.ssfScript;
        this.frameTimes.measure('script', () => {
            this.faultGuard.run('ssfScript', () => {
                const result = script.step({ dt: delta, values });
                if (!result.ok) {
                    throw result.error;
                }
            });
        });
        // A switched-off script keeps the uniforms it last wrote instead of dropping them to zero.
        Object.assign(this.blinkFxAudioValues, script.uniforms());
    }

    /**
     * Builds and initializes the effect's script, or returns null when it has none or the package
     * permitted the script to be switched off on a runtime that cannot run it.
     */
    private async startScript(
        effect: BlinkEffectIR,
        disabled: boolean,
        controls: ControlValueStore
    ): Promise<BlinkScriptRuntime | null> {
        if (effect.script === null || disabled) {
            return null;
        }

        const { entry, abi, events } = effect.script;

        // Only the native ABI runs here; another ABI needs a runtime of its own, and handing its
        // script to this one would run it with the wrong semantics.
        if (abi !== BLINK_SCRIPT_ABI) {
            return null;
        }

        const runtime = new BlinkScriptRuntime({
            abi,
            events,
            module: () => this.loadScriptModule(entry),
        });

        await runtime.init({
            controls: scriptControlSurface(controls),
            audio: this.lastAudioFrame ?? silentBlinkAudioFrame(),
        });

        return runtime;
    }

    /**
     * One script frame, skipped while the previous one is still settling: an async `update` that
     * takes longer than a frame must not have two overlapping invocations writing the same
     * controls.
     */
    private runScriptFrame(delta: number, frame: BlinkAudioFrame): void {
        const script = this.blinkScript;
        if (script === null || this.faultGuard.isDisabled('script')) {
            return;
        }
        if (this.blinkScriptFrameInFlight) {
            this.checkScriptHang();
            return;
        }

        this.blinkScriptFrameInFlight = true;
        this.blinkScriptFrameStartedAt = performance.now();
        void script
            .runFrame({
                dt: delta,
                elapsed: this.blinkFxTime,
                frame: this.blinkFxFrame,
                audio: frame,
                controls: scriptControlSurface(this.blinkFxControls, this.blinkFxControls.snapshotBangs()),
            })
            .then(result => {
                // A frame from the outgoing script settling late says nothing about the new one.
                if (this.blinkScript !== script) {
                    return;
                }
                if (result.ok) {
                    this.faultGuard.succeed('script');
                } else {
                    console.error('[blink] script frame failed', result.error);
                    this.faultGuard.report(
                        'script',
                        'error',
                        result.error instanceof Error ? result.error.message : String(result.error)
                    );
                }
            })
            .finally(() => {
                // Only the script still installed may clear the flag: a slow frame from the
                // outgoing script settling after a swap would otherwise unlock the new script
                // while its own frame is genuinely in flight.
                if (this.blinkScript === script) {
                    this.blinkScriptFrameInFlight = false;
                }
            });
    }

    /**
     * An async script frame that has not settled for this long is not slow, it is stuck: nothing
     * can interrupt it, so the script is switched off instead of waited for.
     */
    private checkScriptHang(): void {
        if (performance.now() - this.blinkScriptFrameStartedAt > SCRIPT_HANG_MS) {
            this.faultGuard.report('script', 'hang', `a script frame did not settle within ${SCRIPT_HANG_MS} ms`);
        }
    }

    public resize(newWidth: number, newHeight: number): void {
        fitCanvas(this.canvas, this.output, `${newWidth}px`, `${newHeight}px`);
    }

    /**
     * Write one BlinkFX control's uniform value; the next pass upload reads it.
     *
     * @throws {Error} if `name` is not a control declared by the currently loaded effect.
     */
    /**
     * Apply a whole set of control values at once, such as a preset.
     *
     * Rejects the set as a whole if any name is not a declared control, leaving every current
     * value untouched: a half-applied preset is a state no package described.
     */
    public applyControlValues(values: Readonly<Record<string, UniformValue>>): void {
        this.blinkFxControls.applyValues(values);
    }

    public setControlValue(name: string, value: UniformValue): void {
        this.blinkFxControls.set(name, value);
    }

    /** Queues an event for a declared bang control; repeated triggers retain their rising edges. */
    public fireBangControl(name: string): void {
        if (!this.blinkFxControls.queueBang(name)) throw new Error(`Unknown bang control: ${name}`);
    }

    /** Restores the declared default and clears accumulated source-control state. */
    public resetControlValue(name: string): void {
        const control = this.blinkFxEffect?.controls.find(candidate => candidate.name === name);
        if (control === undefined) throw new Error(`Unknown control: ${name}`);
        this.blinkFxControls.cancelBang(name);
        this.blinkFxControls.set(name, buildDefaultUniformValues([control])[name] ?? 0);
        this.profile?.resetControl?.(name);
    }

    /** A plain-data snapshot of current render state, for a debug panel to poll on its own throttle. */
    public getDiagnosticsSnapshot(): BlinkDiagnosticsSnapshot {
        return buildDiagnosticsSnapshot(
            this.blinkFxFps,
            this.blinkFxFrame,
            this.blinkFxTime,
            this.blinkFxDeltaTime,
            [this.screenWidth, this.screenHeight],
            this.passRuntime.describePasses(),
            // blinkFxAudioValues is always number-valued in practice (built by
            // buildBlinkAudioValues plus optional SSF script uniforms, both
            // Record<string, number>); it is typed as the broader UniformValue only
            // to share upload machinery with control values.
            { ...(this.blinkFxAudioValues as Record<string, number>) },
            this.frameTimes.report(),
            this.faultGuard.faults(),
            this.backendStats()?.gpuMemoryBytes
        );
    }

    public update(delta: number): void {
        this.blinkFxControls.beginFrame(!this.blinkScriptFrameInFlight);
        try {
            this.frameTimes.measure('update', () => this.updateFrame(delta));
        } finally {
            this.blinkFxControls.endFrame();
        }
    }

    private updateFrame(delta: number): void {
        // Step one of the frame, ahead of the script phase and every pass: the spec requires all
        // of them to observe one coherent set of input values, so they are latched here rather
        // than read live at sample time.
        this.pointer.setOutputHeight(this.screenHeight);
        this.pointer.snapshot();
        this.keyboard.snapshot();
        this.hostInputs.snapshot();

        this.updateFpsEstimate(delta);
        this.updateFrameUniforms(delta);
        if (this.profile?.processPcm === undefined) this.updateAudioUniforms(delta);
        this.updateBlinkFxFrameUniforms(delta);
        this.updateBlinkFxAudioUniforms(delta);

        if (this.dateClock.elapsedMilliseconds > 500) {
            this.dirtyFlags.push(UniformFlags.date);
            this.dateClock.restart();
        }

        if (this.dirtyFlags.pop(UniformFlags.resolution)) {
            this.updateResolutionUniform();
        }

        if (this.dirtyFlags.pop(UniformFlags.date)) {
            this.updateDateUniform();
        }

        if (this.dirtyFlags.pop(UniformFlags.mouse)) {
            this.updateMouseUniform();
        }

        if (this.dirtyFlags.pop(UniformFlags.surfacePosition)) {
            this.updateSurfacePositionUniform();
        }

        this.onUpdate.dispatch(delta);
    }

    private getArrayBufferSize(uniforms: GlobalUniforms): number {
        return Object.values(uniforms).reduce((size, type) => size + getUniformByteSize(type), 0);
    }

    private initUniforms(uniforms: GlobalUniforms): void {
        let offset = 0;

        for (const [name, type] of Object.entries(uniforms)) {
            const length = getUniformLength(type);
            const byteSize = getUniformByteSize(type);
            const value = createUniformValue(type, this.arrayBuffer, offset, length);
            const uniform = { name, type, value, length, offset, byteSize };

            Object.defineProperty(this.uniformValues, name, this.createUniformAccessor(uniform));

            this.uniformMap.set(name, uniform);

            offset += byteSize;
        }
    }

    private createUniformAccessor(uniform: Uniform): Obj {
        if (uniform.length === 1) {
            return {
                get(): number {
                    return uniform.value[0];
                },
                set(val: number): void {
                    uniform.value[0] = val;
                },
                enumerable: true,
                configurable: true,
            };
        }

        return {
            get(): UniformValues {
                return uniform.value;
            },
            set(val: UniformValues): void {
                uniform.value.set(val);
            },
            enumerable: true,
            configurable: true,
        };
    }

    /**
     * Every host-owned uniform a pass can be given, except the effect's own controls. One path
     * feeds both the per-frame upload and the material's declared schema, so the two cannot drift
     * apart: a name uploaded here is a name the material was built to accept.
     */
    private collectFrameUniforms(
        out: Record<string, UniformValue>,
        passIndex: number,
        resolution: readonly [number, number],
        audioValues: Readonly<Record<string, UniformValue>>
    ): Record<string, UniformValue> {
        for (const name of this.uniformMap.keys()) {
            out[name] = this.uniformValues[name] as UniformValue;
        }

        out.RENDERSIZE = new Float32Array(resolution);
        out.bl_pass = passIndex;
        out.PASSINDEX = passIndex;

        Object.assign(
            out,
            buildBlinkFrameValues(
                resolution,
                this.blinkFxTime,
                this.blinkFxDeltaTime,
                this.blinkFxFrame,
                this.blinkFxResolutionBuffer
            )
        );

        const pointer = this.pointer.state;
        Object.assign(
            out,
            buildBlinkPointerValues(
                pointer.position,
                pointer.pressOrigin,
                pointer.down,
                pointer.active,
                this.pointerPositionBuffer,
                this.pointerPressOriginBuffer,
                this.pointer.buttons,
                this.pointerButtonsBuffer
            )
        );

        Object.assign(out, audioValues);
        return out;
    }

    /** The host-owned scalar uniforms with neutral values, for declaring a freshly built material's schema. */
    private frameUniformDeclarations(profile: CompatibilityProfileInstance | null): Record<string, UniformValue> {
        return this.collectFrameUniforms({}, 0, [this.screenWidth, this.screenHeight], {
            ...buildBlinkAudioValues(silentBlinkAudioFrame()),
            ...profile?.neutralUniforms(),
        });
    }

    private uploadFrameUniforms(
        material: MeshMaterial,
        passIndex: number,
        resolution: readonly [number, number]
    ): void {
        const values = this.collectFrameUniforms(
            this.frameUniformScratch,
            passIndex,
            resolution,
            this.blinkFxAudioValues
        );
        for (const [name, value] of Object.entries(values)) {
            this.setDeclaredUniform(material, name, value);
        }
        const controlValues = this.profile === null ? this.blinkFxControls.values : this.profileControlValues;
        for (const [name, value] of Object.entries(controlValues)) {
            this.setDeclaredUniform(material, name, value);
        }
    }

    // Names a script invents at run time have no slot in the fixed schema; they are skipped
    // rather than failing the frame.
    private setDeclaredUniform(material: MeshMaterial, name: string, value: UniformValue): void {
        if (this.passRuntime.isDeclared(material, name)) {
            material.setUniform(name, value);
        }
    }

    private updateFrameUniforms(delta: number): void {
        this.uniformValues.TIME += delta;
        this.uniformValues.TIMEDELTA = delta;
        this.uniformValues.FRAMECOUNT += 1;
        this.uniformValues.PASSINDEX = 0;
    }

    // Smooths frame-to-frame jitter into a single running value instead of a sample
    // buffer: a weight of 0.1 gives roughly a 10-frame window, steady enough for a
    // debug panel readout without lagging noticeably behind a real fps change.
    private updateFpsEstimate(delta: number): void {
        if (delta <= 0) {
            return;
        }
        const instantaneous = 1 / delta;
        this.blinkFxFps =
            this.blinkFxFps === 0 ? instantaneous : this.blinkFxFps + (instantaneous - this.blinkFxFps) * 0.1;
    }

    private updateAudioUniforms(delta: number): void {
        this.audioService.update(delta);

        const { frequencyEnergy, bpm } = this.audioService;
        const beatIntensity = this.audioService.beatIntensity;
        const downbeatIntensity = this.audioService.downbeatIntensity;
        const bassPhaseDrive = this.audioService.bassPhaseDrive;
        const midPhaseDrive = this.audioService.midPhaseDrive;
        const treblePhaseDrive = this.audioService.treblePhaseDrive;

        this.uniformValues.BPM = bpm;

        this.uniformValues.BASS = frequencyEnergy.subarray(0, 4);
        this.uniformValues.MID = frequencyEnergy.subarray(4, 8);
        this.uniformValues.TREBLE = frequencyEnergy.subarray(8, 12);

        this.uniformValues.BASSTIME +=
            delta *
            bassPhaseDrive *
            (0.48 + this.uniformValues.BASS[3] * 1.05 + beatIntensity * 0.62 + downbeatIntensity * 0.38);
        this.uniformValues.MIDTIME +=
            delta * midPhaseDrive * (0.4 + this.uniformValues.MID[3] * 0.86 + beatIntensity * 0.46);
        this.uniformValues.TREBLETIME +=
            delta * treblePhaseDrive * (0.36 + this.uniformValues.TREBLE[3] * 0.78 + beatIntensity * 0.34);
    }

    private updateBlinkFxFrameUniforms(delta: number): void {
        if (this.blinkFxEffect === null) {
            return;
        }
        // Resolution is per-pass, not per-frame: resolved and uploaded in
        // uploadFrameUniforms from the resolution executePasses hands in.
        this.blinkFxTime = this.profile?.processPcm === undefined ? this.uniformValues.TIME : this.ssfStageTime;
        this.blinkFxDeltaTime = delta;
        this.blinkFxFrame =
            this.profile?.processPcm === undefined ? this.uniformValues.FRAMECOUNT : this.ssfStageCounter;
    }

    private updateBlinkFxAudioUniforms(delta: number): void {
        if (this.blinkFxEffect === null) {
            return;
        }
        if (this.profile?.processPcm !== undefined) {
            const frame = silentBlinkAudioFrame();
            this.runSsfScript(Math.fround(delta));
            this.profileControlValues = this.profile.processControls(this.blinkFxControls.values, delta);
            this.blinkFxAudioValues = {
                ...buildBlinkAudioValues(frame),
                ...this.profile.update({
                    audio: frame,
                    deltaTime: Math.fround(delta),
                    mediaActive: this.hostInputs.hasImageSource(),
                }),
                ...this.ssfScript?.uniforms(),
            };
            this.lastAudioFrame = frame;
            return;
        }
        const frequencyEnergy = this.audioService.frequencyEnergy;
        const waveformData = this.audioService.waveformData;
        const fftSpectrum = this.audioService.fftSpectrum;
        const inputLevelValue = this.audioService.inputLevel;

        const frame = updateBlinkAudioSignals(this.blinkFxAudioSignalState, {
            frequencyEnergy: this.audioService.frequencyEnergy,
            rawFrequencyEnergy: this.audioService.rawFrequencyEnergy,
            beatIntensity: this.audioService.beatIntensity,
            downbeatIntensity: this.audioService.downbeatIntensity,
            beatPulse: this.audioService.beatPulseLevel,
            barPulse: this.audioService.downbeatPulseLevel,
            beatPhase: this.audioService.beatPhase,
            onsetStrength: this.audioService.onsetStrength,
            bpm: this.audioService.bpm,
            inputLevelValue,
            currentTime: this.uniformValues.TIME,
            dt: delta,
        });

        this.blinkFxAudioValues = buildBlinkAudioValues(frame);
        this.lastAudioFrame = frame;
        this.runScriptFrame(delta, frame);

        if (this.profile !== null) {
            Object.assign(
                this.blinkFxAudioValues,
                this.profile.update({ audio: frame, deltaTime: delta, mediaActive: this.hostInputs.hasImageSource() })
            );
            this.runSsfScript(delta);
            this.profileControlValues = this.profile.processControls(this.blinkFxControls.values, delta);
        }

        if (this.profile?.audioSurface !== undefined) return;
        const candidates = computeTrailCandidates({
            frequencyEnergy: this.audioService.frequencyEnergy,
            rawFrequencyEnergy: this.audioService.rawFrequencyEnergy,
            inputLevelValue,
            fftSpectrum,
        });
        this.blinkFxAudioTextures.update(
            frequencyEnergy,
            fftSpectrum,
            frame,
            waveformData,
            delta,
            this.audioService.sampleRate,
            candidates,
            this.audioService.fftSpectrumLog
        );
    }

    private updateResolutionUniform(): void {
        const { RESOLUTION } = this.uniformValues;

        RESOLUTION[0] = this.screenWidth;
        RESOLUTION[1] = this.screenHeight;
    }

    private updateDateUniform(): void {
        const now = new Date();
        const [year, month, day] = [now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDay()];
        const { DATE } = this.uniformValues;

        DATE[0] = year;
        DATE[1] = month;
        DATE[2] = day;
        DATE[3] = Math.round((now.getTime() - new Date(year, month, day).getTime()) / 1000);
    }

    private updateMouseUniform(): void {
        const { MOUSE } = this.uniformValues;

        MOUSE[0] = 0;
        MOUSE[1] = 0;
        MOUSE[2] = 1;
        MOUSE[3] = 1;
    }

    private updateSurfacePositionUniform(): void {
        const { SURFACEPOSITION } = this.uniformValues;

        SURFACEPOSITION[0] = 0;
        SURFACEPOSITION[1] = 0;
    }
}
