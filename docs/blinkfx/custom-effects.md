# Authoring custom effects

An editable project can use any directory name. Its root contains `manifest.json`.
Existing directories ending in `.blinkfx` remain supported. Distribution uses a
ZIP archive named `effect.blinkfx`, with `manifest.json` at the archive root.

```text
aurora/
  manifest.json
  shaders/main.frag.glsl
  scripts/main.js
  assets/noise.png
  presets/default.json
```

```json
{
    "format": "blinkfx/1",
    "id": "example.plasma",
    "title": "Plasma",
    "shaders": { "glsl": "shaders/main.frag.glsl" },
    "controls": [{ "name": "speed", "type": "float", "default": 1, "min": 0, "max": 4 }]
}
```

With no explicit passes, a visual package gets one fullscreen pass to the screen.
Controls declare durable values; `bang` is an event. Host inputs declare image,
audio, FFT, combined audio textures, pointer or keyboard data. Package assets are
separate from live host inputs. Use explicit pass input bindings for each sampler.

```glsl
void main() {
    vec2 uv = gl_FragCoord.xy / bl_resolution;
    gl_FragColor = vec4(0.5 + 0.5 * sin(bl_time * speed + uv.xyx), 1.0);
}
```

The runtime supplies `bl_time`, `bl_deltaTime`, `bl_frame`, `bl_resolution` and
`bl_pass`, and declares control uniforms using the declared control types.
`bl_resolution` belongs to the current pass. Native audio scalars use `au_*` names;
native spectrum/history textures are explicit sources, not hidden sampler aliases.
The complete uniforms and resource contract is in [the specification](specification.md).

Package-local GLSL includes must stay within the package and cannot cycle.
Native helpers are those declared in the package/ABI; source-format helpers are
provided by the selected compatibility profile, not universally injected names.
Custom functions can live in shader includes. GLSL implementations target WebGL2;
WGSL implementations target WebGPU and must provide the supported visual entries.
The runtime selects a backend only when all required programs and capabilities exist.

Multipass effects declare pass order and offscreen targets. Same-frame inputs may
read earlier targets; `target.name.previous` reads the previous completed frame
of a persistent target. It cannot alias the texture currently being written.
Explicit requirements/fallbacks describe float targets, scripts and other needs.

Scripts, audio-output programs, presets and thumbnails are optional. Read
[scripting](scripting.md) before authoring lifecycle code, and validate the complete
package rather than only checking that its manifest parses as JSON.
