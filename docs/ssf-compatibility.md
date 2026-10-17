# Synesthesia (SSF) compatibility

How a Synesthesia scene becomes a BlinkFX package and what the `ssf/1` profile and script ABI
provide at run time. Nothing downstream of the package loader branches on the source format: a
converted package is an ordinary `blinkfx/1` package that declares a compatibility profile.

## Loading original scenes

The normal effect catalog supports original `.synScene` directories alongside
BlinkFX packages. Originals are translated once on activation by `convertSsfScene`,
validated and mounted in memory, then executed by the same BlinkFX pass and script
runtime as a saved conversion. There is no per-frame source translation and no
separate SSF renderer. A saved `.blinkfx` package is optional for distribution and
export; it does not provide additional compatibility.

Bundled originals retain their directory names, titles and file bytes. Community
scenes live below their repository directory to distinguish names also used by
built-in scenes. The catalog keeps native manifest paths as strings and describes
SSF entries with `id`, `title`, optional `description`, a `scene` path ending in
`/scene.json`, a package-relative `files` inventory, and optional `collection`
metadata (`builtin` or `community`). Assets are fetched only
when that scene is activated. The converted mount is released after switching
away. A missing file or conversion error rejects activation.

To import a collection into an output directory without writing BlinkFX packages:

```text
npx vite-node scripts/import-ssf-scenes.ts -- <output directory> <builtin collection> <community collection>
```

The importer refuses existing scene destinations. It copies every original,
retains existing native catalog entries, and lists scenes that pass structural
conversion and package validation. `ssf-import-report.json` records every scene,
including missing dependencies, runtime texture limits and compatibility warnings.
Structural validation does not establish GLSL compilation or native pixel parity.

The catalog is grouped as native BlinkFX (including installed packages), shipped
Synesthesia scenes, then community scenes. The reload control beside installation
revalidates the catalog and native manifests, retains the last successful list on
failure, and does not switch or release the running effect. Loading, script and
render failures appear in a centered dismissible Error card with literal text.

All GLSL effect passes use a common WebGL2 fullscreen renderer. It uses public
renderer SDK APIs, retains existing shader/target ownership and checks the device's
actual sampler limit. Each pass overwrites its attachments without ambient
source-over blending, preserving shader alpha and numeric buffer contents. The
renderer restores the previous GL blend state and refreshes requested mipmaps.
WGSL passes retain their existing mesh path. Scene validation permits the WebGL2
minimum of sixteen fragment samplers.

SSF 2.0 is the source API version. `ssf/1` is Blink's separately versioned
compatibility profile and JavaScript ABI, not a declaration of SSF 1.0. Generated
source metadata records `version: "2.0"`; the registered ABI remains `ssf/1`.

Audio Indicators retains its two 1920x1080 float history targets, final output pass,
original shader source and tracker script. Empty optional scripts are omitted from
execution. Script-written outputs are not republished as inputs that could replace
persistent JavaScript objects. Pointer globals are supplied during priming and each
frame. Deterministic tracker tests cover impulses, sustained input and decay.

See the [effect smoke report](ssf-effect-smoke-report.md) and
[GPU check](evidence/ssf-original/catalog-gpu-check.json). The checks establish
loading and scoped rendering, not Synesthesia 1.25.4 pixel parity. With a running
development server and an available Playwright install:

```text
npx vite-node scripts/refresh-ssf-catalog.ts -- public/effects
node scripts/ssf-catalog-check.mjs --url http://127.0.0.1:8080 --playwright <playwright index.mjs> --out <report.json>
node scripts/effects-runtime-smoke.mjs --url http://127.0.0.1:8080 --playwright <playwright index.mjs> --out <runtime-report.json>
```

The refresh command reads originals in place and updates metadata and structural
reports. It does not create saved BlinkFX conversions. The runtime checker starts
fresh Chromium instances for scenes, supplies an oscillator through the real audio
service, renders six frames and reads the output to synchronize GPU work. It checks
load exceptions, script/render faults, browser errors and GL errors. Dark output can
be valid for a scene requiring external media or longer simulation warmup.

## Conversion

`blinkfx convert` (and `convertSsfScene` in `src/packages/ssf`) turn a `.synScene`
directory into a self-contained `.blinkfx` package:

```
npm run blinkfx -- convert <scene or collection dir>... --out <dir> --format ssf [--skip-scripts]
```

Per scene it writes the package, and per run a `report.json` (status and issues per scene) and a
`catalog.json`. A scene is `complete`, `approximate` (converts, with a documented approximation)
or `failed` (with at least one `error` issue, for example an include of a Synesthesia built-in
library that is not part of the scene).

