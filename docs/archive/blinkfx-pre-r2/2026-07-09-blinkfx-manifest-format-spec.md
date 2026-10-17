# BlinkFX Manifest Format — v1 Reference Spec

**Date:** 2026-07-09 · **Status:** canonical reference (working agreement) · **Format tag:** `blinkfx/1`

This document is the **single authoritative reference** for the native BlinkFX package
manifest (`manifest.json`). It consolidates three previously scattered sources into one:

- `docs/architecture/2026-05-10-blinkfx-concept/02-blinkfx-format.md` (narrative design)
- `docs/architecture/2026-05-10-blinkfx-concept/schemas/blinkfx.types.ts` (proposed TS surface)
- `src/packages/blinkfx/{manifest.ts, validate.ts, loader.ts}` (the implemented format)

Where those sources diverged, this document resolves the conflict and **is the source of
truth** going forward. The narrative concept doc (`02`) remains the *design rationale*;
this doc is the *precise property reference*.

**Scope:** the native `manifest.json` only. The shader ABI (`bl_*`/`au_*`/`syn_*` uniforms)
is defined in `03-runtime-abi.md`; the internal `BlinkEffectIR` and the SSF/ISF loaders are
out of scope here.

**One additive change vs. Phase 1:** an optional top-level `version` field (§4). Everything
else documents the already-built, already-agreed format.

---

## 1. Package layout

A BlinkFX package is a directory (unpacked) or an archive (packed) with the `.blinkfx`
extension, containing paths relative to its root:

```text
my_effect.blinkfx/
  manifest.json          # required
  shaders/               # at least one shader entry is required
    main.frag.glsl
  assets/                # optional: package-local textures
    noise.png
  presets/               # optional: curated control values
    default.json
  script.ts              # optional: native script module
  thumbnail.webp         # optional
```

Only `manifest.json` and at least one shader entry are required.

---

## 2. Minimal manifest

```json
{
  "format": "blinkfx/1",
  "id": "com.codexo.plasma",
  "title": "Plasma",
  "shaders": { "glsl": "shaders/main.frag.glsl" }
}
```

With everything else omitted, the loader synthesises one implicit pass
`{ name: "main", shader: "main", target: "screen", inputs: [], clear: true }`, and the
string-valued `shaders.glsl` binds to the implicit shader key `"main"`.

---

## 3. Full manifest (illustrative)

```jsonc
{
  "format": "blinkfx/1",
  "id": "com.codexo.hypercoil",
  "title": "Hypercoil",
  "version": "1.0.0",
  "author": "DIMA",
  "description": "Audio-reactive recursive tunnel with feedback trails.",
  "license": "MIT",
  "thumbnail": "thumbnail.webp",
  "tags": ["tunnel", "feedback", "audio-reactive"],

  "controls": [
    { "name": "intensity", "label": "Intensity", "type": "float",
      "default": 0.7, "min": 0, "max": 1, "step": 0.01, "group": "Motion" },
    { "name": "palette", "label": "Palette", "type": "enum",
      "default": "aurora", "options": ["aurora", "inferno", "mono"], "group": "Color" }
  ],

  "assets": [
    { "name": "noise", "type": "texture2d", "path": "assets/noise.png",
      "sampling": { "filter": "linear", "wrap": "repeat" } }
  ],

  "passes": [
    { "name": "feedback", "shader": "feedback",
      "inputs": ["feedback.previous", "noise", "blink.audio.spectrum"],
      "target": { "name": "feedback", "scale": 0.5, "format": "rgba16f", "persistent": true },
      "clear": false },
    { "name": "main", "shader": "main", "inputs": ["feedback"], "target": "screen" }
  ],

  "shaders": {
    "glsl": { "feedback": "shaders/feedback.frag.glsl", "main": "shaders/main.frag.glsl" },
    "wgsl": { "feedback": "shaders/feedback.frag.wgsl", "main": "shaders/main.frag.wgsl" }
  },

  "presets": [
    { "name": "default", "path": "presets/default.json" },
    { "name": "intense", "path": "presets/intense.json" }
  ],

  "script": {
    "entry": "script.ts",
    "events": [ { "input": "palette", "on": "change", "handler": "onPaletteChange" } ]
  }
}
```

---

