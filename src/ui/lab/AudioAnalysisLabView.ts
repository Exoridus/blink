import { getAudioContext } from '@codexo/exojs';
import { BeatDetector } from '@codexo/exojs-audio-fx';

import { loadBlinkFx } from '../../packages/blinkfx/loader';
import { MemoryPackageFiles } from '../../packages/blinkfx/packageReader';
import type { ConvertedPackage } from '../../packages/convert/report';
import { convertSsfScene, type SsfSceneSource } from '../../packages/ssf/convert/convertSsfScene';
import { sampleSsf1D } from '../../packages/ssf/original/sampling';
import { readSsfDirectory, readSsfMarketplaceTar } from '../../packages/ssf/package';
import { AudioAnalysisLab, compareArrays, type LabFrame } from '../../runtime/lab/AudioAnalysisLab';
import { type BeatAnnotations, compareBeatEvents, validateBeatAnnotations } from '../../runtime/lab/beatMetrics';
import { LabRenderSurface } from '../../runtime/lab/LabRenderSurface';
import { pixelDifference, type PixelMask } from '../../runtime/lab/pixelDifference';
import { diagnosticRamp, diagnosticScene, type VisualDiagnostic } from '../../runtime/lab/visualDiagnostics';
import { mountPackage, unmountPackage } from '../../runtime/package';
import { DEFAULT_OUTPUT, mapPreviewPoint, type OutputSettings } from '../../runtime/render/outputSettings';
import { outputSettingsControls } from '../outputSettings';

const MARKER: SsfSceneSource = {
    slug: 'ssf2_audio_marker',
    sceneJson: {
        TITLE: 'SSF 2.0 Audio Marker',
        CONTROLS: [
            { NAME: 'gain', TYPE: 'slider', MIN: 0, MAX: 2, DEFAULT: 1, UI_GROUP: 'Display' },
            {
                NAME: 'channel',
                TYPE: 'dropdown',
                VALUES: [0, 1, 2, 3],
                LABELS: ['Raw', 'Juiced', 'Smooth', 'Waveform'],
                DEFAULT: 0,
                UI_GROUP: 'Display',
            },
        ],
        PASSES: [{ TARGET: 'marker', FLOAT: true, DOUBLE_BUFFER: true }],
    },
    mainGlsl: `vec4 renderMain() {
    vec4 spectrum = texture(syn_Spectrum, _uv.x);
    float value = channel < 0.5 ? spectrum.r : channel < 1.5 ? spectrum.g : channel < 2.5 ? spectrum.b : spectrum.a;
    return vec4(vec3(step(_uv.y, value * gain)), 1.0);
  }`,
    scriptJs: 'function update(dt) { setUniform("markerScriptTime", dt); }',
    files: new Map(),
};

function download(name: string, text: string, type = 'application/json'): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
}

