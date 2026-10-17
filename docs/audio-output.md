# Generated audio output

A package that declares `outputs.audio` plays sound its own shader computes. Visual and audio
output are independent: a package may have either, or both.

```json
"outputs": { "visual": false, "audio": { "shader": "sound", "abi": "blink-audio/1", "channels": 2, "sampleRate": "device" } },
"shaders": { "glsl": { "sound": { "audio": "shaders/sound.glsl" } } }
```

## Shader ABIs

| ABI                 | Entry point                                            | Used by                          |
| ------------------- | ------------------------------------------------------ | -------------------------------- |
| `blink-audio/1`     | `vec2 renderSound(float timeSeconds, int sampleIndex)` | native packages                  |
| `shadertoy-sound/1` | `vec2 mainSound(int samp, float time)`                 | converted Shadertoy Sound passes |

The result is normalized PCM in `[-1, 1]`; `.x` is left and `.y` right, and mono output
(`channels: 1`) plays `.x` on both sides. A NaN or an out-of-range value never reaches the output:
it is replaced with silence or clamped. The package's controls are uniforms as in a visual shader,
and `bl_audioSampleRate` is the rate the shader is evaluated at (`iSampleRate` in the Shadertoy ABI).
`sampleRate` follows the output device; the runtime generates at that rate instead of resampling,
so the shader's `time` and the audible time agree.

`time` is a 32-bit float, with the precision limit that implies: after about an hour a high
frequency has audible phase error. Shadertoy sound shaders have the same limit.

## How blocks are made

```
audio shader -> GPU float block (one pixel per sample) -> async readback -> ordered PCM queue
             -> AudioWorklet -> the output device
```

A block is 4096 samples (a `128 x 32` `rgba32f` target). Each pixel computes the sample whose
absolute index is `block start + row * 128 + column`, with rows counted from the top so the
readback is already in sample order. The index is an integer and stays exact for hours.

The scheduler keeps about a quarter of a second of audio queued ahead of playback, asks for at most
three blocks per frame, and allows three to be in flight. Blocks reach the queue strictly in the
order they were requested. A block whose render fails is skipped and counted: playing the next
block in its place would shift every later sample.

The worklet never waits for the GPU or the main thread. When its queue runs dry it outputs
silence and counts an underrun; silence before the first block arrives is the start-up wait, not
an underrun.

## Controls and latency

Control values are read when a block is rendered, and queued audio is immutable. A control change
is therefore heard after the buffered audio drains, about a quarter of a second later. The
buffered duration is part of the runtime's diagnostics (`stats()`: `bufferedSeconds`,
`targetBufferSeconds`, `underruns`, `failures`).

## Requirements

The runtime provides `audio-generation` when the browser has `AudioWorkletNode` and the backend can
render to `rgba32f`. A package that needs it on a device without either is refused at load.
Generation stops, queued audio is dropped and the GPU and audio resources are released when the
package is switched away or the service is destroyed.

The readback uses the rendering context's `readPixels`, which is part of the ExoJS `next`/0.18
line; it is not in the 0.17 release.
