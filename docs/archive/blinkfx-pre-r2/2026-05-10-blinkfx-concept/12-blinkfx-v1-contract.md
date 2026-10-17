# BlinkFX Format v1 — Contract Specification

**Version**: 1.0  
**Status**: Stable (freeze)  
**Date**: 2026-05-12  

This document is the canonical frozen contract for BlinkFX v1 packages.
All loaders, validators, converters, and porters must target this contract.

---

## 1. Bundle Layout

A BlinkFX effect is a directory bundle:

```text
<effect-name>.blinkfx/
  manifest.json          # required
  shaders/
    main.frag.glsl       # required; entry-point fragment shader
    <pass>.frag.glsl     # optional; multi-pass shaders
  audio_indicators.png   # optional; preview thumbnail
  textures/              # optional; asset directory
```

---

## 2. Manifest Schema (`manifest.json`)

### Required top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `format` | `"blinkfx/1"` | Format identifier |
| `id` | string | Reverse-domain package ID, e.g. `com.codexo.audio_indicators` |
| `title` | string | Human-readable display title |
| `shaders` | object | Shader set (see below) |

### Optional top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `author` | string | Author attribution |
| `description` | string | Short description |
| `license` | string | License identifier |
| `thumbnail` | string | Preview image path relative to package root |
| `tags` | string[] | Search/sorting tags |
| `controls` | ControlSpec[] | Exposed uniform controls |
| `assets` | AssetSpec[] | External texture assets |
| `passes` | PassSpec[] | Render passes (defaults to single `main` pass) |
| `presets` | PresetRef[] | Preset configuration files |
| `script` | ScriptSpec | JavaScript/TypeScript scripting |

### Shader set

```json
{
  "shaders": {
    "glsl": "shaders/main.frag.glsl"
  }
}
```

Or for multi-pass:

```json
{
  "shaders": {
    "glsl": {
      "main": "shaders/main.frag.glsl",
      "feedback": "shaders/feedback.frag.glsl"
    }
  }
}
```

### Control types

| `type` | GLSL type | Default value |
|--------|-----------|---------------|
| `float` | `float` | number |
| `int` | `int` | number |
| `bool` | `bool` | boolean |
| `color` | `vec4` | `[r, g, b, a]` |
| `enum` | `int` | string (options array) |
| `point2d` | `vec2` | `[x, y]` |
| `bang` | *(no uniform)* | — |

All controls have `name` (uniform name), `label`, optional `group`, and type-specific fields (`min`, `max`, `step`, `default`, `options`).

### Passes

If `passes` is absent, a single implicit pass `{ name: "main", shader: "main", target: { kind: "screen" }, clear: true }` is generated.

Target may be `{ kind: "screen" }` or a named render target object `{ name: string, scale?: number, format?: string, persistent?: boolean }`.

---

## 3. Shader Contract

### Entry point

Every BlinkFX fragment shader **must** define:

```glsl
void main(void) {
    fragColor = /* vec4 */;
}
```

- `fragColor` is declared by the Blink Prelude as `out vec4 fragColor;`.
- **Do not** use `gl_FragColor` (deprecated in GLSL 300 es).
- **Do not** define `renderMain()` alone; BlinkFX does not call `renderMain()`.

### UV coordinates

There is **no** built-in `_uv` variable. Compute UV explicitly:

```glsl
vec2 uv = gl_FragCoord.xy / bl_resolution;
```

A ported SynScene may alias `_uv` locally after computing from `gl_FragCoord`:

```glsl
vec2 _uv = gl_FragCoord.xy / bl_resolution;
```

### GLSL reserved words

**Do not** use GLSL reserved keywords as local variable names. Known offenders include: `half`, `fixed`, `sampler`, `precision`, `attribute`, `varying`, `discard`, `common`, `partition`, `active`, `asm`, `class`, `union`, `enum`, `template`, `this`, `packed`, `goto`, `inline`, `noinline`, `volatile`, `public`, `static`, `extern`, `interface`, `long`, `short`, `double`, `buffer`, `input`, `output`, `sizeof`, `cast`, `namespace`, `using`.

### Duplicate declarations

Do **not** re-declare uniforms or functions already provided by the Blink Prelude. The prelude is prepended to every shader before compilation.

---

## 4. Blink Prelude (ABI)

The following are guaranteed available in every BlinkFX shader:

### Frame uniforms

