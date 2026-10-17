import type { UniformValue } from '@codexo/exojs';

import { loadBlinkPreset } from '../packages/blinkfx/presets';
import { createBlinkAudioDebugBridge } from '../runtime/audio/BlinkAudioDebugBridge';
import type { BlinkEffectIR } from '../runtime/ir/types';
import { fetchPackageFile } from '../runtime/package';
import type { OutputSettings } from '../runtime/render/outputSettings';
import type { BlinkFxPackageList, BlinkFxPackageListItem, BlinkFxService } from '../services/BlinkFxService';
import type { EnvService } from '../services/EnvService';
import type { RenderService } from '../services/RenderService';
import type { ShellDiagnosticsEvent, ShellHost, ShellRuntimeState, Unsubscribe } from '../ui/shell/ShellHost';
import { rememberEffect } from '../ui/startSelection';
import { Statistics } from './Statistics';

// A diagnostics snapshot per rendered frame would make the panel that observes the effect a cost
// to the effect. The runtime owns the rate because it owns the frame loop; a subscriber that
// wants less unsubscribes.
const DIAGNOSTICS_HZ = 10;
const DIAGNOSTICS_INTERVAL_MS = 1000 / DIAGNOSTICS_HZ;

function describeError(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

function settled(): void {
    // The switch chain advances on rejection exactly as it does on success.
}

export class Application implements ShellHost {
    private readonly envService: EnvService;
    private readonly renderService: RenderService;
    private readonly blinkFxService: BlinkFxService;
    private readonly statistics: Statistics | null = null;
    private readonly stateListeners = new Set<(state: ShellRuntimeState) => void>();
    private readonly diagnosticsListeners = new Set<(event: ShellDiagnosticsEvent) => void>();
    private diagnosticsPumpRunning = false;
    // Serializes overlapping switches so the last one issued is the last one committed. Without
    // it two switches race through their awaits independently and whichever finishes last wins
    // the active id and the state push, which need not be the one the user asked for last.
    private switchChain: Promise<void> = Promise.resolve();
    private lastDiagnosticsPushMs = 0;
    private activePackageId: string | null = null;
    private activeEffect: BlinkEffectIR | null = null;

    public constructor(envService: EnvService, renderService: RenderService, blinkFxService: BlinkFxService) {
        this.envService = envService;
        this.renderService = renderService;
        this.blinkFxService = blinkFxService;
        this.renderService.onHealthChange.add(this.handleHealthChange);

        if (this.envService.isDevelopmentBuild) {
            this.statistics = new Statistics(this.renderService);
            this.wireAudioDebugBridge();
        }
    }

    private wireAudioDebugBridge(): void {
        const bridge = createBlinkAudioDebugBridge(
            this.renderService.audioTextureRuntime,
            () => this.renderService.currentFrameIndex,
            () => this.renderService.currentAnalyserDb,
            () => this.renderService.getAnalyserMetadata()
        );
        (window as unknown as Record<string, unknown>).blinkAudioDebug = bridge;
        (window as unknown as Record<string, unknown>).blinkAudioOutput = {
            stats: () => this.renderService.audioOutputStats(),
        };
    }

    public async init(packageId: string): Promise<void> {
        // BlinkPassRuntime.execute() no-ops until a pass runtime is built, so starting the
        // render loop before the effect has loaded is safe: it paints nothing until
        // loadEffect() below finishes, instead of requiring the load to happen first.
        await this.renderService.start();
        await this.loadEffect(packageId);
    }

    public stop(): void {
        this.renderService.stop();
    }

    /**
     * Tears the application down for good: the render service and everything it owns, plus the
     * development-only audio debug bridge, whose window global would otherwise keep the audio
     * texture runtime - and through it a destroyed backend's textures - reachable forever.
     *
     * Use instead of `stop()` whenever the instance will not be started again; `stop()` only
     * halts the frame loop. The audio source handed to the render service stays the caller's to
     * release: acquiring it is what returns the handle that stops it.
     */
    public async destroy(): Promise<void> {
        // The statistics overlay holds subscriptions on the render service and on the ExoJS
        // application behind it, so it has to come off before either is torn down. The debug
        // bridge is released in a finally: a throwing teardown must not leave a window global
        // holding a half-destroyed runtime.
        try {
            this.renderService.onHealthChange.remove(this.handleHealthChange);
            this.stateListeners.clear();
            this.diagnosticsListeners.clear();
            if (this.diagnosticsPumpRunning) {
                this.renderService.onUpdate.remove(this.handleDiagnosticsFrame);
                this.diagnosticsPumpRunning = false;
            }
            this.statistics?.destroy();
            await this.renderService.destroy();
        } finally {
            if (this.activePackageId !== null) this.blinkFxService.releasePackage(this.activePackageId);
            this.activePackageId = null;
            this.activeEffect = null;
            if (this.envService.isDevelopmentBuild) {
                delete (window as unknown as Record<string, unknown>).blinkAudioDebug;
                delete (window as unknown as Record<string, unknown>).blinkAudioOutput;
            }
        }
    }

    public async listEffects(): Promise<BlinkFxPackageList> {
        return this.blinkFxService.getPackageList();
    }

    public reloadEffects(): Promise<BlinkFxPackageList> {
        return this.blinkFxService.reloadPackageList();
    }

    public installPackage(archive: Uint8Array): Promise<BlinkFxPackageListItem> {
        return this.blinkFxService.installPackage(archive, this.activePackageId ?? undefined);
    }

    public async removePackage(id: string): Promise<void> {
        // Queued behind any switch in flight: a switch to this package has not committed its id yet,
        // and removing it meanwhile would unmount files the switch is still loading.
        const run = this.switchChain.then(
            () => this.removeUnlessRunning(id),
            () => this.removeUnlessRunning(id)
        );
        this.switchChain = run.then(settled, settled);
        await run;
    }

    private async removeUnlessRunning(id: string): Promise<void> {
        // The running effect's files are served from the package being removed.
        if (id === this.activePackageId) {
            throw new Error('The running effect cannot be removed; switch to another one first');
        }
        await this.blinkFxService.removePackage(id);
    }

    /**
     * Runs through the exact load path `init` uses (`loadEffect`, below) so a switch cannot
     * diverge into a second, separately-maintained way of building an effect. A failed switch
     * leaves the previously running effect, its controls and its assets all untouched, exactly
     * as `RenderService.updateBlinkFxShader` already guarantees: it commits the new effect
     * (including the control defaults `controls()` reads) only after every throwing step of the
     * build has succeeded.
     */
    public async switchEffect(packageId: string): Promise<void> {
        // Both continuations run the load: a rejected predecessor must not poison the chain.
        const run = this.switchChain.then(
            () => this.loadEffect(packageId),
            () => this.loadEffect(packageId)
        );
        // Swallowed on the chain only: the caller still sees the rejection through `run`.
        this.switchChain = run.then(settled, settled);
        await run;
    }

    public subscribeState(listener: (state: ShellRuntimeState) => void): Unsubscribe {
        // Wrapped so the same function reference can be subscribed more than once: a Set would
        // collapse the two registrations into one entry that either Unsubscribe then removes.
        const entry = (state: ShellRuntimeState): void => listener(state);
        this.stateListeners.add(entry);
        this.dispatch(listener, this.currentState(), 'state');
        return () => {
            this.stateListeners.delete(entry);
        };
    }

    /**
     * The pump runs only while someone is listening, so a shell with every panel collapsed adds
     * nothing to the frame loop.
     */
    public subscribeDiagnostics(listener: (event: ShellDiagnosticsEvent) => void): Unsubscribe {
        const entry = (event: ShellDiagnosticsEvent): void => listener(event);
        this.diagnosticsListeners.add(entry);
        if (!this.diagnosticsPumpRunning) {
            this.renderService.onUpdate.add(this.handleDiagnosticsFrame);
            this.diagnosticsPumpRunning = true;
            // GPU timing costs query objects and a timestamp pair per pass; it runs only while shown.
            this.renderService.setProfilingEnabled(true);
            // Only the first subscriber's welcome push counts against the rate limit, or the
            // next frame would push again immediately. A later subscriber gets its welcome push
            // without shifting the cadence everyone else is already on.
            this.lastDiagnosticsPushMs = Date.now();
        }
        this.dispatch(listener, this.currentDiagnostics(), 'diagnostics');

        return () => {
            this.diagnosticsListeners.delete(entry);
            if (this.diagnosticsListeners.size === 0 && this.diagnosticsPumpRunning) {
                this.renderService.onUpdate.remove(this.handleDiagnosticsFrame);
                this.diagnosticsPumpRunning = false;
                this.renderService.setProfilingEnabled(false);
            }
        };
    }

    private currentState(): ShellRuntimeState {
        return {
            activeEffectId: this.activePackageId,
            controls: this.renderService.controlSpecs,
            presets: this.activeEffect?.presets ?? [],
            // Copied: the render service hands out its live map, which a package script rewrites
            // every frame. A state push must carry what was true when it was pushed.
            controlValues: { ...this.renderService.controlValues },
            ...(this.activeEffect?.compatibility?.controls === undefined
                ? {}
                : { controlSources: this.activeEffect.compatibility.controls }),
            compatibility: this.renderService.compatibilityReport(),
            faults: this.renderService.faults(),
        };
    }

    private currentDiagnostics(): ShellDiagnosticsEvent {
        try {
            return { ok: true, snapshot: this.renderService.getDiagnosticsSnapshot() };
        } catch (error) {
            return { ok: false, message: describeError(error, 'Diagnose konnte nicht gelesen werden.') };
        }
    }

    private emitState(): void {
        const state = this.currentState();
        // Copied before iterating: a listener is free to unsubscribe from inside its own call.
        for (const listener of [...this.stateListeners]) {
            this.dispatch(listener, state, 'state');
        }
    }

    /**
     * One failing subscriber must not decide what the others see. Isolating here rather than in
     * each panel also protects the callers of the dispatch: a throw out of `emitState` would
     * reject a `switchEffect` whose effect is already running, and a throw out of the diagnostics
     * pump would abort the frame signal for every other handler on it.
     */
    private dispatch<T>(listener: (value: T) => void, value: T, channel: string): void {
        try {
            listener(value);
        } catch (error) {
            console.error(`[blink] a ${channel} subscriber threw`, error);
        }
    }

    private readonly handleHealthChange = (): void => {
        this.emitState();
    };

    private readonly handleDiagnosticsFrame = (): void => {
        const now = Date.now();
        if (now - this.lastDiagnosticsPushMs < DIAGNOSTICS_INTERVAL_MS) {
            return;
        }
        this.lastDiagnosticsPushMs = now;

        const event = this.currentDiagnostics();
        for (const listener of [...this.diagnosticsListeners]) {
            this.dispatch(listener, event, 'diagnostics');
        }
    };

    public getOutputSettings(): OutputSettings {
        return this.renderService.outputSettings;
    }
    public setOutputSettings(settings: OutputSettings): void {
        this.renderService.setOutputSettings(settings);
    }

    public setControl(name: string, value: UniformValue): void {
        this.renderService.setControlValue(name, value);
    }

    /**
     * Loads the named preset and applies every value in it.
     *
     * Validation happens against the running effect's declared controls before anything is
     * written, so a preset that names a control the effect does not have changes nothing.
     */
    public async applyPreset(name: string): Promise<void> {
        const effect = this.activeEffect;
        const ref = effect?.presets.find(p => p.name === name);
        if (effect === null || effect === undefined || ref === undefined) {
            throw new Error(`Unknown preset "${name}"`);
        }

        const preset = await loadBlinkPreset(ref, effect.controls, path => fetchPackageFile(path));

        // The fetch above is long enough for an effect switch to land. Writing then would put one
        // effect's values into another's controls, silently succeeding wherever a control name
        // happens to be shared.
        if (this.activeEffect !== effect) {
            throw new Error(`Preset "${name}" was discarded: the effect changed while it loaded`);
        }

        this.renderService.applyControlValues(preset.values);
        this.emitState();
    }

    public fireBang(name: string): void {
        this.renderService.fireBangControl(name);
    }

    public resetControl(name: string): void {
        this.renderService.resetControlValue(name);
        this.emitState();
    }

    private async loadEffect(packageId: string): Promise<void> {
        const ir = await this.blinkFxService.loadPackage(packageId);
        try {
            await this.renderService.updateBlinkFxShader(ir);
        } catch (error) {
            if (packageId !== this.activePackageId) this.blinkFxService.releasePackage(packageId);
            throw error;
        }
        const previousId = this.activePackageId;
        this.activePackageId = packageId;
        this.activeEffect = ir;
        rememberEffect(packageId);
        // Only now that the new effect is committed: until then the old one still loads from its mount.
        if (previousId !== null && previousId !== packageId) {
            this.blinkFxService.releasePackage(previousId);
        }
        this.emitState();
    }
}
