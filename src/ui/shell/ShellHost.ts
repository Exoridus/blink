import type { UniformValue } from '@codexo/exojs';

import type { AnalysisMode } from '../../runtime/compat/analysisMode';
import type { CompatibilityReport } from '../../runtime/diagnostics/CompatibilityReport';
import type { FaultRecord } from '../../runtime/health';
import type { BlinkControlSpec, BlinkPresetRef } from '../../runtime/ir/types';
import type { BlinkDiagnosticsSnapshot } from '../../runtime/render/diagnosticsSnapshot';
import type { OutputSettings } from '../../runtime/render/outputSettings';
import type { BlinkFxPackageList, BlinkFxPackageListItem } from '../../services/BlinkFxService';

/**
 * Cancels a subscription. Calling it more than once is a no-op, and it cancels only the
 * subscription it came from - the same listener may be subscribed more than once.
 */
export type Unsubscribe = () => void;

/** Everything the panels render that the runtime owns and can change without them asking. */
export interface ShellRuntimeState {
    readonly activeEffectId: string | null;
    readonly controls: readonly BlinkControlSpec[];
    /** Presets the running effect ships, in manifest order. Empty for an effect that ships none. */
    readonly presets: readonly BlinkPresetRef[];
    /** Source presentation families retained by conversion, keyed by control name. */
    readonly controlSources?: Readonly<Record<string, object>>;
    /**
     * Control values as of this push - a snapshot, not a live view.
     *
     * Pushed when the runtime changes them behind the panels' backs: an effect switch, or a
     * preset being applied. Not pushed per frame: a package script writes controls every frame,
     * and a panel that re-rendered at that rate would fight the user's own input.
     */
    readonly controlValues: Readonly<Record<string, UniformValue>>;
    /** Provenance and fidelity of the running effect; null while none is loaded, absent for a host that does not report it. */
    readonly compatibility?: CompatibilityReport | null;
    /**
     * Parts of the running effect that failed, such as its script or its render passes; empty while
     * everything works, absent for a host that does not report it. A part that is switched off stays
     * off until another effect is loaded.
     */
    readonly faults?: readonly FaultRecord[];
    /** Image inputs the running effect declares and the media source feeding them; absent for a host without media. */
    readonly media?: {
        readonly inputs: readonly string[];
        readonly kind: 'none' | 'camera' | 'file';
        readonly label: string;
    };
    /** Audio analysis mode and whether the running effect follows it; absent for a host without the switch. */
    readonly analysis?: {
        readonly mode: AnalysisMode;
        readonly applicable: boolean;
    };
}

/**
 * One diagnostics push. Failure is part of the event rather than an exception because the push
 * crosses the same seam a remote control surface would: a producer-side error has to arrive as
 * data the panel can render, not as a throw in a listener.
 */
export type ShellDiagnosticsEvent =
    | { readonly ok: true; readonly snapshot: BlinkDiagnosticsSnapshot }
    | { readonly ok: false; readonly message: string };

/**
 * The only surface a shell panel sees. Free of DOM types and of the concrete runtime classes
 * (RenderService, Application, BlinkFxService), and free of synchronous reads: every value a
 * panel renders either arrives pushed or is awaited. That is what makes the control surface
 * movable - across a window, a worker or a network link, `controls()` and `diagnostics()` could
 * not have answered in the caller's tick.
 */
export interface ShellHost {
    getOutputSettings?(): OutputSettings;
    setOutputSettings?(settings: OutputSettings): void;
    /** Returns the available bundled, imported and installed effects. */
    listEffects(): Promise<BlinkFxPackageList>;

    /** Refreshes the catalogs and returns the available effects without switching the running effect. */
    reloadEffects?(): Promise<BlinkFxPackageList>;

    /**
     * Validates an archive and installs it, so it is listed and survives a reload. Rejects with a
     * message saying why when the archive is not a valid package; nothing is installed then.
     */
    installPackage(archive: Uint8Array): Promise<BlinkFxPackageListItem>;

    /** Removes an installed package. Rejects for a bundled effect and for the one that is running. */
    removePackage(id: string): Promise<void>;

    /**
     * Subscribe to runtime state. The listener fires immediately with the current state, and
     * again whenever it changes - in particular after an effect switch, which replaces the whole
     * control set. A panel therefore never needs to be told that a switch happened.
     *
     * A listener that throws is isolated: the remaining subscribers still see the push, and the
     * error never reaches whoever caused the change.
     */
    subscribeState(listener: (state: ShellRuntimeState) => void): Unsubscribe;

    /**
     * Subscribe to diagnostics. The host decides the push rate; a panel that wants fewer updates
     * unsubscribes instead of throttling, and one that is not subscribed costs the runtime
     * nothing. The listener fires once immediately so a freshly opened panel is never blank.
     */
    subscribeDiagnostics(listener: (event: ShellDiagnosticsEvent) => void): Unsubscribe;

    /**
     * Loads another effect. Rejects with the load error and leaves the running effect, its
     * controls and its assets untouched; a successful switch pushes the new state to every
     * `subscribeState` listener before it resolves.
     */
    switchEffect(id: string): Promise<void>;

    setControl(name: string, value: UniformValue): void;
    /** Restores the raw default and resets source-control smoothing, speed and counter state. */
    resetControl?(name: string): void;

    /**
     * Apply one of the running effect's presets by name.
     *
     * Rejects if the preset cannot be loaded or names a control the effect does not declare, and
     * leaves every current control value untouched in that case. A successful application pushes
     * the new state, so a panel showing widget positions can move them to the applied values.
     */
    applyPreset(name: string): Promise<void>;

    /**
     * Fire a momentary `bang` control.
     *
     * Separate from `setControl` because a bang carries no durable value: spec section 6 gives it
     * no shader state unless a script converts it to one. Until the script runtime lands there is
     * no consumer, so an implementation may record the event and do nothing else.
     */
    fireBang(name: string): void;

    /** Switches the audio analysis of SSF-family effects. Rejects when the running effect cannot be rebuilt. */
    setAnalysisMode?(mode: AnalysisMode): Promise<void>;
    /** Feeds the camera to the running effect's image inputs. Rejects when access is denied. */
    useMediaCamera?(): Promise<void>;
    /** Feeds an image or video file to the running effect's image inputs. Rejects for an unreadable file. */
    useMediaFile?(file: File): Promise<void>;
    /** Stops the media source; image inputs fall back to nothing. */
    clearMedia?(): void;
}
