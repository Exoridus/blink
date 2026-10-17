# BlinkFX v1 - Final-Candidate Specification

**Format tag:** `blinkfx/1`

**Package extension:** `.blinkfx`

**Status:** unreleased Final Candidate R2; target contract, with implementation boundaries in [the contract index](README.md). The scripting authoring and worker clarification is in [scripting.md](scripting.md).

## 1. Design goals

BlinkFX v1 is a portable, deterministic, inspectable package format for real-time GPU visual effects with optional synchronized audio output. It must be capable of representing Blink-native effects and of acting as a normalized target for ISF, Shadertoy and SSF converters without making the Blink renderer understand those source formats directly.

Normative goals:

- one package contains every file needed by the effect except host-provided inputs;
- one package may produce visual output, audio output, or both;
- rendering is explicit: shaders, passes, render targets and sampler dependencies are declared;
- controls are backend-neutral and stable across GLSL/WGSL implementations;
- feedback and multipass behavior are deterministic;
- unsupported requirements fail explicitly unless the package declares a fallback;
- source-format compatibility is optional metadata/ABI, never implicit renderer magic;
- scripts are optional and use a versioned ABI;
- existing July-2026 `blinkfx/1` packages remain valid.

## 2. Package layout

A package may be an unpacked directory or a packed archive with `.blinkfx` extension.

```text
my-effect.blinkfx/
  manifest.json                    # required
  shaders/
    main.frag.glsl                 # at least one shader implementation required
    main.vert.glsl                 # optional
    main.wgsl                      # optional backend implementation
    common.glsl                    # optional local include
  assets/
    noise.png                      # optional
  presets/
    default.json                   # optional
  scripts/
    main.js                        # optional
  thumbnail.webp                   # optional
  docs/                            # optional, ignored by runtime
```

Paths are package-relative. Runtime resolution MUST NOT escape the package root.

## 3. Minimal manifest

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

If `passes` is omitted and visual output is enabled (the default), the runtime synthesizes:

```json
{
    "name": "main",
    "shader": "main",
    "inputs": [],
    "target": "screen",
    "clear": true
}
```

If `outputs.visual` is `false`, no implicit visual pass is synthesized. A string-valued shader backend binds to implicit shader key `main`.

## 4. Top-level manifest fields

| Field           | Type         | Required | Default              | Meaning                                          |
| --------------- | ------------ | -------: | -------------------- | ------------------------------------------------ |
| `format`        | string       |      yes | -                    | exactly `blinkfx/1`                              |
| `id`            | string       |      yes | -                    | stable package identity; reverse-DNS recommended |
| `title`         | string       |      yes | -                    | display title                                    |
| `version`       | string       |       no | -                    | package version; semver recommended              |
| `author`        | string       |       no | -                    | attribution                                      |
| `description`   | string       |       no | -                    | human description                                |
| `license`       | string       |       no | -                    | license/SPDX-like identifier or text             |
| `thumbnail`     | string       |       no | -                    | package-relative preview image                   |
| `tags`          | string[]     |       no | `[]`                 | discovery metadata                               |
| `kind`          | enum         |       no | `generator`          | visual role: `generator`, `filter`, `transition` |
| `outputs`       | object       |       no | `{ "visual": true }` | visual/audio output declaration                  |
| `controls`      | Control[]    |       no | `[]`                 | user-editable state                              |
| `inputs`        | Input[]      |       no | `[]`                 | host-provided data/resources                     |
| `assets`        | Asset[]      |       no | `[]`                 | package-local textures                           |
| `passes`        | Pass[]       |       no | implicit pass        | ordered fullscreen fragment passes               |
| `shaders`       | ShaderSet    |      yes | -                    | one or more backend implementations              |
| `presets`       | PresetRef[]  |       no | `[]`                 | curated control states                           |
| `script`        | ScriptSpec   |       no | -                    | optional versioned script ABI                    |
| `requirements`  | Requirements |       no | strict inferred set  | explicit runtime requirements                    |
| `fallbacks`     | object       |       no | `{}`                 | allowed degradation policy                       |
| `compatibility` | object       |       no | -                    | source provenance/adapter profile                |
| `diagnostics`   | object       |       no | -                    | tooling-only metadata                            |

