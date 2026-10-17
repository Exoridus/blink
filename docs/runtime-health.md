# Runtime health: fault isolation and frame-time budgets

A running effect has several independent parts: its render passes, its script, and, for some
packages, generated audio. A failure in one must not stop the frame loop or silence the others.
The runtime guards each part and measures what a frame costs. Both are surfaced to the shell, not
only logged.

## Fault isolation

`FaultGuard` (`src/runtime/health/FaultGuard.ts`) wraps each guarded part. Per part it keeps a
count of consecutive failures:

| Part             | Source id     | Switched off after                                                   |
| ---------------- | ------------- | -------------------------------------------------------------------- |
| Render passes    | `render`      | 3 consecutive frames that throw                                      |
| `blink/1` script | `script`      | 3 consecutive failed frames, or one frame that never settles for 2 s |
| `ssf/1` script   | `ssfScript`   | 3 consecutive failed frames, or 3 consecutive frames over 50 ms      |
| Generated audio  | `audioOutput` | the audio runtime stops generating after 5 consecutive failed blocks |

A part that fails once is retried: one bad frame is usually a bad input. A part that is switched
off stays off until another effect is loaded, which clears the record. The other parts keep
running: a dead script leaves the passes drawing with the last control and uniform values, and a
dead pass runtime leaves the script and the audio running.

What a switched-off part leaves behind:

- `render`: the passes are not executed again; the canvas keeps its last contents and the overlay
  still draws.
- `script`: the control values it last wrote stay in place.
- `ssfScript`: the uniforms it last wrote keep being uploaded; they are not reset to zero.
- `audioOutput`: no new blocks are requested; what is already queued still plays out.

### Limits

JavaScript cannot be interrupted from the same thread. A script that loops forever in its
synchronous `update` freezes the page, and the guard never gets control back to react. The
`ssf/1` stall limit and the `blink/1` hang limit therefore bound how often a slow or stuck script
recurs, not how long a single occurrence takes. Running scripts in a worker, where they can be
terminated, is the remedy and is not part of v1.

How the failure counts, limits and "stays off" policy treat a script exception is a Blink
decision. Synesthesia's behavior for an exception in `setup`, `update` or an event handler is not
established (see the open questions in [ssf-compatibility.md](ssf-compatibility.md)), so this
policy makes no claim to match it.

### Where faults show up

`RenderService.faults()` returns one record per part that has failed since the effect was loaded:
source, kind (`error`, `stall` or `hang`), the latest message, the number of occurrences and
whether the part is switched off. `RenderService.onHealthChange` fires when a part first fails,
when it is switched off and when the records are cleared. The host pushes them as
`ShellRuntimeState.faults`, and the effect panel shows them as lines under its status, so they
are visible without opening the diagnostics panel. The diagnostics snapshot carries the same
records.

## Frame-time measurement

`FrameTimeMonitor` (`src/runtime/health/FrameTimeMonitor.ts`) times four CPU stages of every
frame: `update` (uniform and input updates), `script`, `passes` (uploading uniforms and
submitting the draws) and `audioOutput` (requesting generated audio). Stages may nest; the inner
stage's time is taken out of the outer one, so the stages of a frame add up to its total.

The monitor keeps the last 120 frames and reports, per stage and for the whole frame, the mean,
the 95th percentile, the maximum, the budget and the number of frames over it. Default budgets
are 12 ms for a frame and 5 / 4 / 6 / 2 ms for the stages above. They are starting points: the
update stage is set from what the bundled plasma effect measures in a development build (mean
1.8 ms, p95 3.7 ms), and an effect that is expected to be heavier should be judged against its own
numbers.

The stage times are CPU times. They cover building and submitting a frame, not the GPU executing
it. The GPU is measured separately, with the device's hardware timer, through the render backend's
`setGpuTimingEnabled` and `stats.gpuFrameTimeMs`:

- Timing runs only while the diagnostics panel is open, because it allocates query objects and
  costs a timestamp pair per pass.
- A result arrives a frame or more after the frame it measures. The backend offers the latest
  value again until the next one lands, so a value counts as a new measurement only when it
  differs from the one before it.
- A device without a timer (`EXT_disjoint_timer_query_webgl2` on WebGL2) reports no GPU figure and
  the panel says "nicht verfügbar"; nothing is estimated.
- On WebGL2 the figure brackets the frame's whole GL command stream, uploads included.

The panel also shows the engine's running estimate of live GPU memory (`stats.gpuMemoryBytes`).
It is an estimate the engine keeps itself, not a driver figure. It complements the static
render-target memory estimate that `blinkfx validate` makes before a package is loaded.

Errors that surface after the guarded pass loop returned are recorded as `render` faults too:
a draw queued with `context.render`, such as the screen pass, is only submitted when the engine
flushes the frame, and the backend's asynchronous render errors (a WGSL compile error, a device
error) arrive the same way. Both reach the application's `onError` signal, which is where
`RenderService` listens. The backend reports each distinct message once for its lifetime, so such a
fault is recorded once and does not count toward switching the passes off.

The diagnostics panel lists the stages with their mean, p95 and maximum and marks a stage whose
p95 is over its budget. The numbers restart when another effect is loaded.

The static budgets that `blinkfx validate` checks before a package is loaded are described in
[blinkfx-cli.md](blinkfx-cli.md).