## 4. Top-level fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `format` | string | **yes** | — | Must be exactly `"blinkfx/1"`. |
| `id` | string | **yes** | — | Stable, unique package identity. Reverse-DNS (`com.vendor.name`) **recommended**, not enforced. |
| `title` | string | **yes** | — | Human-facing display name. |
| `version` | string | no | — | Package version. Semver recommended. *(additive vs. Phase 1)* |
| `author` | string | no | — | Credit. |
| `description` | string | no | — | Free text. |
| `license` | string | no | — | Redistribution terms. |
| `thumbnail` | string | no | — | Package-relative preview image path. |
| `tags` | string[] | no | `[]` | Discovery metadata. |
| `controls` | Control[] | no | `[]` | User-editable parameters (§5). |
| `assets` | Asset[] | no | `[]` | Package-local textures (§6). |
| `passes` | Pass[] | no | one implicit screen pass | Ordered fragment passes (§7). |
| `shaders` | ShaderSet | **yes** | — | Backend shader files (§8). Must contain at least one of `glsl`/`wgsl`. |
| `presets` | Preset[] | no | `[]` | Curated control values (§9). |
| `script` | Script | no | — | Native script module declaration (§10). |

Unknown top-level fields are ignored (forward-compatible, additive evolution).

---

## 5. Controls

A control name becomes the shader-visible user-uniform name of the same name. All controls
share these base fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | Non-empty; the uniform name. |
| `type` | enum | **yes** | One of `float`, `int`, `bool`, `color`, `enum`, `point2d`, `bang`. |
| `label` | string | no | UI label. |
| `description` | string | no | UI help text. |
| `group` | string | no | UI grouping key. |

Per-type fields:

| Type | Extra fields | `default` | Constraints | Uniform |
|---|---|---|---|---|
| `float` | `min?`, `max?`, `step?` (numbers) | number (**required**) | if `min`&`max` set: `min ≤ max` and `min ≤ default ≤ max` | `float` |
| `int` | `min?`, `max?`, `step?` (numbers) | number (**required**) | integer values; `min ≤ default ≤ max` if set | `int` |
| `bool` | — | boolean (**required**) | — | `bool` |
| `color` | — | `[r,g,b,a]` (**required**) | exactly 4 numbers | `vec4` |
| `enum` | `options: string[]` (**required**) | string (**required**) | `options` non-empty; **`default` must be an element of `options`** | `int` (index into `options`) |
| `point2d` | `min?`, `max?` (`[x,y]`) | `[x,y]` (**required**) | exactly 2 numbers | `vec2` |
| `bang` | — | — (none) | momentary event, **no durable uniform**; consumed via `script.events` | — |

> **Validator hardening pending:** the `enum` default-in-`options` rule and the
> `min ≤ default ≤ max` rule are canonical here but not yet enforced by `validate.ts`.
> They should be added to the validator.

---

## 6. Assets

Package-local textures, referenced by name from pass `inputs` (§7).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** | — | Non-empty; the input reference key. |
| `type` | enum | **yes** | — | `"texture2d"` (only value in v1). |
| `path` | string | **yes** | — | Non-empty; package-relative file path. |
| `sampling.filter` | enum | no | `linear` | `nearest` \| `linear` \| `mipmap`. |
| `sampling.wrap` | enum | no | `clamp` | `clamp` \| `repeat` \| `mirror`. |

---

## 7. Passes and render targets

An ordered list of fullscreen fragment passes. Each pass names the shader it uses, its
inputs, and its output target.

### 7.1 Pass fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** | — | Non-empty; unique pass name. |
| `shader` | string | **yes** | — | Key into `shaders.glsl`/`shaders.wgsl` (§8). |
| `inputs` | string[] | no | `[]` | Ordered sampler bindings (§7.3). |
| `target` | `"screen"` \| RenderTarget | no | `"screen"` | Output destination (§7.2). |
| `clear` | boolean | no | `true` | Clear the target before rendering. Set **`false`** on persistent feedback passes so the buffer accumulates. |

### 7.2 RenderTarget object

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | **yes** | — | Unique target name; also the input reference key. |
| `width` | number | no | `null` | Explicit pixel width. |
| `height` | number | no | `null` | Explicit pixel height. |
| `scale` | number | no | `null` | Fraction of screen size (`>0`). Use `width`+`height` **or** `scale`, not both; if none, target is screen-sized. |
| `format` | enum | no | `rgba8` | `rgba8` \| `rgba16f` \| `rgba32f`. Float formats require `EXT_color_buffer_float` at runtime (available via ExoJS ≥ 0.15.3); if unavailable the runtime downgrades to `rgba8` with a console warning. |
| `persistent` | boolean | no | `false` | `true` → ping-pong feedback buffer; the previous frame is readable via `<name>.previous`. |

### 7.3 `inputs` reference syntax

