# Control surface contract

Blink's operator shell - the effect switcher, the control panel and the diagnostics panel - talks
to the runtime through one interface, `ShellHost` (`src/ui/shell/ShellHost.ts`). No panel imports
`Application`, `RenderService` or `BlinkFxService`, and no panel reads runtime state directly.

The original async contract below describes effect/control/diagnostic operations. The current output-settings extensions expose synchronous getters/setters; a remote adapter must map them to asynchronous commands/snapshots as specified in [control protocol v1](architecture/control-protocol.md).

## The rule

**Nothing in the contract answers synchronously.** Every value a panel renders either arrives
pushed or is awaited:

| Direction         | Member                           | Shape                                                      |
| ----------------- | -------------------------------- | ---------------------------------------------------------- |
| Read once         | `listEffects()`                  | `Promise<BlinkFxPackageList>`                              |
| Read continuously | `subscribeState(listener)`       | push, returns `Unsubscribe`                                |
| Read continuously | `subscribeDiagnostics(listener)` | push, returns `Unsubscribe`                                |
| Write             | `switchEffect(id)`               | `Promise<void>`, rejects with the load error               |
| Write             | `setControl(name, value)`        | fire-and-forget                                            |
| Write             | `fireBang(name)`                 | fire-and-forget                                            |
| Write             | `applyPreset(name)`              | `Promise<void>`, rejects with the load or validation error |

This is what keeps the surface movable. The panels are DOM over the effect canvas today, but the
same contract has to hold when the control surface runs in another window, in a worker, or on
another device: across any of those, a `controls()` or `diagnostics()` call could not return a
value in the caller's tick. A synchronous getter would compile today and have to be rewritten,
along with every panel built on it, the moment the surface moves.

The writes stay one-way on purpose. A control write carries no acknowledgement a panel waits for:
the runtime is the single source of truth for control values, and a rejected write (an unknown
control name) surfaces as a status line, not as a readback.

## What the host pushes

`ShellRuntimeState` is everything the runtime owns that a panel renders and the runtime can
change without a panel asking:

```ts
interface ShellRuntimeState {
    readonly activeEffectId: string | null;
    readonly controls: readonly BlinkControlSpec[];
    readonly presets: readonly BlinkPresetRef[];
    readonly controlValues: Readonly<Record<string, UniformValue>>;
    readonly compatibility?: CompatibilityReport | null;
    readonly faults?: readonly FaultRecord[];
}
```

`faults` lists the parts of the running effect that failed (see [runtime-health.md](runtime-health.md)).
The effect id, controls, presets and control values change together on an effect switch, which is why
they are one state rather than four subscriptions. `subscribeState` calls its listener immediately with the current state, so a panel
never renders an empty first frame while it waits for the first change, and `switchEffect`
resolves only after the new state has been pushed - a caller that awaits it can rely on every
panel already showing the new effect.

Diagnostics arrive as an event, not a snapshot, because failure has to cross the same seam:

```ts
type ShellDiagnosticsEvent =
    | { readonly ok: true; readonly snapshot: BlinkDiagnosticsSnapshot }
    | { readonly ok: false; readonly message: string };
```

A producer-side error is data the panel renders, never a throw the listener has to catch - over a
wire there would be no stack to propagate anyway.

Failure in the other direction is contained too: a listener that throws is isolated by the host,
so it cannot decide what the other subscribers see, cannot reject the `switchEffect()` of an
effect that is already running, and cannot abort the frame loop the diagnostics pump rides on.

## Presets

`applyPreset(name)` loads the named preset file and writes every value in it. Validation happens
against the running effect's declared controls first, so a preset naming a control the effect does
not have changes nothing at all rather than applying the half of itself that resolves.

A successful application pushes the new state, so a panel showing widget positions can move them
to the applied values.

`controlValues` is what makes that possible, and it is a snapshot taken at push time rather than a
live view. It is pushed only when the runtime changes values behind the panels' backs - an effect
switch, a preset being applied - and deliberately not per frame: a package script writes controls
on every frame, and a panel re-rendering at that rate would fight the user's own input. A panel is
therefore correct at the moment of a push and may drift from a script-driven value afterwards;
that is the intended trade, not an oversight.

The values use the render-side encoding, the same one the shader upload reads: a bool is 0 or 1,
an enum is its option index, a color or point2d is a packed array.

## Rate and cost

The host owns the diagnostics push rate (currently 10 Hz, driven off the frame loop). A panel
that wants fewer updates unsubscribes; it never throttles a stream it is already paying for. A
subscription that nobody holds costs the runtime nothing: the implementation attaches to the
frame loop on the first subscriber and detaches on the last, so a shell with every panel
collapsed adds no per-frame work.

Snapshots are built on demand inside the push, so an unsubscribed panel also costs no snapshot
assembly.

## Implementation notes

`Application` implements `ShellHost`. It pushes state at the end of a successful effect load,
holds its listener sets in `Set`s, and copies each set before iterating so a listener may
unsubscribe from inside its own call. Effect switches are serialized, so overlapping switches
commit in the order they were issued rather than in the order their loads happen to finish.
`Application.destroy()` clears both sets and detaches the frame-loop subscription.

Panels subscribe in `renderBody()` and unsubscribe in `unmount()`; `DebugPanel` additionally
unsubscribes whenever it is collapsed and re-subscribes when expanded, which is why it holds no
timer of its own.
