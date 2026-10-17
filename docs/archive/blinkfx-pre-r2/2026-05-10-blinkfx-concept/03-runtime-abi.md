# 03 — Native Runtime ABI

## Purpose

BlinkFX packages should stay compatible after BlinkFX 1.0 without carrying package-level Blink or ExoJS version constraints. The way to achieve that is not by freezing implementation internals, but by freezing a **small public ABI**:

- native shader built-ins
- native audio surface
- control binding rules
- native script context API
- package lifecycle semantics

## Shader ABI

### Design goals

- stable names
- compact surface
- same conceptual data in GLSL and WGSL
- enough information for rich audio-reactive visualisation
- no need to redeclare standard inputs in every manifest

## GLSL surface

```glsl
#version 300 es
precision highp float;

layout(std140) uniform BlinkFrame {
  vec2 resolution;
  float time;
  float deltaTime;
  int frame;
  int passIndex;
} blink;

layout(std140) uniform BlinkAudio {
  float level;

  float bass;
  float mid;
  float midHigh;
  float high;

  float hit;
  float bassHit;
  float midHit;
  float midHighHit;
  float highHit;

  float presence;
  float bassPresence;
  float midPresence;
  float midHighPresence;
  float highPresence;

  float beatPulse;
  float barPulse;
  float beatPhase;
  float bpm;
  float bpmConfidence;
} audio;

uniform sampler2D blinkSpectrum;
uniform sampler2D blinkLevelTrail;

out vec4 fragColor;
```

### WGSL surface

```wgsl
struct BlinkFrame {
  resolution: vec2f,
  time: f32,
  deltaTime: f32,
  frame: u32,
  passIndex: u32,
};

struct BlinkAudio {
  level: f32,

  bass: f32,
  mid: f32,
  midHigh: f32,
  high: f32,

  hit: f32,
  bassHit: f32,
  midHit: f32,
  midHighHit: f32,
  highHit: f32,

  presence: f32,
  bassPresence: f32,
  midPresence: f32,
  midHighPresence: f32,
  highPresence: f32,

  beatPulse: f32,
  barPulse: f32,
  beatPhase: f32,
  bpm: f32,
  bpmConfidence: f32,
};

@group(0) @binding(0) var<uniform> blink: BlinkFrame;
@group(0) @binding(1) var<uniform> audio: BlinkAudio;
@group(0) @binding(2) var blinkSpectrum: texture_2d<f32>;
@group(0) @binding(3) var blinkLevelTrail: texture_2d<f32>;
@group(0) @binding(4) var blinkSampler: sampler;
```

## Audio surface

### Scalar fields

| Field | Meaning |
|---|---|
| `audio.level` | smoothed whole-spectrum level |
| `audio.bass`, `audio.mid`, `audio.midHigh`, `audio.high` | smoothed band levels |
| `audio.hit`, `audio.bassHit`, ... | transient envelopes |
| `audio.presence`, `audio.bassPresence`, ... | slower energy / presence envelopes |
| `audio.beatPulse` | decaying pulse on each beat |
| `audio.barPulse` | decaying pulse on downbeat / bar start |
| `audio.beatPhase` | `0..1` phase through current beat |
| `audio.bpm` | tracked tempo |
| `audio.bpmConfidence` | confidence / stability measure |

### Data textures

#### `blinkSpectrum`

Recommended v1 packing:

- `r` — raw FFT
- `g` — perceptual / juiced FFT
- `b` — smooth FFT
- `a` — waveform

#### `blinkLevelTrail`

Recommended v1 packing:

- `r` — whole-spectrum level over time
- `g` — bass level over time
- `b` — mid level over time
- `a` — high level over time

## Why this is realistic now

The current ExoJS main branch already has the primitives needed for this layer:

- `AudioAnalyser` exposes raw and float spectrum data, raw and float waveform data, RMS, arbitrary band energy, and mel/log remapping helpers.
- `BeatDetector` exposes tempo, confidence, beat/downbeat events, onset strength, visual pulse getters, and subdivision phase support.
- `DataTexture` supports CPU-uploaded textures and partial `commitRect()` updates, which is a natural fit for spectrum and level-trail textures.

