# 05 — SSF Overview

## What SSF is

**SSF** means **Synesthesia Shader Format**. It is a package-oriented scene format for Synesthesia built around a GLSL fragment shader, a JSON scene file, and optional supporting files.

## Typical `.synScene` layout

```text
sceneName.synScene/
├── main.glsl
├── scene.json
├── script.js          # optional
├── thumbnail.png
└── images/            # optional
```

## Core concepts

### Scene JSON

`scene.json` can include:

- metadata: `TITLE`, `CREDIT`, `DESCRIPTION`, `IMAGE_PATH`, `WIDTH`, `HEIGHT`
- `CONTROLS`
- `MEDIA`
- `PASSES`
- `HARD_TRANSITIONS`
- `SMOOTH_TRANSITIONS`
- `IMAGES`

### Standard shader built-ins

SSF provides built-ins such as:

- `RENDERSIZE`
- `TIME`
- `FRAMECOUNT`
- `_xy`
- `_uv`
- `_uvc`
- mouse / media / multipass related uniforms

### Audio surface

SSF is especially strong as an audio-visual format. It exposes:

- levels: `syn_Level`, `syn_BassLevel`, `syn_MidLevel`, `syn_MidHighLevel`, `syn_HighLevel`
- hits
- audio-reactive clocks / time fields
- presence fields
- beat / BPM fields
- `syn_Spectrum`
- `syn_LevelTrail`

`syn_Spectrum` packs raw FFT, juiced FFT, smooth FFT, and waveform data into RGBA channels. `syn_LevelTrail` stores level histories over time.

### Helper functions

SSF injects helper functions for:

- math
- noise
- coordinate transforms
- colour transforms
- media
- multipass operations

### Multipass and feedback

`PASSES` define extra buffers. `PASSINDEX` distinguishes pass execution, and `syn_FinalPass` offers simple feedback access.

### Optional JavaScript scripting

`script.js` runs before `main.glsl` each frame and supports:

- `setup()`
- `update(dt)`
- global input uniforms
- `setUniform()`
- control mutation helpers
- event registration helpers
- object-oriented persistent state
- `textureFinalPass(x, y)` pixel readback
- console/debug output

## Strengths

- very author-friendly for live visuals
- rich audio-reactive surface
- package-oriented
- useful controls and transitions
- optional scene-local logic layer

## Limitations relative to Blink-native design

- Synesthesia-specific names and behaviour
- scripting uses a broad global runtime surface
- some semantics are host-specific rather than portable
- GLSL-centred
- exact audio smoothing / juicing behaviour is not fully portable unless reproduced carefully

## Blink compatibility recommendation

Blink should support SSF through a compatibility loader that:

1. reads `.synScene` packages directly
2. preserves SSF shader source dialect
3. provides compatibility aliases / prelude for `syn_*`, standard uniforms, and helper functions
4. maps package data into `BlinkEffectIR`
5. supports the documented SSF scripting subset as far as practical

Native BlinkFX packages should **not** inherit SSF naming just because Blink can load SSF.
