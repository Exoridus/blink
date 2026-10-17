# 02 — Native `.blinkfx` Format

## Design principles

1. **Native, not hybrid.** BlinkFX is not a relabelled SSF or ISF file.
2. **Simple authoring surface.** A minimal effect should require only metadata and a shader.
3. **Stable ABI.** Standard time / resolution / audio inputs are part of BlinkFX 1.0, not repeated in every manifest.
4. **Fragment-first.** BlinkFX v1 is centred on fullscreen 2D fragment passes.
5. **Additive extensibility.** Later features may add fields; existing v1 packages remain valid.
6. **External compatibility stays external.** SSF and ISF are loaded through adapters, not baked into the native manifest.

## File / directory layout

### Unpacked authoring form

```text
hypercoil.blinkfx/
├── manifest.json
├── thumbnail.webp
├── shaders/
│   ├── main.frag.glsl
│   ├── feedback.frag.glsl
│   ├── main.frag.wgsl
│   └── feedback.frag.wgsl
├── assets/
│   └── noise.png
├── presets/
│   ├── default.json
│   └── intense.json
└── script.ts
```

### Packed distribution form

```text
hypercoil.blinkfx
```

The packed form is an archive containing the same relative paths as the unpacked directory.

## Minimal manifest

```json
{
  "format": "blinkfx/1",
  "id": "com.codexo.plasma",
  "title": "Plasma",
  "shaders": {
    "glsl": "shaders/main.frag.glsl"
  }
}
```

### Minimal defaults

If omitted:

- `passes` defaults to one implicit pass:
  - `name: "main"`
  - `shader: "main"`
  - `target: "screen"`
- a string-valued shader entry is bound to the implicit `main` shader
- absent optional arrays behave as empty arrays
- absent `script` means no script runtime is created
- absent `presets` means only current control defaults exist

## Full illustrative manifest

```jsonc
{
  "format": "blinkfx/1",
  "id": "com.codexo.hypercoil",
  "title": "Hypercoil",
  "author": "DIMA",
  "description": "Audio-reactive recursive tunnel with feedback trails.",
  "license": "MIT",
  "thumbnail": "thumbnail.webp",
  "tags": ["tunnel", "feedback", "audio-reactive"],

  "controls": [
    {
      "name": "intensity",
      "label": "Intensity",
      "type": "float",
      "default": 0.7,
      "min": 0,
      "max": 1,
      "step": 0.01,
      "group": "Motion"
    },
    {
      "name": "palette",
      "label": "Palette",
      "type": "enum",
      "default": "aurora",
      "options": ["aurora", "inferno", "mono"],
      "group": "Color"
    }
  ],

  "assets": [
    {
      "name": "noise",
      "type": "texture2d",
      "path": "assets/noise.png",
      "sampling": {
        "filter": "linear",
        "wrap": "repeat"
      }
    }
  ],

  "passes": [
    {
      "name": "feedback",
      "shader": "feedback",
      "inputs": ["feedback.previous", "noise", "blink.audio.spectrum"],
      "target": {
        "name": "feedback",
        "scale": 0.5,
        "format": "rgba8",
        "persistent": true
      }
    },
    {
      "name": "main",
      "shader": "main",
      "inputs": ["feedback"],
      "target": "screen"
    }
  ],

  "shaders": {
    "glsl": {
      "feedback": "shaders/feedback.frag.glsl",
      "main": "shaders/main.frag.glsl"
    },
    "wgsl": {
      "feedback": "shaders/feedback.frag.wgsl",
      "main": "shaders/main.frag.wgsl"
    }
  },

  "presets": [
    { "name": "default", "path": "presets/default.json" },
    { "name": "intense", "path": "presets/intense.json" }
  ],

  "script": {
    "entry": "script.ts",
    "events": [
      {
        "input": "palette",
        "on": "change",
        "handler": "onPaletteChange"
      },
      {
        "input": "randomize",
        "on": "offToOn",
        "handler": "onRandomize"
      }
    ]
  }
}
```

## Field reference

| Field | Required | Purpose | Closest SSF equivalent | Closest ISF equivalent |
|---|---:|---|---|---|
| `format` | yes | Native format version | none | `ISFVSN` conceptually |
| `id` | yes | Stable package identity | none | none |
| `title` | yes | Human-facing title | `TITLE` | no strict title field |
| `author` | no | Author / credit | `CREDIT` | `CREDIT` |
| `description` | no | Description | `DESCRIPTION` | `DESCRIPTION` |
| `license` | no | Redistribution terms | none | none |
| `thumbnail` | no | Package preview image | `IMAGE_PATH` | none |
| `tags` | no | Discovery metadata | none | `CATEGORIES` roughly |
| `controls` | no | User-editable parameters | `CONTROLS` | scalar / color / event `INPUTS` |
| `assets` | no | Package-local textures | `IMAGES` | `IMPORTED` |
| `passes` | no | Ordered fragment-pass description | `PASSES` | `PASSES` |
| `shaders` | yes | Backend shader files | implicit `main.glsl` | the ISF shader file itself |
| `presets` | no | Curated looks | host / script convention | none |
| `script` | no | Native Blink script module | `script.js` | none |

## Controls

### Supported v1 control types

- `float`
- `int`
- `bool`
- `color`
- `enum`
- `point2d`
- `bang`

### Design notes

- Native BlinkFX separates **control type** from **UI representation** more cleanly than SSF.
- A control name becomes the user-uniform name exposed to shaders and scripts.
- Presets target control names, not backend-specific shader details.

## Assets

v1 assets are intentionally modest:

- `texture2d`
- package-local file path
- sampler hints (`filter`, `wrap`)

Future additive types may include LUTs, masks, or other package-local data, but they should not be added before a concrete use case exists.

## Passes

### v1 pass model

- ordered list
- fragment passes only
- each pass names the shader implementation it uses
- each pass writes either to `screen` or to a named render target
- named targets can be persistent for feedback
- inputs may refer to:
  - package assets
  - prior targets
  - `target.previous` for previous-frame feedback
  - built-in Blink textures such as `blink.audio.spectrum`

### Why not expose a full graph in the manifest?

Because it makes authoring heavier without improving the common case. Blink should derive a richer internal render graph from the simple external pass list.

## Presets

Example preset file:

```json
{
  "name": "intense",
  "values": {
    "intensity": 0.95,
    "palette": "inferno"
  }
}
```

Presets are separate files so they remain diffable, shareable, and independently editable.

## Scripting

Native BlinkFX scripts are optional and use a scoped API, not global host functions. See `03-runtime-abi.md`.

## Future extensions deliberately excluded from v1

- generic compute passes
- panels
- masks
- video / camera inputs
- package dependencies
- arbitrary package-defined UI components
- arbitrary engine access from scripts

These may be added later **only if concrete use cases justify them**. The v1 format should not speculate itself into a platform it does not need to become.