| SSF                                   | BlinkFX                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.glsl`                           | `shaders/main.frag.glsl`: the scene source, adapted for GLSL ES 3.00, behind the helper functions it uses and followed by a generated `main()` that calls `renderMain()`. The original is kept as `source/main.glsl`.                                                                                      |
| `PASSES`                              | One persistent render target and pass per entry, then a screen pass. `FLOAT` selects `rgba32f` (default) or `rgba8`; dimensions below two inherit the screen size. Single-buffer entries are explicitly adapted to safe persistent targets. `FILTER`/`WRAP` are preserved; defaults are `linear`/`repeat`. |
| buffer reads                          | A buffer earlier in the chain is read as this frame's result (`target.<name>`); the pass's own buffer and later ones are read as the previous frame (`target.<name>.previous`).                                                                                                                            |
| `syn_FinalPass`                       | A persistent `syn_FinalBuffer` target written by the final pass, bound as `.previous`, plus a copy pass to the screen.                                                                                                                                                                                     |
| `IMAGES`                              | Raw, straight-alpha `texture2d` assets with declared filter/wrap; defaults are `mipmap`/`repeat`.                                                                                                                                                                                                          |
| `MEDIA`, `syn_Media`, `syn_UserImage` | Optional `image` host inputs; `MEDIA` is an array containing one sampling record (legacy object input also accepted). Defaults are `linear`/`repeat`. With no producer bound the sampler reads transparent black and `_isMediaActive()` is false.                                                          |
| `_mouse`, `_click`, `_muv`, `_muvc`   | A `pointer` host input, repacked in the generated `main()`. `_click.xyz` independently tracks left/right/middle buttons in shaders and scripts.                                                                                                                                                            |
| `syn_Spectrum`, `syn_LevelTrail`      | `blink.audio.spectrum` / `blink.audio.levelTrail` pass inputs. 1D lookups are rewritten to the 2D form.                                                                                                                                                                                                    |
| `CONTROLS`                            | Native controls. Slider, knob, toggle, bang and dropdown are `float`; `xy` is `point2d`; `color` is `color` and the scene reads it as `vec3` (uses are rewritten to `.rgb`). The SSF type, modifiers, `PARAMS`, labels and values are kept under `compatibility.controls`.                                 |
| `HARD_/SMOOTH_TRANSITIONS`            | Float controls at their starting value; Blink has no song changes to drive them.                                                                                                                                                                                                                           |
| `script.js`                           | Kept as `script.js` with `script.abi = "ssf/1"` and `requirements.features = ["script:ssf/1"]`.                                                                                                                                                                                                            |
| script-written uniforms               | Declared by the converter from how the script writes them (`uniforms.x = ...`, `setUniform`), listed under `compatibility.scriptUniforms`.                                                                                                                                                                 |

Shader adaptation is token based, not a type checker. Numeric adaptation tracks declarations, function arguments, expression types and
loop scopes, preserving integer division and casts while promoting mixed arithmetic
for GLSL ES. Generic numeric macros are expanded at their call sites so integer and
floating overloads can be adapted independently. Global initializers that are not constant are moved into assignments at the top of
`main()`, because GLSL ES 3.00 only allows constant ones. Reserved words are renamed. A helper the
scene defines itself is never overridden by the library version.

## The `ssf/1` profile

A package with `compatibility.profile = "ssf/1"` gets, in addition to the native ABI:

- the `syn_*` audio scalars (`syn_Level`, `syn_BassHits`, `syn_BPMSin2`, `syn_FadeInOut`, ...),
  declared ahead of the pass samplers and fed every frame;
- the behavior of SSF control types: `smooth` eases toward the target (per-frame fraction
  `PARAMS`, default 0.01), `speed` integrates the value over time, `bang` is a one-frame pulse,
  `bang smooth` decays, `bang counter` counts pulses;
- neutral values for the script-written uniforms, so each material's schema can declare them.

`TIME`, `RENDERSIZE`, `FRAMECOUNT` (a `float`), `PASSINDEX` and `PI` are macros of the generated
shader over the native built-ins.

The default `ssf/1` profile uses Original PCM processing. `ssf-original/1` selects it explicitly and `ssf-semantic/1` retains the earlier generic-analyzer approximation. Original textures are RGBA32F with LINEAR/REPEAT sampling through one-row 2D adapters. [ssf-original.md](ssf-original.md) defines the numerical profile; [ssf-implementation-report.md](ssf-implementation-report.md) distinguishes tested boundaries and pending native behavior. The helper library uses recovered Synesthesia 1.25.2 arithmetic, with 311 scoped GPU checks. This does not qualify whole-scene pixels, host media processing or all control behavior; see [numerical and resource parity](ssf-numerical-parity.md).

## The `ssf/1` script ABI

The script is evaluated once per scene instance. Current inputs are published before optional `setup`; mandatory `update(float32(0.017))` primes the instance. Top-level `setUniform` outputs are cleared before priming. Setup errors are logged and priming is still attempted. A missing or failing update immediately aborts further updates.

- **Inputs.** Scalars and effective controls are available through bare names and `inputs`. Original scripts read the preceding scalar/control publication before the current producer tick. Vectors use named components. Mutable declared globals can be republished; modern-JS lexical collision behavior is a declared limitation.
- **Uniforms.** Native vector coercion, float32 publication, invalid-prefix behavior and legacy `uniforms` object persistence are covered by focused tests. Dynamically invented names without declared material slots cannot reach the GPU.
- **Controls.** The sixteen native globals are present, including the set/default/randomize families. Selected-dimension writes and normalization preserve untouched coordinates. Scene bank is supported; unavailable meta banks are refused. Native randomization and some class dynamics remain partial portable behavior.
- **Events.** Native callbacks are function-name strings, resolved when called, with a separate previous value initially zero for every registration. Change uses the float32 0.001 threshold; whileOn/whileOff use strict greater/less than 0.5. Failing handlers are removed.
- **Readback.** `textureFinalPass` accepts an injected byte-readback callback in the host module. Production refuses scenes requiring `sync-final-pass-readback`; the exact current native read-FBO path is not implemented.

Lab scripts run in isolated worker realms with CSP network denial and a timeout. The production host still executes synchronously on the main thread and is not a security boundary. Both use modern JavaScript, with Duktape 1.5.1 language parity unqualified.