Blink still needs its own `BlinkAudioFrame` / `BlinkAudioTextures` assembly layer, but it no longer needs major new engine primitives to mirror the SSF-style feature surface semantically.

## Control binding rules

- Every native BlinkFX control name becomes a shader-visible user uniform of the same name.
- `enum` controls bind as integers by index unless a future extension says otherwise.
- `bang` controls are script/UI events, not durable shader state.
- Backend-specific shader code must honour the manifest-level control contract.

## Native scripting API

### Design goals

- optional
- scoped
- resource-owned
- statically inspectable
- stable after 1.0
- no direct access to arbitrary engine internals

### Script module surface

```ts
export interface BlinkScriptModule {
  setup?(ctx: BlinkScriptContext): void | Promise<void>;
  update?(ctx: BlinkScriptContext, dt: number): void;
  dispose?(ctx: BlinkScriptContext): void;
}
```

### Manifest-bound event handlers

`manifest.json`:

```json
{
  "script": {
    "entry": "script.ts",
    "events": [
      {
        "input": "palette",
        "on": "change",
        "handler": "onPaletteChange"
      }
    ]
  }
}
```

`script.ts`:

```ts
export function setup(ctx: BlinkScriptContext): void {
  ctx.state.seed = 0;
}

export function onPaletteChange(
  ctx: BlinkScriptContext,
  value: BlinkControlValue,
  previousValue: BlinkControlValue,
): void {
  ctx.log('palette changed', value, previousValue);
}
```

### Script context

```ts
export interface BlinkScriptContext {
  readonly time: {
    readonly elapsed: number;
    readonly delta: number;
    readonly frame: number;
  };

  readonly audio: BlinkAudioFrame;
  readonly controls: BlinkControlApi;
  readonly uniforms: BlinkUniformApi;
  readonly resources: BlinkResourceScope;
  readonly state: Record<string, unknown>;

  log(...args: readonly unknown[]): void;
}
```

### Control API

```ts
export interface BlinkControlApi {
  get(name: string): BlinkControlValue;
  set(name: string, value: BlinkControlValue): void;
  setNormalized(name: string, value: BlinkControlValue): void;
  setDimension(name: string, dimension: number, value: number): void;
  randomize(name: string): void;
  reset(name: string): void;
}
```

### Uniform API

```ts
export interface BlinkUniformApi {
  set(name: string, value: BlinkUniformValue): void;
}
```

### Resource scope

```ts
export interface BlinkResourceScope {
  loadTexture(path: string): Promise<BlinkTexture>;
  createDataTexture(options: BlinkDataTextureOptions): BlinkDataTexture;
  createRenderTarget(options: BlinkRenderTargetOptions): BlinkRenderTarget;
  track<T extends BlinkDisposable>(resource: T): T;
}
```

### Lifecycle ownership

When an effect unloads:

1. script `dispose()` runs
2. subscriptions created by the effect are removed
3. resources owned by its resource scope are disposed
4. package assets are released
5. render targets are returned to pools or destroyed

## Native scripting vs SSF scripting

Native BlinkFX scripts are intentionally **not** global-variable scripts. SSF compatibility can emulate SSF's global API in the SSF loader; native BlinkFX keeps a scoped API to preserve cleanup and long-term stability.

## Compute shaders

### Recommendation

- **Do not include generic compute passes in BlinkFX v1.**
- Reserve an additive extension point for future native Blink-only packages.

### Rationale

ExoJS already demonstrates one useful pattern: domain-specific features can expose both a CPU path and a WebGPU compute path when the engine understands the operation. That does **not** mean arbitrary WGSL compute shaders automatically get a CPU fallback. Generic compute would therefore introduce:

- a WebGPU-only authoring path
- a new resource model
- a new fallback story
- substantial new validation and compatibility complexity

Compute is relevant later for advanced native effects such as particle fields, reaction-diffusion, or GPU simulations, but it should be added only when Blink has a concrete native use case.
