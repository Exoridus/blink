import type { BlinkAudioFrame } from '../audio/BlinkAudioFrame';

/**
 * Value shape for a script-visible control.
 *
 * Mirrors the primitive representation the render path already stores control
 * values as (bool as 0/1, enum as its option index, color/point2d as a packed
 * array) so an adapter over the real control store needs no translation
 * layer. This module never imports that store directly.
 */
export type BlinkScriptControlValue = number | Float32Array | Int32Array;

/**
 * Control surface a `blink/1` script reads and writes through.
 *
 * Injected by the caller rather than imported, so this module has no
 * dependency on the render path and can be exercised with a plain object in
 * tests. `get` throws for a name the caller does not recognize, matching the
 * render-side control store's own unknown-name behavior.
 */
export interface ScriptControlSurface {
    get(name: string): BlinkScriptControlValue;
    set(name: string, value: BlinkScriptControlValue): void;
}

/** Per-frame time, scoped down from the host clock to what a script needs. */
export interface ScriptTimeSnapshot {
    readonly elapsed: number;
    readonly delta: number;
    readonly frame: number;
}

/**
 * Context passed to every `blink/1` module hook.
 *
 * Deliberately excludes ExoJS, the Application, the DOM and the network - a
 * script sees only controls, time and audio (format spec section 16.1).
 */
export interface BlinkScriptContext {
    readonly controls: ScriptControlSurface;
    readonly time: ScriptTimeSnapshot;
    readonly audio: BlinkAudioFrame;
}

export type BlinkScriptEventHandler = (
    ctx: BlinkScriptContext,
    value: BlinkScriptControlValue,
    previousValue: BlinkScriptControlValue
) => void | Promise<void>;

/**
 * `blink/1` native script module surface (format spec section 16.1).
 *
 * `setup`/`update`/`dispose` are the lifecycle hooks; a manifest event
 * binding's `handler` names an additional exported function on this same
 * object, called with the same context plus the current and previous value
 * of the bound control.
 */
export interface BlinkScriptModule {
    setup?(ctx: BlinkScriptContext): void | Promise<void>;
    update?(ctx: BlinkScriptContext, dt: number): void | Promise<void>;
    dispose?(ctx: BlinkScriptContext): void | Promise<void>;
    readonly [exportName: string]: unknown;
}

/**
 * Produces a script module instance for one runtime lifetime.
 *
 * Takes the place of fetching and evaluating source text: this module never
 * fetches package files and never runs `eval`/`new Function` on untrusted
 * content, so the caller is responsible for turning a package's script entry
 * into a module object (for example via a bundler-emitted dynamic `import()`)
 * before handing it to the runtime.
 */
export type BlinkScriptModuleFactory = () => BlinkScriptModule | Promise<BlinkScriptModule>;

/** What `ScriptRuntime.init` needs from the host to run a script. */
export interface ScriptInitContext {
    readonly controls: ScriptControlSurface;
    readonly audio: BlinkAudioFrame;
}

/** Per-frame data `ScriptRuntime.runFrame` needs from the host. */
export interface ScriptFrameInput {
    /** Optional frame-specific input surface; mutations retain the supplied surface's semantics. */
    readonly controls?: ScriptControlSurface;
    readonly dt: number;
    readonly elapsed: number;
    readonly frame: number;
    readonly audio: BlinkAudioFrame;
}

/**
 * Outcome of one `runFrame` call.
 *
 * Never rejects on a script-content failure: `ok: false` reports it so the
 * host can log or surface it without a throwing script wedging the frame
 * loop. A rejected promise from `runFrame` means a host-side misuse (calling
 * it before `init` resolved), not a script error.
 */
export interface ScriptFrameResult {
    readonly ok: boolean;
    readonly error: unknown;
}

/**
 * Host-facing script execution abstraction (integration architecture doc,
 * section 10). The manifest's `abi` field selects the implementation; this
 * package provides the one for `blink/1`.
 */
export interface ScriptRuntime {
    init(context: ScriptInitContext): Promise<void>;
    runFrame(frame: ScriptFrameInput): Promise<ScriptFrameResult>;
    dispose(): Promise<void>;
}
