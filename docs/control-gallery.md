# Scene controls and the Control Matrix fixture

The scene-control panel preserves the order and grouping declared by an effect.
Widgets use vertical sliders, circular knobs, toggles, round trigger buttons, XY
pads, compact color pickers and option dropdowns. Raw positions/defaults come from
normalized control specifications. Optional source metadata selects the original
presentation family without changing GLSL uniform types: an SSF toggle, bang or
dropdown remains a float where the source shader expects one.

`ShellRuntimeState.controlSources` carries per-control converter metadata for UI
presentation; missing metadata uses the native control type. State pushes contain
raw authoring values. Shader-side smoothing, integration and dropdown value mapping
remain in the compatibility profile. SSF dropdown defaults and UI values are
indices from zero through the last source option; only the processed shader value
uses VALUES, when provided. The UI does not drive a second render loop.

Default actions use `ShellHost.resetControl` when available to reset raw defaults
and source-control history together; older hosts fall back to writing raw defaults.
Per-group locks apply to local editing, reset and randomization, not script writes.
Undo restores locally edited raw settings, not shader/script/audio history. Native
bangs are transient events for scripts and do not gain a durable GLSL uniform.
Triggers queue until the update phase and publish a zero frame between repeated
rising edges. Raw event values clear after script and profile processing. Native
script frame contexts retain a snapshot of trigger inputs across asynchronous hooks; queued
events wait while an earlier native script frame is still in flight.

The original `Synesthesia_Control_Gallery.synScene` exercises 42 controls, seven
families and 19 variants. Its atlas samples `_uv`; only the overlay's top-left UI
coordinates flip Y. Static 2D package images in SSF and BlinkFX decode with a
vertical flip, straight alpha and unchanged color bytes, matching the source
image-upload contract. Both scene variants use the same asset binder; shaders need
no compensating Y flip. The native BlinkFX extension preserves those controls and
adds integer, boolean, enum, RGBA-with-alpha and event-only bang controls. Its native bang
is explicitly converted by a diagnostic script into count/pulse shader uniforms.
Global Synesthesia meta/media controls are not scene declarations; the fixture does
not add unsupported global image operations.

Acceptance checks cover complete gallery loading, source and native widget families,
default and shader values, dropdown option indexing, trigger delivery/reset, group
operations, range clamping, pointer/keyboard interaction and responsive layout.

The supplied SSF fixture is listed as a community scene; its flat directory does
not make it a Synesthesia shipped scene. The derived package appears in the native
BlinkFX group. Catalog refresh preserves explicit collection assignments.
Rebuild the derived package with
`npx vite-node --script scripts/build-control-gallery.ts`.

Chromium loaded both variants through the production Application and RenderService
and rendered six frames each without script faults, browser errors or GPU errors.
The retained corpus now contains 137 effects: 11 BlinkFX, 87 shipped SSF and 39
community SSF. This check adds the two gallery entries to the previously recorded
135-effect corpus smoke; it does not repeat that entire corpus.
Evidence: [gallery runtime smoke](evidence/control-gallery/runtime-smoke.json).

The 13-file targeted gate passed 183 tests. The final 43-test control-panel
regression file then passed after the RGBA precision correction.
Type checking and targeted lint passed. Real desktop/mobile interactions covered
all 42 source controls and the five native additions. Alpha-only changes preserve
original float RGB values; choosing a new RGB color uses the browser's 8-bit picker.
See [source browser checks](evidence/control-gallery/browser-source.json) and
[native browser checks](evidence/control-gallery/browser-native.json).

The static asset orientation and dropdown changes affected 42 effects. Their
six-frame previews were refreshed: 39 rendered captures and three declared-image
fallbacks for blank synthetic-input output. All 42 completed without GPU errors;
all 137 catalog entries have valid 320x180 PNG previews.
See [preview refresh](evidence/control-gallery/previews.json).