```glsl
uniform float bl_time;
uniform float bl_deltaTime;
uniform int   bl_frame;
uniform vec2  bl_resolution;
uniform int   bl_pass;       // 0-based index of the current pass in the effect's pass list
```

`bl_pass` is 0 for single-pass effects; multipass effects branch on it. It is an additive v1 uniform and breaks no existing package.

### Native audio uniforms

```glsl
uniform float au_level;
uniform float au_bass;
uniform float au_mid;
uniform float au_midHigh;
uniform float au_high;
uniform float au_hit;
// ... (all 20 BlinkAudioFrame fields prefixed au_)
```

### SSF compatibility uniforms

```glsl
uniform float syn_Level;
uniform float syn_BassLevel;
uniform float syn_MidLevel;
uniform float syn_MidHighLevel;
uniform float syn_HighLevel;
uniform float syn_RawLevel;
uniform float syn_InputLevel;
uniform float syn_Presence;
// ... (all 22 SSF-compatible signals prefixed syn_)
```

### Audio textures

```glsl
uniform sampler2D fx_spectrum;     // 1024 × RGBA float32
uniform sampler2D fx_histogram;     // 400 × RGBA float32
uniform sampler2D syn_Spectrum;     // SSF alias for fx_spectrum
uniform sampler2D syn_LevelTrail;   // SSF alias for fx_histogram
```

### Controls

Each control declared in `manifest.json` becomes a uniform with its `name` and GLSL type (mapped per the ControlSpec table above).

---

## 5. Compatibility Aliases

| Native Blink | SSF Alias | Texture Layout |
|-------------|-----------|----------------|
| `fx_spectrum` | `syn_Spectrum` | 1024 × RGBA float32; R=raw, G=juiced, B=smooth, A=waveform |
| `fx_histogram` | `syn_LevelTrail` | 400 × RGBA float32; R=all, G=bass, B=mid, A=high |

Both native and alias names are available. SynScene ports should prefer the SSF aliases for source fidelity.

---

## 6. Package Discovery

Packages are registered via a catalog file:

```text
public/effects/catalog.json
```

```json
{
  "packages": [
    "/effects/audio_indicators.blinkfx/manifest.json",
    "/effects/audio_debug.blinkfx/manifest.json"
  ]
}
```

- **Order determines UI presentation order.** First entry is the default preselected effect.
- All manifests are fetched and validated at app startup.
- Invalid or unreachable manifests are silently skipped (warned to console).

---

## 7. SynScene → BlinkFX Porting Rules

When porting a Synesthesia `.synScene` to BlinkFX `.blinkfx`:

### Required shader transforms

| Synesthesia | BlinkFX |
|-------------|---------|
| `renderMain()` | `void main(void) { fragColor = renderMain(); }` — or inline the body directly |
| `_uv` | `vec2 _uv = gl_FragCoord.xy / bl_resolution;` (local) |
| `PASSINDEX` | Use BlinkFX pass system; for single-pass ports, hardcode `0` |
| `_map()`, `_sqPulse()`, `_inRange()` | Re-define as local GLSL helpers or inline |
| `_rgb2hsv()`, `_hsv2rgb()` | Re-define as local GLSL helpers |
| `RENDERSIZE` | `bl_resolution` |
| `gl_FragColor` | `fragColor` (BlinkFX output) |
| Reserved-word variables | Rename (e.g. `half` → `hw`) |

### Manifest transforms

- `scene.json` `TITLE` → `manifest.json` `title`
- `scene.json` `CREDIT` → `manifest.json` `author`
- `scene.json` `PASSES` → `manifest.json` `passes` (BlinkFX pass format)
- `script.js` → Deferred; BlinkFX v1 scripting is not production-implemented. Mark as unsupported.

### Unsupported features (deferred)

- `script.js` per-frame state update (peak trackers, smoothing, complex animation state)
- Multipass feedback trails (BlinkFX passes exist but render-target chaining not yet generalized)
- Video/texture streaming inputs
- Compute passes
- Panels, masks, arbitrary UI

---

## 8. Stability Statement

BlinkFX v1 is now **frozen**. The manifest schema, shader contract, prelude ABI, and catalog discovery mechanism defined in this document are the canonical target for:

- New BlinkFX effects
- SynScene → BlinkFX ports
- Forensics-backed SSF compatibility verification
- Future converter/import tool implementation

Extensions (WGSL support, scripting, compute passes) are v2+ scope and must not break v1 packages.
