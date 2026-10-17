# SSF Original processing profile

The source contract is `SSF-1.25.2-native-gpu-closure-2026-10-13`, targeting Synesthesia 1.25.2.185, SHA256 `df45b2021c458a77b653bc27a9689d161acab80f6466fa8feaf3a0820636f256`.

BlinkFX retains one normalized effect IR and render runtime. SSF processing stays in `src/packages/ssf/original`; native BlinkFX, ISF and Shadertoy audio retain their existing contracts.

Original analysis consumes timestamped mono binary32 PCM at 44100 Hz, accumulated into 512-sample callbacks. Source epochs separate seeks and source replacements. Render publication is a separate operation: scalar generators and array producers use render delta and the latest available analysis state. BPM reads the preceding 22-band histories and computes every twelfth analysis callback. Owned snapshot arrays are copies and remain stable after subsequent processing.

The portable numerical profile uses binary64 complex FFT butterflies followed by binary32 publication, the captured native 2048-point Blackman window, PC53 accumulator stores, and the Smooth weight table for CRT ISA >=2 with Zen2 reciprocal seed `0x3ABC1000`. It does not claim native IPP bit equality, universal CPU parity, native NaN payload preservation, Duktape VM parity, or GPU pixel parity. Each boundary has separate tests and evidence.

Spectrum is 1024 RGBA32F texels containing Raw, Juiced, Smooth and the already mapped Waveform. LevelTrail is 400 RGBA32F texels containing overall, bass, mid and high TimeSeries. Clamp producer channels to [0,2], preserve zero prehistory, oldest at index 0 and newest at 399. Portable 1D sampling uses one-row 2D textures, normalized texel centers, LINEAR and REPEAT.

Audio analysis selection belongs in scene sidecar settings. Imported scenes must only be labelled Original once the original PCM provider is actually connected; legacy semantic approximation is a distinct compatibility mode. Enhanced mappings must retain native arrays/time and change complete dependent tempo/beat families coherently. Unavailable Enhanced evidence falls back with a per-field reason. Native onset gates and musical beat-grid events have distinct meanings.

The Audio Analysis Lab is opt-in. Each lane owns generator, script, control and framebuffer state; shared PCM and control transaction clocks do not imply shared mutable state. Original parity, independently annotated musical accuracy and visual preference are separate verdicts. Warmup, control mismatch, external nondeterminism and undefined feedback prevent unqualified comparisons.

Reference fixtures are generated independently with Python and carry oracle input hashes. Recorded native captures are replay evidence. The separately captured frontend, generator, band-state and array fixtures were freshly executed from the hash-verified original binary in an owned Unicorn host. The BPM fixture remains supplied capture replay evidence. The supplied native suite's 38 passing scripts do not count as BlinkFX tests.

## Runtime modes and verification

`ssf/1` selects Original by default. `ssf-original/1` names it explicitly; `ssf-semantic/1` retains the prior generic analyzer adapter for diagnostics. Only Original detaches the generic ExoJS analyzer while the PCM provider owns analysis. Other formats keep their existing analyzer paths. Enhanced tempo selection currently belongs to the opt-in Lab's per-scene sidecar; normal playback Enhanced integration is pending.

The portable JS host reproduces input publication, required priming, uniform stores, named event callbacks and immediate update abort. Lab scripts execute in separate workers owned by opaque CSP realms, with network access disabled and a two-second execution limit. Production's existing synchronous script host remains a separate, unqualified isolation boundary.

The Lab is available at `?lab=audio`. It shares immutable 44100 Hz PCM and ordered control transactions while each lane owns its provider, processor, script and render targets. Fixed 60 Hz stepping and replay rebuild histories from frame zero. Imported scene controls expose native TYPE, ranges and groups. Overrides label CONTROL_MISMATCH. Pass readback supplies numerical differences, source-data hashes, A/B wipe and a tenfold absolute-difference view. Float pass preview values are clamped directly for display, rather than presented as native window pixels.

Review [the implementation report](ssf-implementation-report.md) and [per-field compatibility matrix](evidence/ssf-original/compatibility-matrix.csv) before relying on a native scene feature. Numeric success is a scoped gate and does not grant full SSF scene or musical-quality acceptance.

The measured PCM-to-publication gate covers two 60-frame native streaming scenarios. Routine 008C0BF0's F1 is the positive finite maximum, correcting the earlier absolute-maximum description. Exact native counterexamples and the correction are described in the implementation report. Native waveform publication selects the first 1024 values of the 2048-sample history; replacing it with the latest half would change source behavior.

`RENDERSIZE` is the current pass size. `_xy` uses GL fragment coordinates and pixel centers; `_uv` and `_uvc` normalize by that pass's dimensions. Output size remains independent of the preview CSS box. See [visual parity contract](ssf-visual-parity.md).