`inputs` is an **ordered** list; position binds to the shader's samplers in declaration
order. Each entry is one of:

| Form | Meaning |
|---|---|
| `<assetName>` | A `texture2d` declared in `assets`. |
| `<targetName>` | The current-frame output of a named render target. |
| `<targetName>.previous` | The previous frame of a **persistent** target (feedback). A pass that lists **its own** target implicitly reads the previous frame (`readsPrevFrame`). |
| `blink.audio.spectrum` | Built-in audio spectrum texture (§11). |
| `blink.audio.levelTrail` | Built-in audio level-trail texture (§11). |

> A pass may **not** read and write the *same* physical texture in one draw (GL feedback
> loop). Persistence is implemented as two ping-pong textures per persistent target, so
> `<self>.previous` reads the other texture. This is a runtime invariant, not an author concern.

---

## 8. Shaders

```jsonc
"shaders": {
  "glsl": "shaders/main.frag.glsl",              // single path → implicit key "main"
  // — or —
  "glsl": { "main": "…", "feedback": "…" },       // named keys, referenced by pass.shader
  "wgsl": { "main": "…" }                          // optional second backend
}
```

- At least one of `glsl` / `wgsl` is **required**.
- A value may be a single path **string** (bound to the implicit key `"main"`) or a
  **record** `{ key: path }`.
- `pass.shader` references a key in this record.
- v1 runtime renders GLSL; the `wgsl` branch is parsed and reserved for a future WebGPU path.

---

## 9. Presets

Manifest declares preset **references**; each points to a separate JSON file so presets stay
diffable and shareable.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | Non-empty; preset display name. |
| `path` | string | **yes** | Non-empty; package-relative path to the preset file. |

A preset file holds `{ "name": string, "values": { <controlName>: <value> } }`, targeting
control names (not backend shader details). *(The preset-file format itself is a companion
contract, documented separately.)*

---

## 10. Script (manifest declaration)

Declares the native script module and its manifest-bound event handlers. The **script module
ABI** (`setup`/`update`/`dispose`, `BlinkScriptContext`) is defined in `03-runtime-abi.md`
and is out of scope here.

| Field | Type | Required | Notes |
|---|---|---|---|
| `entry` | string | **yes** | Non-empty; package-relative script path. |
| `events` | EventBinding[] | no | Manifest-bound handlers. |

EventBinding:

| Field | Type | Required | Notes |
|---|---|---|---|
| `input` | string | **yes** | Non-empty; a control `name`. |
| `on` | enum | **yes** | `change` \| `offToOn` \| `onToOff` \| `whileOn` \| `whileOff`. |
| `handler` | string | **yes** | Non-empty; exported handler function name. |

---

## 11. Built-in audio textures

These are provided by the runtime and referenced from pass `inputs` as
`blink.audio.spectrum` / `blink.audio.levelTrail`. Their packing is **verified against the
implementation** (`BlinkAudioTextureRuntime`) and matches the SSF-derived semantics.

### `blink.audio.spectrum` — 1024 × 1, `rgba32f`

| Channel | Meaning |
|---|---|
| R | Raw spectrum (linear, unprocessed) |
| G | Juiced spectrum (Synesthesia-style transformed) |
| B | Smooth spectrum (broad log-frequency scaling; separate path from Juiced) |
| A | Waveform (centered; silence ≈ `0.5`) |

### `blink.audio.levelTrail` — 400 × 1, `rgba32f`

| Channel | Meaning |
|---|---|
| R | Whole/overall level trail |
| G | Bass level trail |
| B | Mid level trail |
| A | High level trail |

Ordering: `x = 0` newest … `x = 399` oldest. Cadence ≈ 31.5 Hz (≈ 12.7 s of history).

> Native shader-uniform names for these textures (`blinkSpectrum`/`blinkLevelTrail` per
> `03` vs. the current `fx_spectrum`/`fx_histogram` in code) are an ABI concern tracked
> separately, not part of this manifest spec.

---

