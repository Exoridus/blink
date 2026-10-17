# 04 — ISF Overview

## What ISF is

**ISF** stands for **Interactive Shader Format**. It is a compact GLSL-oriented format that combines:

- a GLSL shader body
- a JSON header at the beginning of the same file

Its goal is to make image filters and generative video sources portable across hosts.

## Typical file shape

```glsl
/*{
  "ISFVSN": "2.0",
  "DESCRIPTION": "Example",
  "CREDIT": "Author",
  "INPUTS": [],
  "PASSES": []
}*/

void main() {
  // shader body
}
```

## Core concepts

### Inputs

ISF declares shader-facing values through `INPUTS`, including types such as:

- `event`
- `bool`
- `long`
- `float`
- `point2D`
- `color`
- `image`
- `audio`
- `audioFFT`

Hosts can create UI and bind uniforms from these declarations.

### Built-ins

Common built-ins include:

- `PASSINDEX`
- `RENDERSIZE`
- `isf_FragNormCoord`
- `TIME`
- `TIMEDELTA`
- `DATE`
- `FRAMEINDEX`

### Image helpers

ISF provides helper functions such as:

- `IMG_PIXEL()`
- `IMG_NORM_PIXEL()`
- `IMG_SIZE()`

These abstract image sampling across texture types.

### Passes

ISF supports multiple passes via `PASSES`.

Pass entries can define:

- `TARGET`
- `PERSISTENT`
- `FLOAT`
- `WIDTH`
- `HEIGHT`

Persistent buffers let a shader accumulate state across frames.

### Imported assets

`IMPORTED` registers package-local image assets.

### Conventions

- Filters commonly use `inputImage`.
- Transitions commonly use `startImage`, `endImage`, and `progress`.

## Strengths

- very small format
- mature and host-neutral
- excellent for portable image effects
- compact one-file authoring
- good import source for Blink

## Limitations relative to Blink

- not audio-visual-specific
- audio surface is generic compared with SSF or native Blink audio features
- no package concept for multiple shader backends, presets, or scripts
- rooted in GLSL

## Blink compatibility recommendation

Blink should support ISF through a native loader / adapter rather than converting every file first. The adapter should:

1. parse the JSON header
2. provide ISF built-ins and helper functions
3. map inputs / imported assets / passes into `BlinkEffectIR`
4. preserve source files where possible

An optional CLI converter can later emit native BlinkFX packages from ISF where useful.
