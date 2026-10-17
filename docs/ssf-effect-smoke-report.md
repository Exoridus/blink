# Effect loading and playback smoke - 2026-10-13

The catalog uses original scene directories, with activation-time translation into
memory and the common BlinkFX runtime. Saved SSF-to-BlinkFX ports are not required.
Original folder names and scene titles are retained. Community folders are nested
by repository to distinguish collisions with shipped scene names.

## Catalog result

The later [Control Matrix gallery](control-gallery.md) adds two separately checked
entries, bringing the current catalog to 137 effects.

All **135 effects in the original import corpus** passed the real Chromium playback check: **10 native
BlinkFX**, **87 shipped Synesthesia scenes**, and **38 community scenes**. All 125
retained SSF shaders also compiled in the separate WebGL2 gate. The 125 retained
original directories passed SHA256 comparisons for all 505 original files; three
library/license files were added to SkaiWalkerOG without editing existing files.

Three failing community scenes were backed up, removed from public effects and
recorded in `ssf-removed-effects.json`:

| Scene                                          | Established failure                                                                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apbeckman_WIP/journey_thru_the_grid.synScene` | Missing hg_sdf and LYGIA SDF includes.                                                                                                                                                                                                                    |
| `apbeckman_WIP/shape_migration_ii.synScene`    | Missing hg_sdf and LYGIA SDF includes, image10.png and image9.jpeg.                                                                                                                                                                                       |
| `mrange_synesthesia-public/onair.synScene`     | Playback stalled at the first render frame in fresh Chromium. The initial 120-second watchdog and a 240-second, three-frame retry expired. No GLSL compilation or JavaScript error was reported; this is an execution timeout in the checked environment. |

The earlier incomplete Audio Indicators BlinkFX port and its archive were also
removed. Audio Indicators now uses the original SSF scene and complete pass/script
semantics. Its pure BlinkFX diagnostic counterpart remains a separate native effect.

## Changes and established repairs

- Effect selectors group BlinkFX, shipped Synesthesia scenes, then community SSF.
  The reload icon beside effect installation revalidates catalog metadata without
  switching the active scene. Failed refreshes retain the previous usable catalog.
- A centered, dismissible Error card displays loading, source, script and rendering
  errors as literal text. Browser checks cover grouping, fresh entries, refresh
  failure, unchanged active selection, centering, dismissal and HTML-like messages.
- Shared GLSL adaptation preserves integral division, casts and loop scopes while
  adapting desktop mixed arithmetic. It handles sampler choices, output-variable
  conflicts, PI redefinitions, unused initialized uniforms and numeric macros.
- Image sampling and normalized-pixel host helpers are provided. Script uniform
  discovery supports named setter helpers and named-component vectors.
- Empty optional scripts are not executed. Script outputs no longer overwrite
  persistent JavaScript objects when the host publishes the next frame. Priming
  failures retain their actual error. Pointer globals are available at priming and
  each frame, with output-height changes applied before subsequent pointer events.
- A Blink fullscreen WebGL2 renderer uses public ExoJS SDK APIs for passes requiring
  more than seven samplers. It preserves the existing pass executor and targets.
  An independent eleven-texture GPU probe returned exactly 0.515625, preserved a
  custom vertex program, and changed an uploaded scalar from 0.25 to 0.75. GL error
  was zero. Reflection is performed after shader binding, as required by the SDK.
- SkaiWalkerOG now contains its exact required hg_sdf and LYGIA digits dependencies.
  Existing original scene files were not rewritten. hg_sdf's embedded MIT option
  and the LYGIA 1.1.0 Prosperity license notice are retained. LYGIA's license terms
  apply to commercial use and redistribution; it is not an MIT dependency.
- Source API metadata is SSF 2.0. The separately versioned Blink profile and script
  ABI remain `ssf/1`.

## Verification scope

Chromium WebGL2 runs the real Application, RenderService, loader, scripts, assets,
PCM capture and pass graph. Each scene starts in a fresh browser instance with a
320x180 screen output, a 60 FPS cap and an 80 Hz oscillator at gain 0.1. Explicit
source target dimensions and float formats are preserved. Six complete frames are
followed by synchronized GPU readback. Dark output is allowed for media-dependent
scenes or simulations needing more warmup. This is a loading and execution test,
not pixel parity, a performance guarantee, or an exhaustive control-state test.

The test harness suppresses development HMR to prevent source edits and development
WebSocket failures from being mistaken for scene failures. Every retained scene's
original files are compared against its source collection by SHA256. The exact
pass/failure rows are kept in the companion evidence files.

Focused verification: 276 tests across 18 converter, package, runtime and UI files,
plus 20 original audio/native replay tests across five files, passed. Type checking
and targeted lint passed; retained pre-existing lint warnings are not errors. The
complete repository test/lint gates were not run as final validation.

See [runtime results](evidence/ssf-original/catalog-runtime-smoke.json),
[shader results](evidence/ssf-original/catalog-gpu-check.json),
[removed scenes](../public/effects/ssf-removed-effects.json), and
[Audio Indicators interpretation](ssf-visual-parity-report.md).