function gpuMetadata(canvas: HTMLCanvasElement): object {
    const gl = canvas.getContext('webgl2');
    if (gl === null) return { status: 'unavailable' };
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
        renderer: String(gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
        vendor: String(gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
        version: String(gl.getParameter(gl.VERSION)),
    };
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('2D canvas unavailable');
    return context;
}

function controlComponents(value: unknown, color: boolean): number[] {
    if (Array.isArray(value)) return (value as number[]).slice(0, color ? 3 : 2);
    if (typeof value === 'number') return [value];
    return [value === true ? 1 : 0];
}

export class AudioAnalysisLabView {
    private readonly root = document.createElement('main');
    private scene = MARKER;
    private output: OutputSettings = DEFAULT_OUTPUT;
    private captureRows: object[] = [];
    private reference: { pixels: ImageData; name: string; sha256: string } | null = null;
    private pixelComparison: object | null = null;
    private debugMode(): VisualDiagnostic {
        return this.element<HTMLSelectElement>('[data-visual-debug]').value as VisualDiagnostic;
    }
    private pcm = Float32Array.from(
        { length: 44100 * 15 },
        (_, i) => Math.sin((i * 2 * Math.PI * 220) / 44100) * (i % 22050 < 1000 ? 0.5 : 0.05)
    );
    private lab: AudioAnalysisLab | null = null;
    private surfaces: [LabRenderSurface, LabRenderSurface] | null = null;
    private latest: LabFrame | null = null;
    private playing = false;
    private detector: BeatDetector | null = null;
    private audioSource: AudioBufferSourceNode | null = null;
    private playbackOrigin = 0;
    private readonly events: Array<{ time: number; bpm: number; confidence: number; status: string }> = [];
    private mountRoot = '';
    private operation = Promise.resolve();
    private sourceHash = '';
    private sceneHash = '';
    private annotations: BeatAnnotations | null = null;
    private playStart = 0;
    private playEnd = 0;
    private playbackDriftSeconds = 0;
    private captureUniforms: object | null = null;
    private captureInstant: { frame: number; epoch: number } | null = null;
    private passPixels: Array<Awaited<ReturnType<LabRenderSurface['capturePasses']>>> = [];

    public constructor() {
        this.root.className = 'audio-analysis-lab';
        this.root.innerHTML = `<style>
      .audio-analysis-lab{position:relative;background:#10151d;color:#e5ecf5;padding:24px;min-height:100vh;font:14px system-ui;overflow:auto}
      .audio-analysis-lab pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto}.audio-analysis-lab output{overflow-wrap:anywhere}.audio-analysis-lab h1{font-size:24px;margin:0 0 16px}.audio-analysis-lab button,.audio-analysis-lab select,.audio-analysis-lab input{padding:7px;background:#253246;color:#fff;border:1px solid #61748a;border-radius:4px}
      .audio-analysis-lab label{display:inline-flex;gap:8px;align-items:center;margin:6px 12px 6px 0}.lab-previews{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}.lab-previews section{min-width:0}.lab-preview-box{height:360px;background:#000}.lab-previews canvas{width:100%;height:100%;object-fit:contain;background:#000}
      .audio-analysis-lab table{border-collapse:collapse;width:100%;font:12px monospace}.audio-analysis-lab td,.audio-analysis-lab th{padding:6px;text-align:left;border-bottom:1px solid #354256}.lab-controls{display:flex;flex-wrap:wrap;gap:10px}.lab-control{padding:8px;background:#1b2533;max-width:400px}.lab-warning{color:#ffc477;white-space:pre-wrap}.lab-plot{width:100%;height:160px;background:#17202b}.audio-analysis-lab details{margin:16px 0}.audio-analysis-lab output{display:block;font:12px monospace;color:#a4d1ed}.lab-toolbar{display:flex;flex-wrap:wrap;gap:8px}
    </style>
    <h1>Audio Analysis Lab</h1>
    <details open><summary>Output & Preview</summary><div data-output-settings></div><label>Visual debug <select data-visual-debug><option value="scene">Scene + recorded PCM</option><option value="quadrants">Quadrants (audio off)</option><option value="coordinates">UV grid (audio off)</option><option value="spectrum">Spectrum RGBA ramps</option><option value="trail">LevelTrail RGBA ramps</option></select></label><output data-render-clock></output><output data-coordinates>Move over a preview for fragment coordinates</output></details><details><summary>Texture samples (RGBA)</summary><pre data-texture-samples></pre></details>
    <div class="lab-toolbar"><label>SSF-Verzeichnis <input data-scene type="file" webkitdirectory multiple></label><label>Marketplace TAR <input data-tar type="file" accept=".tar"></label><label>Audio <input data-audio type="file" accept="audio/*"></label>
      <label>Lane B <select data-profile><option value="original">SSF Original</option><option value="enhanced">ExoJS Enhanced (0.19.1, experimentell)</option></select></label>
      <button data-play>Play</button><button data-step>Frame weiter</button><button data-reset>Reset</button><button data-export>JSON exportieren</button><button data-csv>CSV exportieren</button></div>
    <label>Frame <input data-seek type="number" min="0" value="0"><button data-scrub>Seek + Replay</button></label>
    <p data-status role="status">Initialisiere Marker-Szene…</p><p class="lab-warning" data-warning></p>
    <div class="lab-previews"><section><h2>Lane A · SSF Original</h2><div class="lab-preview-box"><canvas data-a></canvas></div><output data-a-info></output></section><section><h2 data-b-title>Lane B · SSF Original</h2><div class="lab-preview-box"><canvas data-b></canvas></div><output data-b-info></output></section></div>
    <h2>Scene Controls</h2><label>Bearbeiten <select data-control-lane><option value="shared">Gemeinsam</option><option value="a">Override A</option><option value="b">Override B</option></select></label><div class="lab-controls" data-controls></div>
    <details><summary>Audio- und Analyzer-Einstellungen</summary><label>SSF Reactivity <input data-reactivity type="number" min="0" max="1" step="0.05" value="0.5"></label><label>SSF Audio Speed <input data-speed type="number" min="0" max="1" step="0.05" value="0.5"></label>
      <label>ExoJS min BPM <input data-min-bpm type="number" value="50" min="20" max="200"></label><label>ExoJS max BPM <input data-max-bpm type="number" value="300" min="80" max="400"></label><button data-rebuild>Übernehmen + Reset</button>
      <p>Analyzer-Einstellungen bleiben außerhalb der importierten scene.json. Enhanced verwendet beim Replay ohne Worklet-Evidenz Original-Fallback.</p></details>
    <details open><summary>Signalgraph · Spectrum / LevelTrail</summary><select data-plot><option value="spectrum">Spectrum (1024 × 4)</option><option value="trail">LevelTrail (400 × 4, neuester Wert rechts)</option></select><p>Raw: Cyan · Juiced: Orange · Smooth: Grün · Waveform: Violett. A durchgezogen, B gestrichelt.</p><canvas class="lab-plot" data-graph width="960" height="160"></canvas><output data-diff></output></details>
    <details><summary>Alle 51 Quellen und Herkunft</summary><table><thead><tr><th>Quelle</th><th>A</th><th>B</th><th>Δ</th><th>Herkunft / Fallback</th></tr></thead><tbody data-signals></tbody></table></details>
    <details><summary>Beat Grid / Onsets</summary><label>Geprüfte Annotationen (JSON) <input data-annotations type="file" accept=".json"></label><output data-beats>Musikalische Genauigkeit: UNKNOWN · keine unabhängigen Annotationen geladen</output></details>
    <details><summary>Passes / GPU-Diff</summary><button data-capture>Pass-Diff erfassen</button><label>Pass <select data-pass-select></select></label><label>Ansicht <select data-pass-view><option value="wipe">A/B Wipe</option><option value="diff">Abs-Diff ×10</option><option value="a">A</option><option value="b">B</option></select></label><label>Wipe <input data-wipe type="range" min="0" max="1" step="0.01" value="0.5"></label><canvas class="lab-plot" data-pass-canvas></canvas><output data-capture-info>Noch keine Passaufnahme</output><output data-passes></output><div data-pass-thumbnails></div></details>
    <details><summary>Native image comparison (presentation bytes)</summary><label>Reference PNG <input data-reference type="file" accept="image/png"></label><label>Excluded rectangles (x,y,width,height) <input data-pixel-masks value="[]" placeholder='[ {"x":0,"y":0,"width":100,"height":40} ]'></label><button data-pixel-compare>Compare displayed output</button><canvas class="lab-plot" data-pixel-heatmap></canvas><output data-pixel-metrics>No aligned native capture loaded; UI and watermark masks must be explicit</output></details>
    <p>SSF_PARITY: INCONCLUSIVE · MUSICAL_ACCURACY: UNKNOWN · VISUAL_PREFERENCE: UNKNOWN</p>`;
    }

    public async mount(parent: HTMLElement): Promise<void> {
        parent.append(this.root);
        this.element('[data-output-settings]').append(
            outputSettingsControls(this.output, settings => {
                void this.guard(async () => {
                    const rebuild = settings.width !== this.output.width || settings.height !== this.output.height;
                    this.output = settings;
                    for (const chrome of this.root.querySelectorAll<HTMLElement>(
                        '.lab-toolbar, h1, details, .lab-controls'
                    ))
                        chrome.style.setProperty('zoom', String(settings.uiScale));
                    if (rebuild) await this.rebuild();
                    else {
                        if (this.surfaces) for (const surface of this.surfaces) surface.setPresentation(settings);
                        if (this.latest !== null) this.show(this.latest);
                    }
                });
            })
        );
        this.element('[data-visual-debug]').addEventListener('change', () => {
            void this.guard(() => this.rebuild());
        });
        this.element<HTMLInputElement>('[data-scene]').addEventListener('change', () => {
            void this.guard(() => this.importScene());
        });
        this.element<HTMLInputElement>('[data-tar]').addEventListener('change', () => {
            void this.guard(async () => {
                const file = this.element<HTMLInputElement>('[data-tar]').files?.[0];
                if (file === undefined) return;
                this.scene = readSsfMarketplaceTar(new Uint8Array(await file.arrayBuffer())).scene();
                await this.rebuild();
            });
        });
        this.element<HTMLInputElement>('[data-audio]').addEventListener('change', () => {
            void this.guard(() => this.importAudio());
        });
        this.element('[data-step]').addEventListener('click', () => {
            void this.guard(() => this.step());
        });
        this.element('[data-play]').addEventListener('click', () => {
            void this.guard(() => this.togglePlayback());
        });
        this.element('[data-reset]').addEventListener('click', () => {
            void this.guard(async () => {
                this.pause();
                if (this.lab !== null) this.show(await this.lab.seek(0));
            });
        });
        this.element('[data-scrub]').addEventListener('click', () => {
            void this.guard(async () => {
                this.pause();
                if (this.lab !== null)
                    this.show(await this.lab.seek(Number(this.element<HTMLInputElement>('[data-seek]').value)));
            });
        });
        this.element('[data-export]').addEventListener('click', () =>
            download('blink-ssf-lab.json', JSON.stringify(this.report(), null, 2))
        );
        this.element('[data-csv]').addEventListener('click', () => this.exportCsv());
        for (const selector of ['[data-pass-select]', '[data-pass-view]', '[data-wipe]'])
            this.element(selector).addEventListener('input', () => this.drawPass());
        this.element<HTMLInputElement>('[data-annotations]').addEventListener('change', () => {
            void this.guard(async () => {
                const file = this.element<HTMLInputElement>('[data-annotations]').files?.[0];
                if (file === undefined) return;
                this.annotations = validateBeatAnnotations(
                    JSON.parse(await file.text()),
                    this.sourceHash,
                    this.pcm.length / 44100
                );
                if (this.latest !== null) this.show(this.latest);
            });
        });
        this.element('[data-capture]').addEventListener('click', () => {
            void this.guard(() => this.capture());
        });
        this.element('[data-rebuild]').addEventListener('click', () => {
            void this.guard(() => this.rebuild());
        });
        this.element('[data-profile]').addEventListener('change', () => {
            localStorage.setItem(
                `blink.ssf.analysis.${this.scene.slug}`,
                this.element<HTMLSelectElement>('[data-profile]').value
            );
            void this.guard(() => this.rebuild());
        });
        this.element('[data-plot]').addEventListener('change', () => {
            if (this.latest !== null) this.plot(this.latest);
        });
        for (const selector of ['[data-a]', '[data-b]'])
            this.element<HTMLCanvasElement>(selector).addEventListener('pointermove', event => {
                const rect = this.element(selector).getBoundingClientRect();
                const point = mapPreviewPoint(
                    event.clientX - rect.left,
                    event.clientY - rect.top,
                    rect.width,
                    rect.height,
                    this.output
                );
                if (point === null) {
                    this.element('[data-coordinates]').textContent = 'Letterbox: outside render output';
                    return;
                }
                const xy = [Math.floor(point[0]) + 0.5, this.output.height - Math.floor(point[1]) - 0.5];
                this.element('[data-coordinates]').textContent = JSON.stringify({
                    _xy: xy,
                    _uv: [xy[0] / this.output.width, xy[1] / this.output.height],
                    _uvc: [
                        xy[0] / this.output.height - this.output.width / this.output.height / 2,
                        xy[1] / this.output.height - 0.5,
                    ],
                    RENDERSIZE: [this.output.width, this.output.height],
                });
            });
        this.element('[data-reference]').addEventListener('change', () => {
            void this.guard(async () => {
                const file = this.element<HTMLInputElement>('[data-reference]').files?.[0];
                if (file === undefined) return;
                const bitmap = await createImageBitmap(file);
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const context = context2d(canvas);
                    context.drawImage(bitmap, 0, 0);
                    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))]
                        .map(value => value.toString(16).padStart(2, '0'))
                        .join('');
                    this.reference = {
                        name: file.name,
                        sha256,
                        pixels: context.getImageData(0, 0, bitmap.width, bitmap.height),
                    };
                    this.pixelComparison = null;
                    this.element('[data-pixel-metrics]').textContent =
                        `Reference ${file.name}: ${bitmap.width} × ${bitmap.height}. Matching PCM, frame and controls are required.`;
                } finally {
                    bitmap.close();
                }
            });
        });
        this.element('[data-pixel-compare]').addEventListener('click', () => {
            void this.guard(() => this.compareReference());
        });
        await this.rebuild();
    }

    private async compareReference(): Promise<void> {
        if (this.reference === null || this.surfaces === null || this.latest === null)
            throw new Error('Reference PNG and rendered frame required');
        const reference = this.reference;
        if (reference.pixels.width !== this.output.width || reference.pixels.height !== this.output.height)
            throw new Error('Reference must match target resolution; crop UI/letterbox areas before import');
        const canvas = document.createElement('canvas');
        canvas.width = this.output.width;
        canvas.height = this.output.height;
        const context = context2d(canvas);
        context.drawImage(this.element<HTMLCanvasElement>('[data-a]'), 0, 0);
        const masks = JSON.parse(this.element<HTMLInputElement>('[data-pixel-masks]').value) as PixelMask[];
        const diff = pixelDifference(
            context.getImageData(0, 0, canvas.width, canvas.height).data,
            reference.pixels.data,
            canvas.width,
            canvas.height,
            masks
        );
        const heatmap = this.element<HTMLCanvasElement>('[data-pixel-heatmap]');
        heatmap.width = canvas.width;
        heatmap.height = canvas.height;
        context2d(heatmap).putImageData(
            new ImageData(diff.heatmap as Uint8ClampedArray<ArrayBuffer>, canvas.width, canvas.height),
            0,
            0
        );
        this.pixelComparison = {
            stage: 'browser presentation RGB bytes',
            frame: this.latest.frame,
            epoch: this.latest.a.snapshot.instant.sourceEpoch,
            reference: { name: reference.name, sha256: reference.sha256 },
            masks,
            metrics: diff.metrics,
            verdict: 'INCONCLUSIVE: reference PCM/time/control identity must be externally established',
        };
        this.element('[data-pixel-metrics]').textContent = JSON.stringify(this.pixelComparison, null, 2);
    }

    private element<T extends HTMLElement = HTMLElement>(selector: string): T {
        const element = this.root.querySelector<T>(selector);
        if (element === null) throw new Error(`Lab element missing: ${selector}`);
        return element;
    }

    private async guard(action: () => Promise<void>): Promise<void> {
        const operation = this.operation.then(async () => {
            try {
                await action();
            } catch (error) {
                this.pause();
                this.element('[data-status]').textContent = String(error);
            }
        });
        this.operation = operation;
        await operation;
    }

    private async rebuild(): Promise<void> {
        this.pause();
        this.lab?.destroy();
        await Promise.all(this.surfaces?.map(surface => surface.destroy()) ?? []);
        if (this.mountRoot !== '') unmountPackage(this.mountRoot);
        const mode = this.debugMode();
        const renderScene = mode === 'scene' ? this.scene : diagnosticScene(mode);
        const converted = convertSsfScene(renderScene);
        if (converted.report.status === 'failed')
            throw new Error(converted.report.issues.map(issue => issue.message).join('\n'));
        const scriptWarning =
            this.scene.scriptJs === undefined
                ? ''
                : 'Script: isolierter Worker mit Zeitlimit; moderne JS-Semantik, Duktape-Parität unqualifiziert.';
        this.element('[data-warning]').textContent = [
            scriptWarning,
            ...converted.report.issues.filter(issue => issue.severity !== 'info').map(issue => issue.message),
        ]
            .filter(Boolean)
            .join('\n');
        this.mountRoot = `blinkfx-installed/lab-${Date.now()}`;
        const files = new Map(
            [...converted.files].map(([name, bytes]) => [
                name,
                typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes,
            ])
        );
        mountPackage(this.mountRoot, new MemoryPackageFiles(files));
        const effect = loadBlinkFx(converted.manifest, this.mountRoot);
        const surfaces: [LabRenderSurface, LabRenderSurface] = [
            new LabRenderSurface(
                this.element<HTMLCanvasElement>('[data-a]'),
                effect,
                converted,
                this.output,
                mode === 'spectrum' || mode === 'trail'
            ),
            new LabRenderSurface(
                this.element<HTMLCanvasElement>('[data-b]'),
                effect,
                converted,
                this.output,
                mode === 'spectrum' || mode === 'trail'
            ),
        ];
        this.surfaces = surfaces;
        await Promise.all(surfaces.map(surface => surface.init()));
        const enhanced = this.element<HTMLSelectElement>('[data-profile]').value === 'enhanced';
        this.element('[data-b-title]').textContent = enhanced
            ? 'Lane B · ExoJS Enhanced (experimentell)'
            : 'Lane B · SSF Original';
        this.lab = new AudioAnalysisLab(effect, mode === 'scene' ? this.pcm : new Float32Array(this.pcm.length), {
            fps: 60,
            outputSize: [this.output.width, this.output.height],
            enhanced,
            exoVersion: '0.19.1',
            renderers: surfaces,
            scriptSource: renderScene.scriptJs,
            sandboxScripts: true,
            reactivity: Number(this.element<HTMLInputElement>('[data-reactivity]').value),
            audioSpeed: Number(this.element<HTMLInputElement>('[data-speed]').value),
            tempoEvidence: () =>
                this.detector === null || this.detector.analysisTime === 0 || this.latest === null
                    ? null
                    : {
                          bpm: this.detector.tempo,
                          confidence: this.detector.confidence,
                          sourceEpoch: this.latest.a.snapshot.instant.sourceEpoch,
                          sampleIndex: Math.floor((this.detector.analysisTime - this.playbackOrigin) * 44100),
                      },
        });
        await this.hashInputs(converted, renderScene, mode !== 'scene');
        this.controls(converted);
        this.events.length = 0;
        this.playStart = this.playEnd = 0;
        this.pixelComparison = null;
        this.element('[data-pixel-metrics]').textContent = 'No comparison for this render epoch';
        this.captureUniforms = null;
        this.captureRows = [];
        this.passPixels = [];
        this.captureInstant = null;
        this.element('[data-passes]').textContent = '';
        this.element<HTMLCanvasElement>('[data-pass-canvas]').getContext('2d')?.clearRect(0, 0, 480, 270);
        if (this.annotations?.pcmSha256 !== this.sourceHash) this.annotations = null;
        await this.step();
    }

    private async hashInputs(
        converted: ConvertedPackage,
        renderScene: SsfSceneSource,
        audioDisabled: boolean
    ): Promise<void> {
        const digest = async (bytes: Uint8Array): Promise<string> =>
            [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))]
                .map(value => value.toString(16).padStart(2, '0'))
                .join('');
        this.sourceHash = await digest(
            new Uint8Array(audioDisabled ? new Float32Array(this.pcm.length).buffer : this.pcm.buffer)
        );
        const assets = await Promise.all(
            [...converted.files.entries()]
                .sort(([a], [b]) => a.localeCompare(b, 'en'))
                .map(async ([name, bytes]) => ({
                    name,
                    sha256: await digest(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes),
                }))
        );
        this.sceneHash = await digest(
            new TextEncoder().encode(
                JSON.stringify({
                    scene: renderScene.sceneJson,
                    glsl: renderScene.mainGlsl,
                    script: renderScene.scriptJs,
                    manifest: converted.manifest,
                    assets,
                })
            )
        );
    }

    private controls(converted: ConvertedPackage): void {
        const root = this.element('[data-controls]');
        root.replaceChildren();
        for (const control of converted.manifest.controls ?? []) {
            const metadata = converted.manifest.compatibility?.controls?.[control.name] as
                { type?: string; labels?: string[]; values?: number[] } | undefined;
            const row = document.createElement('div');
            row.className = 'lab-control';
            const label = document.createElement('div');
            label.textContent = `${control.group ?? 'ungrouped'} / ${control.label ?? control.name} · ${metadata?.type ?? control.type}`;
            row.append(label);
            const value = 'default' in control ? control.default : 0;
            if (metadata?.type?.startsWith('dropdown') && metadata.labels !== undefined) {
                const select = document.createElement('select');
                for (const [index, name] of metadata.labels.entries()) {
                    const option = new Option(name, String(metadata.values?.[index] ?? index));
                    select.add(option);
                }
                select.value = String(value);
                select.addEventListener('change', () => this.edit(control.name, Number(select.value)));
                row.append(select);
            } else {
                const components = controlComponents(value, control.type === 'color');
                const editors = components.map((component, index) => {
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.step = '0.01';
                    input.value = String(component);
                    input.style.width = '80px';
                    if ('min' in control && control.min !== undefined)
                        input.min = String(Array.isArray(control.min) ? control.min[index] : control.min);
                    if ('max' in control && control.max !== undefined)
                        input.max = String(Array.isArray(control.max) ? control.max[index] : control.max);
                    input.addEventListener('change', () => {
                        const next = editors.map(editor => Number(editor.value));
                        if (control.type === 'color') next.push(1);
                        this.edit(control.name, next.length === 1 ? next[0] : next);
                    });
                    row.append(input);
                    return input;
                });
            }
            const effective = document.createElement('output');
            effective.dataset.control = control.name;
            row.append(effective);
            root.append(row);
        }
    }

    private edit(name: string, value: number | number[]): void {
        this.lab?.setControl(
            name,
            value,
            this.element<HTMLSelectElement>('[data-control-lane]').value as 'shared' | 'a' | 'b'
        );
        if (!this.playing) void this.guard(() => this.step());
    }

    private async step(): Promise<void> {
        if (this.lab === null) return;
        this.show(await this.lab.step());
    }

    private showVisualDiagnostics(frame: LabFrame): void {
        this.element('[data-render-clock]').textContent =
            `${this.output.width} × ${this.output.height} · shared 60 Hz clock · cap ${this.output.fpsCap} FPS · frame ${frame.frame} · time ${frame.time.toFixed(6)} s · dt ${(1 / 60).toFixed(6)} s · PCM epoch ${frame.a.snapshot.instant.sourceEpoch}`;
        const texture = this.element<HTMLSelectElement>('[data-plot]').value === 'trail' ? 'trail' : 'spectrum';
        const width = texture === 'trail' ? 400 : 1024;
        const ramp = this.debugMode() === 'spectrum' || this.debugMode() === 'trail';
        const packed = ramp
            ? diagnosticRamp(width)
            : texture === 'trail'
              ? frame.a.snapshot.levelTrail
              : frame.a.snapshot.spectrum;
        this.element('[data-texture-samples]').textContent = JSON.stringify(
            {
                texture,
                format: 'RGBA32F',
                sampling: 'LINEAR / REPEAT',
                provider: ramp ? 'fixed diagnostic ramp' : 'SSF Original',
                samples: [0, 0.5 / width, 0.5, 1 - 0.5 / width, 1].map(x => ({ x, rgba: sampleSsf1D(packed, x) })),
                coordinateContract:
                    '_xy=gl_FragCoord.xy; _uv=_xy/RENDERSIZE; _uvc=_xy/RENDERSIZE.y-vec2(RENDERSIZE.x/RENDERSIZE.y/2,0.5)',
            },
            null,
            2
        );
    }

    private show(frame: LabFrame): void {
        this.showVisualDiagnostics(frame);
        this.latest = frame;
        this.element('[data-status]').textContent =
            `Frame ${frame.frame} · ${frame.time.toFixed(3)} s · Sample ${frame.a.snapshot.instant.sampleIndex} · Epoch ${frame.a.snapshot.instant.sourceEpoch} · ${frame.validity.join(' · ')}`;
        this.element<HTMLInputElement>('[data-seek]').value = String(frame.frame);
        for (const [key, lane] of [
            ['a', frame.a],
            ['b', frame.b],
        ] as const) {
            this.element(`[data-${key}-info]`).textContent =
                `Analyse ${lane.analysisMs.toFixed(2)} ms · Script ${lane.scriptMs.toFixed(2)} ms · BPM ${Number(lane.snapshot.signals.get('syn_BPM')?.value).toFixed(2)} · ${String(lane.snapshot.diagnostics.enhancedTempo ?? 'Original')}`;
        }
        for (const output of this.root.querySelectorAll<HTMLOutputElement>('[data-control]')) {
            const name = output.dataset.control ?? '';
            output.textContent = `A ${JSON.stringify(frame.a.controls[name])} · B ${JSON.stringify(frame.b.controls[name])}`;
        }
        const table = this.element('[data-signals]');
        table.replaceChildren();
        for (const [name, signal] of frame.a.snapshot.signals) {
            const other = frame.b.snapshot.signals.get(name);
            const row = document.createElement('tr');
            const format = (value: number | Float32Array | undefined): string =>
                typeof value === 'number'
                    ? value.toFixed(6)
                    : value === undefined
                      ? 'missing'
                      : `${value.length} floats`;
            const delta =
                typeof signal.value === 'number' && typeof other?.value === 'number'
                    ? String(other.value - signal.value)
                    : 'array';
            for (const text of [
                name,
                format(signal.value),
                format(other?.value),
                delta,
                `${other?.origin ?? 'missing'} ${other?.note ?? ''}`,
            ]) {
                const cell = document.createElement('td');
                cell.textContent = text;
                row.append(cell);
            }
            table.append(row);
        }
        this.element('[data-diff]').textContent = JSON.stringify(frame.comparison);
        this.updateBeatDisplay();
        this.updateCaptureLabel();
        this.plot(frame);
    }

    private updateCaptureLabel(): void {
        const instant = this.captureInstant;
        const latest = this.latest;
        const stale =
            instant !== null &&
            latest !== null &&
            (instant.frame !== latest.frame || instant.epoch !== latest.a.snapshot.instant.sourceEpoch);
        this.element('[data-capture-info]').textContent =
            instant === null
                ? 'Noch keine Passaufnahme'
                : `Passaufnahme: Frame ${instant.frame} · Epoch ${instant.epoch}${stale ? ' · historisch, erneut erfassen für aktuellen Frame' : ''}`;
    }

    private updateBeatDisplay(): void {
        this.element('[data-beats]').textContent =
            `ExoJS musikalisches Beat Grid: ${this.events.length} Events · Onset ${this.detector?.onsetStrength.toFixed(3) ?? 'nicht verfügbar'} · Phase confidence ${this.detector?.phaseConfidence.toFixed(3) ?? 'nicht verfügbar'} · ${this.annotations === null ? 'MUSICAL_ACCURACY: UNKNOWN' : `Annotation ${this.annotations.annotationId}: ${JSON.stringify(this.musicalMetrics())}`}`;
    }

    private plot(frame: LabFrame): void {
        const canvas = this.element<HTMLCanvasElement>('[data-graph]');
        const context = canvas.getContext('2d');
        if (context === null) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const trail = this.element<HTMLSelectElement>('[data-plot]').value === 'trail';
        for (const [laneIndex, lane] of [frame.a, frame.b].entries()) {
            const ramp = this.debugMode() === 'spectrum' || this.debugMode() === 'trail';
            const data = ramp
                ? diagnosticRamp(trail ? 400 : 1024)
                : trail
                  ? lane.snapshot.levelTrail
                  : lane.snapshot.spectrum;
            const width = data.length / 4;
            for (let channel = 0; channel < 4; channel++) {
                context.strokeStyle = ['#84cfff', '#ffb562', '#a2e88a', '#d0a3ff'][channel];
                context.setLineDash(laneIndex === 0 ? [] : [3, 3]);
                context.beginPath();
                for (let i = 0; i < width; i++) {
                    const x = (i / (width - 1)) * canvas.width;
                    const y = canvas.height - (Math.min(2, Math.max(0, data[i * 4 + channel])) / 2) * canvas.height;
                    if (i === 0) context.moveTo(x, y);
                    else context.lineTo(x, y);
                }
                context.stroke();
            }
        }
    }

    private pause(): void {
        if (this.playing)
            this.playEnd = Math.min(this.pcm.length / 44100, getAudioContext().currentTime - this.playbackOrigin);
        this.playing = false;
        this.audioSource?.stop();
        this.audioSource?.disconnect();
        this.audioSource = null;
        this.detector?.destroy();
        this.detector = null;
        this.element('[data-play]').textContent = 'Play';
    }

    private async togglePlayback(): Promise<void> {
        if (this.playing) {
            this.pause();
            return;
        }
        const context = getAudioContext();
        await context.resume();
        const buffer = context.createBuffer(1, this.pcm.length, 44100);
        buffer.copyToChannel(this.pcm, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const offset = Math.min(this.latest?.time ?? 0, this.pcm.length / 44100);
        this.playbackOrigin = context.currentTime - offset;
        this.playStart = this.playEnd = offset;
        this.events.length = 0;
        if (this.element<HTMLSelectElement>('[data-profile]').value === 'enhanced') {
            this.detector = new BeatDetector({
                minBpm: Number(this.element<HTMLInputElement>('[data-min-bpm]').value),
                maxBpm: Number(this.element<HTMLInputElement>('[data-max-bpm]').value),
                source,
            });
            this.detector.onBeat.add(beat =>
                this.events.push({
                    time: beat.audioTime - this.playbackOrigin,
                    bpm: beat.tempo,
                    confidence: beat.confidence,
                    status: beat.status,
                })
            );
        }
        this.audioSource = source;
        source.start(0, offset);
        this.playing = true;
        this.element('[data-play]').textContent = 'Pause';
        source.onended = (): void => {
            if (this.audioSource === source) this.pause();
        };
        const tick = async (): Promise<void> => {
            if (!this.playing || this.audioSource !== source) return;
            await this.guard(async () => {
                if (this.playing && this.audioSource === source) await this.step();
            });
            if (!this.playing || this.audioSource !== source) return;
            this.playbackDriftSeconds = context.currentTime - this.playbackOrigin - (this.latest?.time ?? 0);
            if (this.playbackDriftSeconds > 0.25) {
                this.pause();
                this.element('[data-warning]').textContent =
                    `Playback stopped: render clock is ${this.playbackDriftSeconds.toFixed(3)} s behind audio. Use deterministic frame stepping for parity.`;
                return;
            }
            const delay = Math.max(
                0,
                ((this.latest?.time ?? 0) + 1 / 60 - (context.currentTime - this.playbackOrigin)) * 1000
            );
            setTimeout(() => {
                void tick();
            }, delay);
        };
        void tick();
    }

    private async importScene(): Promise<void> {
        const files = this.element<HTMLInputElement>('[data-scene]').files;
        if (files === null || files.length === 0) return;
        const entries = new Map<string, Uint8Array>();
        let slug = 'scene';
        for (const file of files) {
            const parts = (file.webkitRelativePath || file.name).split('/');
            slug = parts[0].replace(/\.synScene$/i, '');
            const path = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
            entries.set(path, new Uint8Array(await file.arrayBuffer()));
        }
        this.scene = readSsfDirectory(entries, slug);
        this.element<HTMLSelectElement>('[data-profile]').value =
            localStorage.getItem(`blink.ssf.analysis.${slug}`) ?? 'original';
        await this.rebuild();
    }

    private async importAudio(): Promise<void> {
        const file = this.element<HTMLInputElement>('[data-audio]').files?.[0];
        if (file === undefined) return;
        const context = new OfflineAudioContext(1, 1, 44100);
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        this.pcm = new Float32Array(buffer.length);
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < data.length; i++) this.pcm[i] += data[i] / buffer.numberOfChannels;
        }
        await this.rebuild();
    }

    private async capture(): Promise<void> {
        if (this.surfaces === null) return;
        const [a, b] = await Promise.all(this.surfaces.map(surface => surface.capturePasses()));
        this.captureInstant =
            this.latest === null
                ? null
                : { frame: this.latest.frame, epoch: this.latest.a.snapshot.instant.sourceEpoch };
        this.passPixels = [a, b];
        this.updateCaptureLabel();
        const select = this.element<HTMLSelectElement>('[data-pass-select]');
        select.replaceChildren(
            ...a.map((pass, index) => {
                const option = document.createElement('option');
                option.value = String(index);
                option.textContent = pass.name;
                return option;
            })
        );
        this.drawPass();
        const hash = async (data: Float32Array): Promise<string> =>
            [...new Uint8Array(await crypto.subtle.digest('SHA-256', data as Float32Array<ArrayBuffer>))]
                .map(value => value.toString(16).padStart(2, '0'))
                .join('');
        const rows = await Promise.all(
            a.map(async (pass, index) => ({
                name: pass.name,
                format: pass.format,
                width: pass.width,
                height: pass.height,
                hashA: await hash(pass.data),
                hashB: b[index] === undefined ? null : await hash(b[index].data),
                diff: b[index] === undefined ? 'missing pass' : compareArrays(pass.data, b[index].data),
            }))
        );
        this.captureRows = rows;
        this.captureUniforms = this.surfaces.map(surface => surface.inspectUniforms());
        const thumbnails = this.element('[data-pass-thumbnails]');
        thumbnails.replaceChildren();
        for (const pass of a) {
            const thumbnail = document.createElement('canvas');
            thumbnail.width = 160;
            thumbnail.height = Math.max(1, Math.round((160 * pass.height) / pass.width));
            thumbnail.title = `${pass.name}: ${pass.width} × ${pass.height}, ${pass.format}, lane A raw attachment`;
            const context = context2d(thumbnail);
            const image = context.createImageData(thumbnail.width, thumbnail.height);
            for (let y = 0; y < thumbnail.height; y++)
                for (let x = 0; x < thumbnail.width; x++) {
                    const source =
                        (Math.floor((y / thumbnail.height) * pass.height) * pass.width +
                            Math.floor((x / thumbnail.width) * pass.width)) *
                        4;
                    const target = (y * thumbnail.width + x) * 4;
                    for (let channel = 0; channel < 3; channel++)
                        image.data[target + channel] =
                            Math.max(
                                0,
                                Math.min(1, pass.data[source + channel] / (pass.format === 'rgba8' ? 255 : 1))
                            ) * 255;
                    image.data[target + 3] = 255;
                }
            context.putImageData(image, 0, 0);
            thumbnails.append(thumbnail);
        }
        this.element('[data-passes]').textContent = JSON.stringify(
            { passes: rows, uniforms: this.captureUniforms },
            null,
            2
        );
    }

    private musicalMetrics(): object {
        if (this.annotations === null) return { verdict: 'UNKNOWN', reason: 'no independent annotations' };
        const end = this.playing
            ? Math.min(this.pcm.length / 44100, getAudioContext().currentTime - this.playbackOrigin)
            : this.playEnd;
        const beats = this.annotations.beats.filter(time => time >= this.playStart && time <= end);
        const events = this.events.filter(event => event.time >= this.playStart && event.time <= end);
        const tempo = this.annotations.tempoBpm;
        const errors = tempo === undefined ? [] : events.map(event => Math.abs(event.bpm / tempo - 1));
        const octaveErrors =
            tempo === undefined
                ? []
                : events.map(event =>
                      Math.min(...[0.5, 1, 2].map(factor => Math.abs(event.bpm / (tempo * factor) - 1)))
                  );
        return {
            verdict: events.length === 0 ? 'UNKNOWN' : 'MEASURED_SEGMENT',
            annotationId: this.annotations.annotationId,
            pulseConvention: this.annotations.pulseConvention,
            interval: [this.playStart, end],
            beat: compareBeatEvents(
                events.map(event => event.time),
                beats
            ),
            exactTempoRelativeError:
                errors.length === 0 ? null : errors.reduce((sum, error) => sum + error, 0) / errors.length,
            octaveTolerantRelativeError:
                octaveErrors.length === 0
                    ? null
                    : octaveErrors.reduce((sum, error) => sum + error, 0) / octaveErrors.length,
            onsetAccuracy: 'UNKNOWN: published onset envelope has no timestamped onset-event API',
            defaultPromotion: 'REJECTED: no multi-track quality and worklet CPU evidence',
        };
    }

    private drawPass(): void {
        const index = Number(this.element<HTMLSelectElement>('[data-pass-select]').value);
        const a = this.passPixels[0]?.[index];
        const b = this.passPixels[1]?.[index];
        if (a === undefined || b === undefined || a.width !== b.width || a.height !== b.height) return;
        const canvas = this.element<HTMLCanvasElement>('[data-pass-canvas]');
        canvas.width = a.width;
        canvas.height = a.height;
        const context = canvas.getContext('2d');
        if (context === null) return;
        const image = context.createImageData(a.width, a.height);
        const mode = this.element<HTMLSelectElement>('[data-pass-view]').value;
        const wipe = Number(this.element<HTMLInputElement>('[data-wipe]').value);
        for (let y = 0; y < a.height; y++)
            for (let x = 0; x < a.width; x++) {
                const source = (y * a.width + x) * 4;
                const target = source;
                for (let channel = 0; channel < 3; channel++) {
                    const av = a.data[source + channel] / (a.format === 'rgba8' ? 255 : 1);
                    const bv = b.data[source + channel] / (b.format === 'rgba8' ? 255 : 1);
                    const value =
                        mode === 'diff'
                            ? Math.abs(av - bv) * 10
                            : mode === 'a' || (mode === 'wipe' && x / a.width < wipe)
                              ? av
                              : bv;
                    image.data[target + channel] = Math.max(0, Math.min(1, value)) * 255;
                }
                image.data[target + 3] = 255;
            }
        context.putImageData(image, 0, 0);
    }

    private report(): object {
        return {
            ...this.lab?.report(),
            sceneSha256: this.sceneHash,
            pcmSha256: this.sourceHash,
            exoVersion: '0.19.1',
            browser: navigator.userAgent,
            backend: 'webgl2',
            renderSize: [this.output.width, this.output.height],
            output: this.output,
            pixelComparison: this.pixelComparison,
            visualDebug: this.debugMode(),
            captureInstant: this.captureInstant,
            passes: this.captureRows,
            captureUniforms: this.captureUniforms,
            liveUniforms: this.surfaces?.map(surface => surface.inspectUniforms()),
            playbackDriftSeconds: this.playbackDriftSeconds,
            frozenSynesthesiaVersion: '1.25.2.185',
            comparisonSynesthesiaVersion: '1.25.4.189 (user reported)',
            renderPerformance: this.surfaces?.map(surface => surface.inspectPerformance()),
            cpu: {
                hardwareConcurrency: navigator.hardwareConcurrency,
                frame:
                    this.latest === null
                        ? null
                        : {
                              analysisA: this.latest.a.analysisMs,
                              analysisB: this.latest.b.analysisMs,
                              scriptA: this.latest.a.scriptMs,
                              scriptB: this.latest.b.scriptMs,
                          },
            },
            gpu: gpuMetadata(this.element<HTMLCanvasElement>('[data-a]')),
            beatEvents: this.events,
            annotations: this.annotations,
            musicalMetrics: this.musicalMetrics(),
            limitations: [
                'portable JS VM',
                'Duktape language parity unverified',
                'safe feedback adaptation',
                'ExoJS color/alpha pipeline',
                'v0.20 unavailable',
                'musical ground truth absent',
            ],
        };
    }

    private exportCsv(): void {
        const frame = this.latest;
        if (frame === null) return;
        const rows = ['name,a,b,origin'];
        for (const [name, signal] of frame.a.snapshot.signals) {
            const other = frame.b.snapshot.signals.get(name);
            if (typeof signal.value === 'number' && typeof other?.value === 'number')
                rows.push(`${name},${signal.value},${other.value},${other.origin}`);
        }
        download('blink-ssf-lab.csv', `${rows.join('\n')}\n`, 'text/csv');
    }
}
