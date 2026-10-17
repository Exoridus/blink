import './index.scss';

import { Application } from './classes/Application';
import { acquireSource } from './services/acquireSource';
import { AudioService } from './services/AudioService';
import { BlinkFxService } from './services/BlinkFxService';
import { EnvService } from './services/EnvService';
import { InstalledPackageService } from './services/InstalledPackageService';
import { IndexedDbPackageStore, MemoryPackageStore } from './services/PackageStore';
import { RenderService } from './services/RenderService';
import type { GlobalUniforms, RendererConfig } from './types';
import { UniformType } from './types';
import { Shell } from './ui/shell/Shell';
import type { StartConfig } from './ui/StartScreen';
import { StartScreen } from './ui/StartScreen';
import { rememberSource } from './ui/startSelection';

const FFT_SIZE = 2048;

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

const buildRendererConfig = (canvas: HTMLCanvasElement): RendererConfig => ({
    view: canvas,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x000000,
    backgroundAlpha: 1,
    useContextAlpha: false,
    antialias: false,
    clearBeforeRender: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    backend: new URLSearchParams(window.location.search).get('backend') === 'webgpu' ? 'webgpu' : 'webgl2',
});

const runProbeCapture = async (probeId: string, durationSeconds: number): Promise<void> => {
    const bridge = window.blinkAudioDebug;
    if (bridge === undefined) {
        console.warn('[blink] probe capture requested but debug bridge is unavailable (production build?)');
        return;
    }
    console.log(`[blink] probe capture "${probeId}" starting (${durationSeconds}s)...`);
    const result = await bridge.captureProbeSession({
        probeId,
        expectedDurationSeconds: durationSeconds,
        preRollSeconds: 1,
    });
    console.log('[blink] probe capture complete', result);
    console.log('[blink] analyser stats:', JSON.stringify(bridge.getCurrentAudioSurfaceStats(), null, 2));
};

const handleStartSubmit = async (
    config: StartConfig,
    startScreen: StartScreen,
    blinkFxService: BlinkFxService,
    viewCanvas: HTMLCanvasElement
): Promise<void> => {
    startScreen.setLoading(true);
    startScreen.setStatus('Verbinde Audio-Quelle...');

    // Declared outside the try so the catch block can tear them down: Application.init() now
    // starts the render loop before the effect load that can fail (see the comment on init()),
    // so a rejection here leaves a live rAF loop, live GPU resources and a live capture - a
    // lit microphone or screen-share indicator - behind unless the catch below releases them.
    let releaseSource: (() => void) | undefined;
    let audioService: AudioService | undefined;
    let renderService: RenderService | undefined;
    let application: Application | undefined;

    try {
        const { source, cleanup } = await acquireSource({
            type: config.sourceType,
            url: config.url,
            file: config.file,
        });
        releaseSource = cleanup;

        const envService = new EnvService(import.meta.env.MODE, __APP_VERSION__);
        // Live from here on: the constructor connects the analyser and beat-detector taps to
        // the source immediately, so a throw from the RenderService constructor below already
        // has a Web Audio graph to release.
        audioService = new AudioService(source, FFT_SIZE);
        renderService = new RenderService(audioService, buildRendererConfig(viewCanvas), uniforms);
        application = new Application(envService, renderService, blinkFxService);

        await application.init(config.packageId);
        rememberSource(config.sourceType, config.url);

        // Mounted only now that init() has actually resolved: a rejected init must leave the
        // start screen as the only thing on screen, never a shell with nothing behind it.
        const shell = new Shell(application);
        shell.mount(document.body);

        const params = new URLSearchParams(window.location.search);
        const probeId = params.get('probe');
        if (probeId !== null) {
            const durParam = Number(params.get('dur') ?? '30');
            const durationSeconds = Number.isFinite(durParam) && durParam > 0 ? durParam : 30;
            void runProbeCapture(probeId, durationSeconds);
        }

        startScreen.unmount();
    } catch (error) {
        // Every throw between acquiring the source and mounting the shell lands here, including
        // one from a constructor that ran after the source was already live, so each resource is
        // released through the owner that exists at that point: the application once it owns the
        // render service, the render service on its own before that, and the source last -
        // acquiring it is what hands out the only handle that stops it.
        // A throwing teardown must not swallow the source release, nor replace the error the
        // user needs to see with its own. Exactly one owner runs: an application owns the render
        // service, a render service owns the audio service, and below that each is released on
        // its own - so nothing is torn down twice and nothing is missed.
        try {
            if (application !== undefined) {
                await application.destroy();
            } else if (renderService !== undefined) {
                await renderService.destroy();
            } else {
                audioService?.destroy();
            }
        } catch (teardownError) {
            console.error('[blink] teardown after a failed start threw', teardownError);
        } finally {
            releaseSource?.();
        }

        const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
        startScreen.setStatus(message, true);
        startScreen.setLoading(false);
    }
};

// Probe capture is a development workflow, so the deterministic probe master is
// kept out of the shipped bundle and served from the repository by the dev server.
// A production build reaches it only through an explicit ?src= parameter.
const PROBE_MASTER_URL = '/docs/research/audio/probes/ssf_audio_probe_master_v1.wav';

const main = async (): Promise<void> => {
    if (new URLSearchParams(window.location.search).get('lab') === 'audio') {
        document.querySelector('#app')?.remove();
        const labModule = await import('./ui/lab/AudioAnalysisLabView');
        await new labModule.AudioAnalysisLabView().mount(document.body);
        return;
    }
    const viewCanvas = document.body.querySelector<HTMLCanvasElement>('#view');
    const viewContainer = document.body.querySelector<HTMLElement>('#app');

    if (viewCanvas === null) throw new Error('Could not find view canvas element!');
    if (viewContainer === null) throw new Error('Could not find view container element!');

    // Without IndexedDB (some private windows) packages still install, for this session only.
    const packageStore = typeof indexedDB === 'undefined' ? new MemoryPackageStore() : new IndexedDbPackageStore();
    const blinkFxService = new BlinkFxService(new InstalledPackageService(packageStore));
    const packageList = await blinkFxService.getPackageList();
    const startScreen = new StartScreen(packageList);

    const params = new URLSearchParams(window.location.search);
    const probeId = params.get('probe');
    if (probeId !== null) {
        startScreen.prefill({
            sourceType: 'url',
            url: params.get('src') ?? PROBE_MASTER_URL,
            packageId: params.get('fx') ?? 'com.codexo.audio_debug',
        });
    }

    startScreen.onSubmit.add(config => {
        void handleStartSubmit(config, startScreen, blinkFxService, viewCanvas);
    });

    startScreen.mount(document.body);
};

void main();