## 12. Appendix — JSON Schema (draft-07)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BlinkFX Manifest v1",
  "type": "object",
  "required": ["format", "id", "title", "shaders"],
  "additionalProperties": true,
  "properties": {
    "format": { "const": "blinkfx/1" },
    "id": { "type": "string", "minLength": 1 },
    "title": { "type": "string", "minLength": 1 },
    "version": { "type": "string" },
    "author": { "type": "string" },
    "description": { "type": "string" },
    "license": { "type": "string" },
    "thumbnail": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "controls": { "type": "array", "items": { "$ref": "#/definitions/control" } },
    "assets": { "type": "array", "items": { "$ref": "#/definitions/asset" } },
    "passes": { "type": "array", "items": { "$ref": "#/definitions/pass" } },
    "presets": { "type": "array", "items": { "$ref": "#/definitions/preset" } },
    "script": { "$ref": "#/definitions/script" },
    "shaders": {
      "type": "object",
      "anyOf": [{ "required": ["glsl"] }, { "required": ["wgsl"] }],
      "properties": {
        "glsl": { "$ref": "#/definitions/shaderEntry" },
        "wgsl": { "$ref": "#/definitions/shaderEntry" }
      }
    }
  },
  "definitions": {
    "shaderEntry": {
      "oneOf": [
        { "type": "string" },
        { "type": "object", "additionalProperties": { "type": "string" } }
      ]
    },
    "control": {
      "type": "object",
      "required": ["name", "type"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "label": { "type": "string" },
        "description": { "type": "string" },
        "group": { "type": "string" },
        "type": { "enum": ["float", "int", "bool", "color", "enum", "point2d", "bang"] }
      },
      "allOf": [
        { "if": { "properties": { "type": { "enum": ["float", "int"] } } },
          "then": { "required": ["default"], "properties": {
            "default": { "type": "number" }, "min": { "type": "number" },
            "max": { "type": "number" }, "step": { "type": "number" } } } },
        { "if": { "properties": { "type": { "const": "bool" } } },
          "then": { "required": ["default"], "properties": { "default": { "type": "boolean" } } } },
        { "if": { "properties": { "type": { "const": "color" } } },
          "then": { "required": ["default"], "properties": {
            "default": { "type": "array", "items": { "type": "number" }, "minItems": 4, "maxItems": 4 } } } },
        { "if": { "properties": { "type": { "const": "enum" } } },
          "then": { "required": ["default", "options"], "properties": {
            "default": { "type": "string" },
            "options": { "type": "array", "items": { "type": "string" }, "minItems": 1 } } } },
        { "if": { "properties": { "type": { "const": "point2d" } } },
          "then": { "required": ["default"], "properties": {
            "default": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 } } } }
      ]
    },
    "asset": {
      "type": "object",
      "required": ["name", "type", "path"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "type": { "const": "texture2d" },
        "path": { "type": "string", "minLength": 1 },
        "sampling": {
          "type": "object",
          "properties": {
            "filter": { "enum": ["nearest", "linear", "mipmap"] },
            "wrap": { "enum": ["clamp", "repeat", "mirror"] }
          }
        }
      }
    },
    "renderTarget": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "width": { "type": "number" },
        "height": { "type": "number" },
        "scale": { "type": "number", "exclusiveMinimum": 0 },
        "format": { "enum": ["rgba8", "rgba16f", "rgba32f"] },
        "persistent": { "type": "boolean" }
      }
    },
    "pass": {
      "type": "object",
      "required": ["name", "shader"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "shader": { "type": "string", "minLength": 1 },
        "inputs": { "type": "array", "items": { "type": "string" } },
        "clear": { "type": "boolean" },
        "target": {
          "oneOf": [{ "const": "screen" }, { "$ref": "#/definitions/renderTarget" }]
        }
      }
    },
    "preset": {
      "type": "object",
      "required": ["name", "path"],
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "path": { "type": "string", "minLength": 1 }
      }
    },
    "script": {
      "type": "object",
      "required": ["entry"],
      "properties": {
        "entry": { "type": "string", "minLength": 1 },
        "events": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["input", "on", "handler"],
            "properties": {
              "input": { "type": "string", "minLength": 1 },
              "on": { "enum": ["change", "offToOn", "onToOff", "whileOn", "whileOff"] },
              "handler": { "type": "string", "minLength": 1 }
            }
          }
        }
      }
    }
  }
}
```

---

## 13. Delta vs. current implementation

The following are canonical here but not yet reflected in code — each is a small, isolated
follow-up, **not** a format change:

1. **`version` field** — add optional `version: string` to `manifest.ts` types + `validate.ts`.
2. **`enum` default-in-`options`** — add validation rule.
3. **`float`/`int` `min ≤ default ≤ max`** — add validation rule.
4. **Float render targets** — `RenderTargetPool` should map `spec.format` through to the
   ExoJS `RenderTexture({ format })` (0.15.3), with `supportsColorFormat()` probe → `rgba8`
   fallback. (Tracked separately as task A1.)

Items 1–3 harden the manifest contract; item 4 activates the already-specified `format`
field now that the engine supports it.