Unknown top-level fields are ignored for additive forward compatibility.

## 5. Effect kind

`kind` tells the host how the effect participates in a visual graph. It does **not** create hidden uniforms.

- `generator`: produces an image without requiring an incoming image.
- `filter`: consumes one or more image inputs and produces an image.
- `transition`: consumes at least two image inputs plus a progress/control value by package convention.

All actual values remain explicit in `inputs` / `controls`; converters may preserve source-format names (`inputImage`, `startImage`, `endImage`, `progress`) through `compatibility` metadata.

## 6. Controls

Base fields:

```ts
type ControlType = 'float' | 'int' | 'bool' | 'color' | 'enum' | 'point2d' | 'bang';
```

All controls may define `name`, `label`, `description`, and `group`. `name` is unique within the package.

| Type      | Required value data                        | Shader form      |
| --------- | ------------------------------------------ | ---------------- |
| `float`   | numeric `default`; optional `min/max/step` | float            |
| `int`     | integer `default`; optional `min/max/step` | int              |
| `bool`    | boolean `default`                          | bool             |
| `color`   | `[r,g,b,a]`                                | vec4             |
| `enum`    | string `default`; nonempty `options`       | int option index |
| `point2d` | `[x,y]`; optional pair `min/max`           | vec2             |
| `bang`    | no durable default                         | event only       |

Validation rules:

- names nonempty and unique;
- numeric defaults finite;
- `min <= default <= max` when bounds exist;
- enum default MUST occur in options;
- `bang` does not create durable shader state unless a script/host explicitly converts it to one.

## 7. Host inputs

`inputs` are values/resources supplied by the host rather than package-local assets. They describe required live sources, not source-format-specific variable names.

```ts
type InputType = 'image' | 'audio' | 'audioFFT' | 'audioTexture' | 'pointer' | 'keyboard';
```

### 7.1 Image

```json
{
    "name": "sourceImage",
    "type": "image",
    "required": true
}
```

An `image` is a logical 2D frame texture. Its producer may be a still image, video, camera, screen capture, another visual node, `HTMLVideoElement`, `VideoFrame`, canvas, or any host-provided frame source. BlinkFX does not need separate `video`, `camera` or `screen` shader resource types in v1.

### 7.2 Audio waveform

```json
{
    "name": "waveform",
    "type": "audio",
    "samples": 512
}
```

The runtime exposes a texture/image-like waveform sample surface. Samples are normalized by the selected native or compatibility profile. `samples` is a requested width. Hosts SHOULD honor it exactly where the profile requires exact width; otherwise they MUST report a compatibility warning.

### 7.3 Audio FFT

```json
{
    "name": "fft",
    "type": "audioFFT",
    "samples": 512
}
```

This exposes a generic FFT texture surface. It is intentionally distinct from richer Blink native spectrum surfaces and from compatibility-specific packings.

### 7.4 Combined audio texture

```json
{
    "name": "musicTexture",
    "type": "audioTexture",
    "samples": 512,
    "representation": "spectrum-waveform"
}
```

`audioTexture` exists for foreign shader APIs that expect multiple audio views in one texture. v1 standard representation:

- `representation: "spectrum-waveform"`;
- logical size `samples × 2`;
- row 0 = FFT/spectrum;
- row 1 = waveform;
- channel packing and numeric normalization are defined by the selected native/compatibility profile.

The Shadertoy compatibility profile uses this representation for audio-bound `iChannelN` inputs. Blink MAY generate it directly from the same analyser state used for native audio surfaces; it MUST NOT silently substitute SSF/Synesthesia spectrum semantics.

### 7.5 Pointer

```json
{
    "name": "pointer",
    "type": "pointer"
}
```

A pointer input requests the host's primary pointing-device state. Native Blink shader ABI exposes:

```glsl
uniform vec2  bl_pointerPosition;     // output-space pixels, bottom-left origin
uniform vec2  bl_pointerPressOrigin;  // most recent primary-button press position
uniform float bl_pointerDown;         // 1.0 while primary button is held, otherwise 0.0
uniform float bl_pointerActive;       // 1.0 when a pointer is present/known
```

