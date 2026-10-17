# 06 — Compatibility Architecture

## Core rule

Blink should have **one runtime** and **multiple loaders**.

```text
BlinkFX package ┐
ISF file        ├── parser + adapter ──> BlinkEffectIR ──> backend compiler ──> runtime
SSF scene       ┘
```

This keeps compatibility from fragmenting the renderer.

## Why an intermediate representation is necessary

Native BlinkFX, ISF, and SSF differ in:

- package layout
- field names
- shader dialects
- built-in functions
- audio semantics
- scripting models

But once loaded, they all need the same runtime concepts:

- metadata
- controls
- assets
- passes
- render targets
- shader sources
- optional scripts
- presets / transitions where supported

`BlinkEffectIR` is the normalised internal form that represents those concepts consistently.

## Proposed pipeline

### BlinkFX

```text
manifest.json
→ BlinkFxLoader
→ BlinkEffectIR
```

### ISF

```text
.fs file
→ parse JSON header
→ parse shader body
→ attach ISF compatibility surface
→ normalise INPUTS / PASSES / IMPORTED
→ BlinkEffectIR
```

### SSF

```text
.synScene directory
→ parse scene.json
→ load main.glsl / images / optional script.js
→ attach SSF compatibility surface
→ normalise controls / passes / images / transitions
→ BlinkEffectIR
```

## What happens to foreign built-ins?

### Direct playback path

For direct playback, **do not rewrite the original source unnecessarily**.

- SSF shaders should keep using `syn_BassLevel`, `syn_Spectrum`, `_uv`, etc.
- ISF shaders should keep using `TIME`, `RENDERSIZE`, `IMG_NORM_PIXEL`, etc.

The adapter provides:

- uniform aliases
- helper-function preludes
- compatible texture bindings
- small source wrappers where unavoidable

### CLI conversion path

A CLI converter may offer two modes:

1. **preserve mode** — emit a BlinkFX package that still uses the compatibility dialect internally
2. **native mode** — rewrite toward the native Blink ABI when the conversion is safe enough

## Compatibility surfaces

### ISF adapter should provide

- JSON header parsing
- built-ins: `PASSINDEX`, `RENDERSIZE`, `TIME`, `TIMEDELTA`, `DATE`, `FRAMEINDEX`, `isf_FragNormCoord`
- `IMG_PIXEL`, `IMG_NORM_PIXEL`, `IMG_SIZE`
- `INPUTS`
- `PASSES`
- `IMPORTED`
- `audio` / `audioFFT`
- generator / filter / transition conventions

### SSF adapter should provide

- `.synScene` package loading
- `scene.json` fields
- standard uniforms
- `syn_*` audio uniform surface
- `syn_Spectrum`, `syn_LevelTrail`
- helper function library
- `PASSES`, `PASSINDEX`, `syn_FinalPass`
- `CONTROLS`, `IMAGES`, `MEDIA`, transitions
- documented scripting subset

## SSF scripting compatibility

### Straightforward to support

- `setup()` / `update(dt)`
- global input uniforms
- `setUniform()`
- `setControl()`
- `setControlNormalized()`
- randomise / default helpers
- group helpers
- event helpers
- deprecated `inputs` / `uniforms` if needed
- `print()` / `console.log()` / `printGlobalKeys()`

### Needs empirical verification

- exact order of `update()` vs event callbacks
- same-frame propagation rules after control mutation
- exact control-name normalisation
- float equality / threshold semantics for events
- changing output uniform arity after first declaration

### Hardest item

- `textureFinalPass(x, y)` because it implies GPU→CPU readback; it is especially awkward under WebGPU.

## Performance implications

Once normalised into the same IR and compiled into the same runtime structures, imported effects should not inherently be slower just because they came from ISF or SSF. Remaining costs come from:

- compatibility shader preludes / wrappers
- unsupported or emulated features
- expensive source features such as feedback, readback, or helper functions

## Error / capability model

Compatibility should be explicit rather than magical.

### Recommended package status labels

- `supported`
- `supported-with-adapter`
- `supported-with-warnings`
- `unsupported-feature`

### Example warnings

- `SSF script uses textureFinalPass(); WebGPU path unavailable; using WebGL2 compatibility mode.`
- `ISF file uses image input conventions unsupported by Blink MVP.`
- `SSF scene requires script.js behaviour that has not yet been validated.`

## Converter CLI

Recommended commands:

```bash
blinkfx inspect <path>
blinkfx validate <path>
blinkfx convert <path> --to blinkfx --mode preserve
blinkfx convert <path> --to blinkfx --mode native
blinkfx convert <path> --to isf
blinkfx convert <path> --to ssf
```

### Realistic conversion matrix

| Direction | Feasibility |
|---|---:|
| plain GLSL → BlinkFX | high |
| GLSLSandbox → BlinkFX | high |
| Shadertoy single-pass → BlinkFX | high |
| Shadertoy multipass → BlinkFX | medium |
| ISF → BlinkFX | high |
| SSF without complex script → BlinkFX | medium-high |
| SSF with script.js → BlinkFX | medium / depends on script |
| BlinkFX → ISF | medium-high for compatible subset |
| BlinkFX → SSF | medium-high for compatible subset |
| BlinkFX → Shadertoy | limited to simple generator subset |
