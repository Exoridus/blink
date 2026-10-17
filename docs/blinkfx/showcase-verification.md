# Showcase verification

The shipping showcase contains Aurora, Hypercoil (`full.blinkfx`), Prism Orbit,
Spectral City and Ink Current. The three new native effects use the Blink audio
uniforms `au_bass`, `au_mid` and `au_high` directly.

## Package checks

Run with Node 24 after `npm ci`:

```sh
npx vitest run scripts/__tests__/showcasePackages.test.ts
```

The checks validate all five manifests, require their MIT declarations, resolve
shader, asset, preset, script and thumbnail references, and compare every file
byte after a BlinkFX archive round trip. They also check that the three new
effects have one native pass, declare all three band responses and default to
an audio sensitivity of one.

## Deterministic GPU checks

Install the Playwright Chromium binary for the configured browser cache, then run:

```sh
node scripts/test-showcase-gpu.ts
```

The runner starts and stops its own Vite server on an available loopback port.
An existing development server can be used with `--url http://127.0.0.1:8080/`.
The page contains only the verification harness; opening it does not start the
application or an audio source.

For each new effect, the check loads and validates its actual manifest, uses
`loadBlinkFx`, `buildBlinkPrelude`, `buildPassPrelude` and `stripGlslPreamble`,
then compiles and links the actual fragment shader. It uploads the production
control defaults and draws a 320x180 RGBA32F target at `bl_time = 2`,
`bl_frame = 120` and `bl_deltaTime = 1/60`.

The scenarios are silence; bass, mid and high inputs of 0.8 independently;
and mixed inputs of 0.8, 0.5 and 0.7. Every float component must be finite and
every render/readback must be free of WebGL errors. The silent image must have
more than 5% lit pixels and more than eight quantized RGB colors. Each audio
scenario must differ from silence by a mean absolute RGB difference above
0.0001, with more than 1% of pixels changing by at least that threshold.
Repeating silence at the same clock must produce exactly the same RGB values.
Setting sensitivity to zero must make silence and mixed audio exactly equal.

The runner writes a JSON report to its ignored workspace artifact directory.
Missing WebGL2 or `EXT_color_buffer_float` fails the lane; it does not silently
substitute byte readback or mark an unexecuted GPU check as passed.

## Observed result and scope

All eight package checks and all three GPU cases passed. The observed mean
absolute RGB differences for independent band inputs were:

| Effect        |   Bass |    Mid |   High | Silent lit fraction |
| ------------- | -----: | -----: | -----: | ------------------: |
| Prism Orbit   | 0.0133 | 0.0039 | 0.0148 |               0.519 |
| Spectral City | 0.0219 | 0.0101 | 0.0019 |               1.000 |
| Ink Current   | 0.0808 | 0.1202 | 0.0041 |               1.000 |

These checks establish finite native GLSL rendering and independent shader
responses to supplied Blink band values. They do not qualify microphone or
file decoding, audio analysis accuracy, WebGPU, multipass execution, browser
presentation, the application shell or arbitrary source-format compatibility.
Production runtime smoke and preview generation cover their own integration
paths separately.