The host converts browser/input-system coordinates into root output pixel coordinates. Compatibility profiles may repack this state, for example into Shadertoy `iMouse`. Pass-local resolution does not rescale pointer coordinates unless the compatibility profile explicitly requires it.

### 7.6 Keyboard

```json
{
    "name": "keyboard",
    "type": "keyboard"
}
```

A keyboard input exposes key state to scripts and a standardized GPU texture representation. Native v1 keyboard texture:

- size `256 × 3`;
- `rgba8`;
- R channel contains the state; G/B/A are reserved/zero;
- row 0: key currently down (`0` or `255`);
- row 1: key transitioned to down since the previous rendered frame;
- row 2: persistent toggle bit flipped on each down transition;
- x index is the compatibility key code `0..255`.

This representation is intentionally compatible with the common Shadertoy keyboard-texture model. Hosts with richer input APIs may expose additional script-side information, but shaders must not assume more than this v1 texture contract.

### 7.7 Host-input lifetime

Host inputs are sampled/snapshotted at the beginning of the logical BlinkFX frame. Scripts and visual passes for that frame observe a consistent input snapshot unless a compatibility ABI explicitly specifies same-frame mutation behavior. Audio output generation may operate ahead of visual presentation; its control/input snapshot rules are defined in §12.

## 8. Assets

v1 package-local asset type:

```json
{
    "name": "noise",
    "type": "texture2d",
    "path": "assets/noise.png",
    "sampling": {
        "filter": "linear",
        "wrap": "repeat"
    }
}
```

Filtering: `nearest | linear | mipmap`.

Wrapping: `clamp | repeat | mirror`.

Asset names are unique. Runtime image decode failures are load errors unless an explicit fallback exists.

## 9. Shader set

The July v1 forms remain valid:

```json
"shaders": { "glsl": "shaders/main.frag.glsl" }
```

```json
"shaders": {
  "glsl": {
    "main": "shaders/main.frag.glsl",
    "feedback": "shaders/feedback.frag.glsl"
  }
}
```

v1 final-candidate additionally allows explicit visual or audio program descriptors:

```json
"shaders": {
  "glsl": {
    "main": {
      "fragment": "shaders/main.frag.glsl",
      "vertex": "shaders/main.vert.glsl"
    },
    "sound": {
      "audio": "shaders/sound.glsl"
    }
  },
  "wgsl": {
    "main": "shaders/main.wgsl"
  }
}
```

Semantics:

- GLSL string = visual fragment source with runtime fullscreen vertex stage.
- GLSL visual object = required `fragment`, optional `vertex`.
- GLSL audio object = required `audio`; it is consumed by the audio-output execution path, not compiled as a normal visual pass.
- WGSL string = combined visual module containing/receiving the runtime's required entry points. Audio-output WGSL is not required for v1 conformance; a package may restrict audio generation to WebGL2/GLSL through `requirements.backends`.
- a pass key may exist in one backend only; runtime chooses a backend only when all passes required by the package exist for it.
- package-local `#include "relative/path.glsl"` is supported by Blink's shader preprocessor and may only resolve within the package root.

## 10. Native shader ABI

### 10.1 Core built-ins

Native BlinkFX v1 freezes the flat ABI because it matches the implemented direction and is easiest to adapt across GLSL/WGSL:

```glsl
uniform float bl_time;
uniform float bl_deltaTime;
uniform int   bl_frame;
uniform vec2  bl_resolution;
uniform int   bl_pass;
```

`bl_resolution` is the current pass output resolution, not necessarily the root screen resolution.

When a `pointer` host input is declared, the pointer uniforms from §7.5 are also available.

### 10.2 Controls

Durable controls are exposed by control `name` using the shader type in §6.

### 10.3 Textures/resources

Native BlinkFX does **not** require globally fixed sampler names for assets, host inputs or audio surfaces. Samplers are bound by pass input declarations (§13), which removes the old `blinkSpectrum` vs `fx_spectrum` naming conflict.

Compatibility profiles may inject fixed aliases such as ISF or SSF sampler names.

### 10.4 Native audio scalars

Blink may expose a stable native audio scalar block. v1 minimum:

```glsl
uniform float au_level;
uniform float au_bass;
uniform float au_mid;
uniform float au_high;
uniform float au_rms;
uniform float au_onset;
uniform float au_bpm;
uniform float au_bpmConfidence;
uniform float au_beatPhase;
uniform float au_pulse;
uniform float au_barPulse;
```

Values are defined by Blink's native audio-analysis contract, not by SSF. Source-format converters that require different semantics use their own compatibility surface.

## 11. Native built-in audio textures

Two Blink-native source references are reserved:

- `blink.audio.spectrum`
- `blink.audio.levelTrail`

Current Blink native target packing (the SSF adapter may expose a separately validated compatibility view):

### `blink.audio.spectrum`

1024×1 `rgba32f`:

- R raw spectrum
- G Blink enhanced/weighted spectrum
- B Blink smooth spectrum
- A waveform

### `blink.audio.levelTrail`

400×1 `rgba32f`:

- R overall level history
- G bass history
- B mid history
- A high history

These are **source references**, not mandatory sampler uniform names. A native package should explicitly bind them to its own sampler names. Generic `input.<name>` audio/audioFFT/audioTexture inputs remain separate resources and are not aliases of these Blink-native surfaces.

## 12. Outputs and optional audio generation

Visual output is enabled by default. Audio output is opt-in.

```json
{
    "outputs": {
        "visual": true,
        "audio": {
            "shader": "sound",
            "abi": "blink-audio/1",
            "channels": 2,
            "sampleRate": "device"
        }
    }
}
```

Fields:

- `visual`: boolean, default `true`. When `false`, no implicit visual pass is synthesized.
- `audio.shader`: shader key referring to an `audio` program descriptor.
- `audio.abi`: audio shader ABI; default `blink-audio/1`. Compatibility profiles may define identifiers such as `shadertoy-sound/1`.
- `audio.channels`: v1 supports `1` or `2`; Shadertoy Sound conversion requires `2`.
- `audio.sampleRate`: `"device"` or a positive integer requested sample rate. Runtime MAY resample when the device rate differs, but MUST report that it did so.

### 12.1 Native `blink-audio/1` GLSL ABI

An audio program provides:

```glsl
vec2 renderSound(float timeSeconds, int sampleIndex);
```

Runtime-provided values include:

```glsl
uniform float bl_audioSampleRate;
```

`renderSound` returns normalized PCM in `[-1, +1]`; mono output uses `.x`. The runtime-generated wrapper evaluates many sample indices in one GPU dispatch/draw and writes them into a float render target for asynchronous readback.

### 12.2 Audio execution model

Audio output does **not** run once per visual frame. The runtime owns a block scheduler:

```text
audio shader
  → generate N future samples on GPU
  → float target
  → async GPU readback
  → PCM queue/ring buffer
  → AudioWorklet source
  → ExoJS/Web Audio bus
```

Required invariants:

- audio generation uses an absolute monotonically increasing sample index/time;
- the audio worklet never waits on the GPU or main thread;
- enough PCM is buffered ahead to tolerate normal GPU/readback jitter;
- underrun outputs silence and increments diagnostics rather than blocking the audio thread;
- package deactivation stops generation, clears queued PCM and releases GPU/audio resources;
- output is routed through Blink/ExoJS audio buses like other generated audio.

### 12.3 Controls and ahead buffering

Controls/input state are snapshotted when an audio block is generated. A change cannot retroactively alter samples already queued to the audio device. Blink SHOULD keep the lookahead buffer as small as stability permits and expose current buffered duration in diagnostics. Sample-accurate automation of arbitrary controls is not guaranteed by v1 unless a future/native API explicitly timestamps those control changes.

### 12.4 Shadertoy Sound

The `shadertoy/1` compatibility profile may preserve/translate `mainSound` into the audio-output path. The converter is responsible for supplying Shadertoy sound built-ins such as sample rate/time semantics. A Shadertoy package may therefore contain Common, visual Buffer/Image passes and Sound output together in one `.blinkfx` package.

## 13. Passes

A pass is an ordered fullscreen fragment operation:

```json
{
    "name": "feedback",
    "shader": "feedback",
    "inputs": [
        { "source": "target.feedback.previous", "uniform": "uPrevious" },
        { "source": "asset.noise", "uniform": "uNoise" },
        { "source": "blink.audio.spectrum", "uniform": "uSpectrum" }
    ],
    "target": {
        "name": "feedback",
        "scale": 0.5,
        "format": "rgba16f",
        "persistent": true
    },
    "clear": false
}
```

### 13.1 Pass fields

| Field    | Required | Default  |
| -------- | -------: | -------- |
| `name`   |      yes | -        |
| `shader` |      yes | -        |
| `inputs` |       no | `[]`     |
| `target` |       no | `screen` |
| `clear`  |       no | `true`   |

Names are unique and pass execution order is the array order.

### 13.2 Input binding forms

Legacy July syntax remains valid:

```json
"inputs": ["feedback.previous", "noise"]
```

It binds samplers in shader declaration order.

The recommended final form is explicit:

```json
"inputs": [
  { "source": "target.feedback.previous", "uniform": "uPrev" },
  { "source": "asset.noise", "uniform": "uNoise" }
]
```

Canonical source forms:

- `asset.<name>` - package texture asset;
- `input.<name>` - host input;
- `target.<name>` - current-frame output of an earlier target;
- `target.<name>.previous` - previous-frame texture of a persistent target;
- `blink.audio.spectrum`;
- `blink.audio.levelTrail`.

Legacy bare asset/target names remain accepted for old packages, but converters SHOULD emit canonical names.

### 13.3 Dependency rules

- a pass may read any target produced earlier in the current frame;
- `.previous` may reference **any persistent target**, not only the pass's own target;
- reading the same physical texture being written in one draw is forbidden;
- persistent targets MUST use ping-pong or equivalent storage so `.previous` is physically distinct;
- a current-frame reference to a target that has not yet been produced is a validation error.

## 14. Render targets

`target: "screen"` presents to the current output. A target object creates/names an offscreen texture.

```json
{
    "name": "bufferA",
    "width": "$WIDTH / 2",
    "height": "$HEIGHT / 2",
    "format": "rgba16f",
    "persistent": true
}
```

Fields:

| Field        | Type                        | Default       |
| ------------ | --------------------------- | ------------- |
| `name`       | string                      | required      |
| `width`      | number or expression string | screen width  |
| `height`     | number or expression string | screen height |
| `scale`      | positive number             | -             |
| `format`     | `rgba8                      | rgba16f       | rgba32f` | `rgba8` |
| `persistent` | bool                        | false         |

Rules:

- use `scale` OR width/height sizing, not both;
- if neither is supplied, target is screen-sized;
- if only one explicit dimension is supplied, the missing dimension defaults to corresponding screen dimension;
- resize reallocates the physical textures and resets persistent history;
- unsupported formats are errors by default; downgrade requires explicit fallback.

### 14.1 Size expression language

Expressions exist primarily to losslessly represent ISF pass sizing.

Allowed:

- finite numeric literals;
- `+ - * / %` and parentheses;
- `$WIDTH`, `$HEIGHT`;
- `$<controlName>` for numeric/bool controls;
- functions `min`, `max`, `floor`, `ceil`, `round`, `abs`, `clamp`.

Forbidden:

- arbitrary JavaScript;
- assignment;
- property access;
- loops/functions defined by package code;
- network/DOM/global access.

Expression results are clamped to integer dimensions >= 1 and to backend maximum texture size.

## 15. Presets

Manifest reference:

```json
{ "name": "default", "path": "presets/default.json" }
```

Preset file:

```json
{
    "name": "Default",
    "values": {
        "intensity": 0.7,
        "palette": "aurora"
    }
}
```

Preset values address controls, not backend shader implementation details.

## 16. Scripting

Scripting is optional but represented in v1 so full source-format conversion does not require a future manifest major version.

```json
{
    "script": {
        "entry": "scripts/main.js",
        "language": "javascript",
        "abi": "blink/1"
    }
}
```

For preserved SSF scripts:

```json
{
    "script": {
        "entry": "script.js",
        "language": "javascript",
        "abi": "ssf/1"
    }
}
```

