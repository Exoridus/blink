# Shader programs and render-target sizing

Implementation guide. The normative package target is the [current BlinkFX specification](blinkfx/specification.md); this guide describes Blink backend behavior.

The contract for how a BlinkFX package declares shader programs and sizes its render targets.
It extends the July `blinkfx/1` forms additively: every older package keeps loading unchanged.

## Shader programs

`shaders.glsl` is a path string (the `main` program) or a record of named programs. A program is
one of:

| Form                                           | Meaning                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `"path.frag"`                                  | Fragment stage; the runtime supplies the fullscreen vertex stage.         |
| `{ "fragment": "a.frag", "vertex": "a.vert" }` | Fragment stage with the package's own vertex stage. `vertex` is optional. |
| `{ "audio": "snd.glsl" }`                      | Audio-output program. It never runs as a visual pass.                     |

`shaders.wgsl` holds plain path strings only (see [WGSL programs](#wgsl-programs-webgpu)). A pass key may exist for one backend only. The
runtime runs a package on a backend only if every pass has a visual program for that backend's
language (`glsl` for WebGL2, `wgsl` for WebGPU); otherwise the load fails and names the passes
that have none. A pass that names an `audio` program is rejected at validation.

Every stage path is package-relative and must stay inside the package root.

### Vertex stage

A package vertex shader is GLSL ES 3.00. The runtime prepends:

- `#version 300 es`, `precision highp float;`, `precision mediump int;`
- `bl_time`, `bl_deltaTime`, `bl_frame`, `bl_resolution`, `bl_pass`
- the package's control uniforms (bang controls excluded)
- `a_position` (location 0), `a_texcoord` (1), `a_color` (2)

The shader declares its own varyings and `main`, and must write `gl_Position`. Only `a_position`
is fed: the clip-space corners of the fullscreen quad. A `#version` line other than `300 es` is
rejected; `#version 300 es` and a `precision ... float;` statement are tolerated and dropped.
Audio and pointer uniforms are fragment-stage only.

### Includes

`#include "relative/path.glsl"` is expanded before compilation, in fragment and vertex stages.

- The path is quoted, relative to the including file, and must resolve inside the package root.
  Absolute paths, URL schemes, backslashes and `..` past the root are errors.
- Includes nest to a depth of 16, a cycle is an error, and the total size of all files read is
  capped at 1 MiB.
- The same file may be included more than once; guard against redefinition inside the file.
- Angle-bracket and unquoted forms are errors. A commented-out directive is ignored.

## Render-target sizing

A target's `width` and `height` are a positive number of pixels or a size expression string. A
target uses either `scale` or `width`/`height`, never both. A missing dimension defaults to the
screen dimension. Results are floored to integers, then clamped to at least 1 and to the
backend's texture size limit.

### Expression language

```
expr    = term (('+' | '-') term)*
term    = unary (('*' | '/' | '%') unary)*
unary   = '-' unary | primary
primary = number | '$' name | func '(' expr (',' expr)* ')' | '(' expr ')'
```

- Variables: `$WIDTH` and `$HEIGHT` (the output size) and `$<control>` for a declared `float`,
  `int` or `bool` control (a bool reads as 0 or 1).
- Functions: `min`, `max` (one or more arguments), `floor`, `ceil`, `round`, `abs` (one),
  `clamp(value, low, high)`.
- Nothing else: no assignment, property access, loops or user functions. Expressions are parsed
  by a dedicated parser and are never evaluated as JavaScript.
- A non-finite result (for example division by zero) is an error.

A syntax error, an unknown control, or a control of another type is a validation error that
names the manifest path.

### Runtime behaviour

Expressions are re-evaluated when the output is resized and when a control they read changes.
A target whose size changed is reallocated, which discards the history of a persistent target;
targets whose size did not change keep their textures.

A package using any size expression requires the `dynamic-target-size` feature. It is inferred;
declaring it is optional.

## WGSL programs (WebGPU)

A WGSL program is the **fragment stage only**. The runtime wraps it, per pass, in a module that
supplies everything else, and compiles one module per pass.

A program defines exactly one entry point:

```wgsl
@fragment
fn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> { ... }
```

It may define helpers, constants and its own structs. It may not define what the runtime defines
(`vertexMain`, `bl_fragCoord`, `BlinkUniforms`, `BlinkVarying`, `BlinkVertexInput`, `blink`);
validation reports `wgsl-entry-missing` and `wgsl-redefines-runtime`. A program is plain WGSL: no
`#include`.

### What the module provides

- `BlinkVarying`: `position` (`@builtin(position)`) and `uv` (0..1, bottom-left origin).
- `vertexMain`: the fullscreen quad. A package cannot replace it on WebGPU.
- **Uniform accessors**, one function per uniform the pass's material declares, returning the type the
  GLSL uniform of the same name has: `bl_time()`, `bl_deltaTime()` (`f32`), `bl_frame()`, `bl_pass()`
  (`i32`), `bl_resolution()` (`vec2<f32>`), the pointer values, every `au_*` value, and one function
  per control named like the control (`float` and `point2d` as `f32`/`vec2<f32>`, `int` and `enum` as
  `i32`, `bool` as `bool`, `color` as `vec4<f32>`; a `bang` has none). Bind-by-call, not by name: write
  `bl_time()`, not `bl_time`.
- `bl_fragCoord(in)`: the fragment position in output pixels with a **bottom-left origin**, as GLSL's
  `gl_FragCoord` has. `@builtin(position)` itself has a top-left origin.
- For each input of the pass named `<name>`: `<name>` (`texture_2d<f32>`), `<name>_sampler`, and
  `<name>_uv(uv)`. Sample with `textureSample(<name>, <name>_sampler, <name>_uv(uv))` and the
  coordinate means what it means in GLSL: a render target is stored with its first row at the top in
  WebGPU and at the bottom in WebGL2, so `<name>_uv` flips the coordinate of a render target and leaves
  that of an asset or host input alone. Spectrum, level trail and generic audio inputs are data
  textures; read them with `textureLoad(<name>, vec2<i32>(x, 0), 0)`.

### Differences from GLSL

- No `bl_*` / `au_*` global variables; use the accessors above.
- No compatibility profile (`ssf/1`, `isf/2`, `shadertoy/1`): their preludes are GLSL. A converted
  package is refused on WebGPU with a message naming the profile.
- No generated audio: its program is GLSL, so `audio-generation` is not available on WebGPU.
- A package that wants to run on both backends ships both programs under the same pass keys. A package
  that ships only one is refused on the other backend, naming the passes that lack a program.

### Selecting the backend

`?backend=webgpu` selects WebGPU; WebGL2 is the default. `requirements.backends` restricts a package.
The choice is made once, at startup.

### Verification

`node scripts/browser-smoke.mjs --parity-check <effect>` runs an effect with both programs on both
backends in a real browser and compares the two pictures pixel by pixel. `parity_twin` (an asymmetric
asset and a render-target pass) and `feedback_twin` (a persistent `rgba16f` feedback target) are held to
a mean difference under 2/255. `wgsl_probe` and `wgsl_audio_probe` (WebGPU only, listed in
`effects/catalog-webgpu.json`) check a transient buffer and the audio data textures. Needs a real
adapter: `--chrome-flags "--use-angle=d3d11 --enable-unsafe-webgpu"`.
