# ISF and Shadertoy compatibility

Both formats convert into ordinary `blinkfx/1` packages that keep the source shader and declare a
compatibility profile (`isf/2`, `shadertoy/1`). The profiles are small: the source-format built-ins
are macros over the native ABI, and the runtime supplies only the values that have no native
equivalent. See `ssf-compatibility.md` for the profile mechanism.

```
npm run blinkfx -- convert <.fs file or directory>...   --out <dir> --format isf
npm run blinkfx -- convert <.json file or directory>... --out <dir> --format shadertoy [--license <text>]
```

Each writes one package per shader, a `report.json` and a `catalog.json`.

## ISF (`isf/2`)

The JSON header is parsed from the first block comment (line comments and trailing commas are
tolerated); the shader body keeps its line numbers. The shader's own `main()` is kept.

| ISF                                 | BlinkFX                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `float`, `bool`, `point2D`, `color` | `float`, `bool`, `point2d`, `color` controls                                                                                      |
| `long`                              | `int` control spanning `VALUES`; `LABELS` and `VALUES` are kept under `compatibility.controls`                                    |
| `event`                             | `bool` control; the profile reads it as true for one frame after each rising edge                                                 |
| `image`                             | optional `image` host input (a filter's `inputImage`, a transition's `startImage`/`endImage`)                                     |
| `audio`, `audioFFT`                 | `audio`, `audioFFT` host inputs; `MAX` is the requested sample width                                                              |
| `IMPORTED`                          | `texture2d` assets; a file that is not next to the shader is an error, never a placeholder                                        |
| `PASSES`                            | A target pass per entry with `TARGET`; `PERSISTENT` and `FLOAT` (`rgba16f`) carry over; a pass without a target writes the screen |
| `WIDTH` / `HEIGHT`                  | Number or equation, checked against the size-expression grammar and carried over verbatim                                         |

`PASSINDEX`, `RENDERSIZE`, `TIME`, `TIMEDELTA`, `FRAMEINDEX` are macros over the native built-ins,
`isf_FragNormCoord` is set at the top of `main()`, `DATE` is a profile uniform, and the `IMG_*`
helpers are macros over `texture`/`textureSize`. A persistent buffer is read as the previous frame
in its own pass and as this frame's result in later passes, and is never cleared.

An equation that needs a function the grammar lacks (for example `sqrt`) fails the conversion
with the equation named. A companion `.vs` is reported and not run; cube-map imports fail.
Every `image` input is optional because the host has no producer for it yet: an unbound filter
sees transparent black.

## Shadertoy (`shadertoy/1`)

The input is the API's export JSON (`{ "Shader": { "info": ..., "renderpass": [...] } }`), or a
pasted Image source. The `mainImage` entry point is kept and called from a generated `main()`.

| Shadertoy              | BlinkFX                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Common                 | placed ahead of every pass and of the sound program                                                   |
| Buffer A-D             | persistent `rgba32f` targets, run in order A, B, C, D, then Image                                     |
| a buffer channel       | `target.<buffer>` when that buffer runs earlier, `target.<buffer>.previous` for itself and later ones |
| texture channel        | `texture2d` asset with the channel's filter and wrap; a missing file is an error                      |
| keyboard channel       | `keyboard` host input (the standard 256x3 texture)                                                    |
| music / mic channel    | `audioTexture` host input, 512x2, row 0 spectrum, row 1 waveform                                      |
| webcam / video channel | optional `image` host input                                                                           |
| `iMouse`               | `pointer` host input, repacked in `main()`; only for a shader that reads it                           |
| Sound pass             | `outputs.audio` with `shadertoy-sound/1` (see `audio-output.md`)                                      |
| cube map, volume       | the conversion fails with the channel named                                                           |

`iResolution`, `iTime`, `iTimeDelta`, `iFrame`, `iFrameRate` and `iSampleRate` are macros;
`iDate` is a profile uniform with a zero-based month; `iChannelResolution` is filled from the
bound textures; `iChannelTime` is zero. A channel the shader reads but no input binds is declared
so the shader compiles.

Shadertoy's API carries no license, so a conversion warns `license-unknown` unless one is
supplied. The audio-texture packing is semantically but not numerically verified against Shadertoy.