Fields:

- `entry` required;
- `language` defaults to `javascript`; only JavaScript is a runtime v1 requirement;
- `abi` defaults to `blink/1`;
- legacy July `events` remains accepted for `blink/1` manifest-bound handlers.

The manifest defines the ABI, **not the execution thread**. Blink may use the main thread, a dedicated Worker, or another implementation while preserving observable ABI semantics.

### 16.1 `blink/1` native script ABI

```ts
interface BlinkScriptModule {
    setup?(ctx: BlinkScriptContext): void | Promise<void>;
    update?(ctx: BlinkScriptContext, dt: number): void | Promise<void>;
    dispose?(ctx: BlinkScriptContext): void | Promise<void>;
}
```

The context exposes scoped controls, uniforms, time/audio snapshots, local resource handles, and event registration. It does not expose arbitrary ExoJS/Application/DOM/network access by contract.

Resource ownership is tied to script/effect lifetime.

### 16.2 Compatibility ABIs

Additional ABI identifiers such as `ssf/1` are legal. Their semantics live in dedicated compatibility specifications, not in the native Blink scripting contract.

## 17. Requirements

A package can state capabilities it cannot operate without:

```json
{
    "requirements": {
        "features": ["float-targets", "persistent-feedback", "script:ssf/1"],
        "backends": ["webgl2", "webgpu"]
    }
}
```

Canonical v1 feature identifiers include:

- `float-targets`
- `persistent-feedback`
- `dynamic-target-size`
- `external-image-inputs`
- `pointer-input`
- `keyboard-input`
- `audio-waveform-input`
- `audio-fft-input`
- `audio-texture-input`
- `audio-generation`
- `audio-spectrum`
- `audio-level-trail`
- `script:blink/1`
- `script:ssf/1`
- `sync-final-pass-readback`

If a required feature is absent and no allowed fallback applies, load MUST fail before rendering.

## 18. Fallbacks

Fallbacks are explicit opt-ins to semantic degradation.

```json
{
    "fallbacks": {
        "float-targets": "rgba8",
        "script": "fail"
    }
}
```

Recognized strategy vocabulary:

- `fail` - default; refuse to run;
- `disable` - omit nonessential feature;
- `rgba8` - downgrade target format;
- `approximate` - use a documented compatibility approximation.

Converters targeting fidelity SHOULD emit `fail` for features whose degradation would materially change output.

## 19. Compatibility provenance

```json
{
    "compatibility": {
        "source": {
            "format": "isf",
            "version": "2.0"
        },
        "profile": "isf/2",
        "mode": "preserve",
        "converter": "blinkfx-cli/1.0.0"
    }
}
```

This block supports diagnostics, auditing and future re-conversion. Runtime behavior is controlled by the referenced compatibility profile and actual package contents, not by source metadata alone.

## 20. Diagnostics

`diagnostics` is runtime-optional, tooling-oriented metadata. Examples:

- source warnings generated by converter;
- expected debug rows/patterns;
- known approximation notes;
- test fixture IDs.

It MUST NOT be required for correct rendering.

## 21. Validation and security invariants

Before executing package code or compiling shaders, validate:

- manifest shape and version;
- unique IDs/names;
- every shader/pass/resource reference resolves inside package;
- pass dependency order is acyclic within the current frame;
- `.previous` references only persistent targets;
- target sizes/expressions are valid and bounded;
- required backend/features are available;
- no package path traversal;
- script entry language/ABI is recognized;
- sampler binding names do not conflict within a pass;
- audio-output shader/ABI/channel declarations resolve and required audio-generation capability is available.

Shaders/scripts remain untrusted package content. Web Worker execution is isolation, not a complete security sandbox; network/DOM/security policy must be enforced separately if arbitrary community packages are supported.

## 22. Versioning

`blinkfx/1` is the package/manifest major contract.

- additive optional fields and new recognized requirement identifiers MAY be added within v1;
- existing valid v1 manifests must continue to load;
- changing required fields, pass/output semantics, control semantics or existing field meaning requires `blinkfx/2`;
- script ABIs are separately versioned (`blink/1`, `ssf/1`), allowing them to evolve independently.
