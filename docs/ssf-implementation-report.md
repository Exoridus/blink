# SSF Original, ExoJS and Audio Analysis Lab implementation report

Status: qualified Original DSP and an executable Lab vertical slice. The full SSF 2.0 release gate is **NOT_ACCEPTED**. Pending contracts below are part of the requested handoff; passing numeric tests does not close them.

## Audit and dependency decisions

The baseline was 80 test files / 1154 passing tests. Blink already had a normalized `BlinkEffectIR`, common `BlinkPassRuntime`, owned render-target pools, audio surfaces, directory conversion, a semantic SSF audio adapter and a synchronous JS host. These have been extended rather than replaced. Native BlinkFX, ISF and Shadertoy retain their audio contracts. No other repository was changed and no commit, push, merge or PR was performed.

| Boundary          | Existing implementation / risk                                        | Result                                                                                                                      |
| ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| SSF audio         | `SsfAudioAdapter`: generic FFT, envelopes and semantic approximations | Separate `original/` frontend, states, BPM, 43 scalars and eight arrays; previous adapter retained as `ssf-semantic/1`      |
| IR/pass ownership | `BlinkEffectIR`, `BlinkPassRuntime`, existing render-target pool      | Reused; added readback inspection for Lab; safe feedback adaptations are explicit                                           |
| SSF profile       | Existing `ssf/1` compatibility registry                               | Original is default; explicit `ssf-original/1` and retained semantic mode registered                                        |
| PCM               | Generic WebAudio analyzer                                             | Isolated capture/resampler adapter, 44100 Hz mono, 512-sample hops; generic analyzers detached during Original playback     |
| Source/package    | Existing directory CLI and converter                                  | Shared case-insensitive reader; preserved raw scene bytes; uncompressed TAR reader kept separate                            |
| Script            | Existing synchronous modern JS host                                   | Native lifecycle/uniform/event boundary port; self-contained realm bootstrap and isolated timeout workers in Lab            |
| Lab               | Absent                                                                | Opt-in route `?lab=audio`; independent analysis/script/feedback lanes; bounded summaries and serialized playback operations |

The declaration and lockfile initially pinned ExoJS core/audio-fx 0.17.0 while the installed pair was 0.18.0. The verified available release is now pinned exactly to **0.19.1** in both `package.json` and `package-lock.json`. Registry versions/tags, sibling branches and the local next checkout did not contain a v0.20 release or identifiable candidate. No v0.20 API is assumed.

Read-only source audit identified release v0.19.1 tag `1eb0afefb6ca1b639f0348635fc49f7316756c78`, sibling head `815485bbffd39fc5e86b9eea98e7716f6e128510`, next ref `fc1d1996731327cff68f23970bf0c3305154d16d`, origin/next `096c2e234526750f87e9dbb6ac29ea558e97b061`, and the separate local next checkout `1bbb5c1e349dba6099c0c22fafa6934bbf80a324` (0.18.0). These are provenance observations, not promoted release candidates. Published v0.19.1 supplies PCM infrastructure, BeatDetector analysis timestamps/phase confidence, AudioOutputClock and backend readPixels; AudioTap remains internal and there is no public offline PCM BeatDetector API.

## Numeric evidence and a source correction

Original binary identity: Synesthesia 1.25.2.185, SHA256 `df45b2021c458a77b653bc27a9689d161acab80f6466fa8feaf3a0820636f256`. Fresh routines execute only inside owned Unicorn memory extracted from the verified installed PE. The installed application is not patched or injected. Native collaborator limits and PC53/IPP-p8 emulation differ from live application/hardware execution.

The full PCM replay discovered a discrepancy in the supplied F1 description/model. Routine **008C0BF0** compares the original sample; it contains no absolute-value operation. Its CRT classification excludes infinities and its NaN branch replaces NaN with zero. Fresh negative-only input yields F1=0; alternating +0.25/-0.75 yields F1=0.25; a mix of infinities/NaN/+0.25 also yields 0.25. BlinkFX now uses the positive finite maximum. The owned Python exporter applies this correction without modifying the supplied reference package. The correction is covered by `frontend.test.ts`, `native-peaks.json` and fresh pipeline captures.

Other red-to-green corrections included float32 Reactivity arithmetic in `syn_BPMConfidence`, float32 square/difference stores and unordered-NaN handling in the rolling variance, native waveform history selection, scene default/TYPE handling, uniform conversion, and native startup/event abort ordering.

| Gate                    | Measured result                                                                       | Scope                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 43 generators           | 11,610 fresh native output words; zero differing words                                | Three 90-update getter/r/q/dt scenarios; does not establish arbitrary inputs                                          |
| Band state              | Four getters x600 updates; zero differing words                                       | Startup and three 173-sample ring wraps                                                                               |
| Frontend                | Six fresh native scenarios pass published component tolerances                        | Portable complex FFT; maximum relative feature difference about 1.23e-4; not IPP bit equality                         |
| F1 counterexamples      | Three fresh original engine executions match exactly                                  | Negative-only, asymmetric and nonfinite PCM                                                                           |
| Eight arrays            | Twelve complete native updates; maximum relative error about 5.98e-8                  | Same native input vectors; four TimeSeries selectors; declared PC53/Zen2 Smooth profile                               |
| BPM                     | Max published error 7.63e-5 BPM, candidate 1.24e-4 BPM, confidence 3.73e-9            | Fifteen supplied native history captures; fresh original BPM oracle also executed separately                          |
| PCM to publication      | Two 60-frame complete native replays pass; maximum absolute error 7.63e-6             | Startup, streaming 512-sample hops, silence transition, 43 scalars/eight arrays; no JS/media/GPU in this numeric gate |
| Final-pass CPU boundary | 34 original traces; coordinates and normalized RGB words match                        | Native round/clamp/nonfinite rules; live read-FBO hook remains refused                                                |
| Texture packer          | Native NaN/+Inf/-Inf/-0 clamp rules pass                                              | RGBA packing, independent of producer arithmetic                                                                      |
| GPU sampling            | Seven LINEAR/REPEAT seam/wrap/texel-center probes, maxAbs=0                           | Chromium 153.0.8010.12, WebGL2 / ANGLE Vulkan SwiftShader                                                             |
| Sized-pass coordinates  | Original probe used a screen-sized uniform and did not prove native small-pass parity | Superseded by the pass-sized visual parity probes; readback row order is top-left                                     |
| GPU marker              | A/B RGBA32F pass bytes identical; 480x270                                             | Same-lane equivalence; arbitrary original scene pixels remain unqualified                                             |
| Feedback marker         | Frames (.25,.125,0,1), (.5,.25,0,2), reset matches frame0 exactly                     | Controlled marker agrees with supplied native lifecycle capture; float alpha2 retained                                |
| Scene corpus            | 128 classified: 2 complete, 123 approximate, 3 failed                                 | Conversion, manifest validation and IR loading; not GPU compilation/render parity for all scenes                      |

[Numeric score tables](evidence/ssf-original/numeric-scores.csv) contain 209 measured rows, first differing words, thresholds and scopes. [Fixture/environment manifest](evidence/ssf-original/numeric-report.json) records hashes and the portable CPU profile. [Browser evidence](evidence/ssf-original/browser-report.json) records actual GPU pixels, sampler probes, worker timeout/CSP behavior and controls/replay. [The compatibility matrix](evidence/ssf-original/compatibility-matrix.csv) covers all 359 frozen fields; [the crosswalk](evidence/ssf-original/source-crosswalk-92.csv) covers all 92 inventory entries. Source evidence labels and BlinkFX acceptance labels remain independent.

## Implemented Lab and Enhanced experiment

Run `npm run dev` and open `http://localhost:8080/?lab=audio`. The source-compatible marker includes modern SSF controls, script priming and a float feedback pass. Load a local scene directory or uncompressed Marketplace TAR and decoded audio. Both lanes share immutable PCM and ordered control transactions; provider, control processor, script and feedback ownership are independent. Source epochs and fixed 60 Hz replay clocks distinguish seeking from live audio time.

Scene TYPE/ranges/groups and effective values are visible. Shared edits are mirrored; A/B overrides label CONTROL_MISMATCH. Reactivity/Audio Speed and ExoJS BPM knobs stay outside scene.json. Signals expose all 51 origins and fallbacks. Spectrum/LevelTrail graphs, numerical pass readback, A/B wipe and absolute pixel differences are available. Readback follows ExoJS top-left row order without an extra display flip. Reports retain summary rows for at most 3600 frames by default, never past spectrum snapshots; retained/total frame counts are exported. JSON and scalar CSV export, step, seek/replay, reset and playback are implemented.

Lab scripts execute in opaque CSP-owned workers with a two-second timeout. Native priming and frame inputs, escaped-constructor network denial, infinite-loop termination, independent workers and disposal were tested in the real browser. Playback, seek and rebuild share a serial operation queue. Production's synchronous host remains a separately declared limitation.

Enhanced currently replaces the complete `syn_BPM*` family using aligned, timestamped ExoJS evidence, retaining native spectrum/time and reactive onset gates. Wrong epoch, future, stale or unavailable evidence selects a labelled Original fallback. Per-scene sidecar selection is implemented in Lab; normal playback Enhanced selection is pending. No always-on Lab analysis/render is started during ordinary playback.

Reviewed beat annotations must match the decoded PCM SHA256 and declare their pulse convention. Segment metrics use maximum one-to-one matching at a predeclared 70 ms tolerance, precision/recall/F1, signed and p90 absolute timing error, and separate exact/octave-tolerant tempo errors. No independent real-music annotations were available for an accepted run. Musical accuracy and visual preference remain UNKNOWN; default promotion is rejected. Timestamped onset events, confidence calibration and representative worklet p95/p99 CPU/allocation/dropout benchmarks are pending, not inferred from render timings. Script timings are worker round-trip latency; analyzer timings cover synchronous analysis plus publication.

## Remaining release gates

1. A real, verified ExoJS v0.20 release/candidate and consumer/quality/CPU evaluation are unavailable. The 0.19.1 experiment is not a substitute release claim.
2. Modern JavaScript is not Duktape 1.5.1. Full language semantics, all control normalization/randomization/coercion and exception-boundary contracts remain partial. Production script isolation is not implemented.
3. Native control class arithmetic, traveler/counter combinations and all meta/input/automation/transition consumers remain partial. Conversion emits explicit warnings for affected dynamics/defaults.
4. The exposed helper library now uses recovered Synesthesia 1.25.2 arithmetic (69 blocks, 91 names), covered by 311 scoped GPU comparisons. It does not reproduce every function in the full original 121-helper template. Native first-name-wins assembly, exact include/cache behavior, all template/meta bindings and arbitrary whole-scene pixel parity remain pending. [Numerical and resource parity](ssf-numerical-parity.md) defines the implemented scope.
5. Single-buffer and signed-negative-odd same-target hazards are adapted to safe pingpong; undefined native feedback is not assigned deterministic pixels. Native resource-reset flags/keepTime, exact failure recovery, media flip/straight-alpha/cube decoding and window color/presentation behavior are not fully qualified. Controlled float marker success does not close these contracts.
6. `textureFinalPass` callback coordinate/byte rules exist in the portable script host, but the actual synchronous current native read-FBO path is not wired. Production refuses the required capability. SSF profiles remain GLSL/WebGL2; a native-equivalent WebGPU adapter is pending.
7. Broader original scene CPU/JS/control/GPU runtime parity, platform/decoder/driver variation and independently annotated musical benchmarks are still required. Native editor save/rename/collision/backup workflows and optional blinded visual preference are pending.

## Reproduction

```
npx vitest run src/packages/ssf src/runtime/lab src/services/__tests__/RenderService.health.test.ts src/services/__tests__/RenderService.swap.test.ts
npx vite-node scripts/ssf-conformance.ts --output <evidence-dir> --corpus <scene-root>
python scripts/ssf-export-matrix.py --final <ssf-final> --evidence <evidence-dir>
python scripts/ssf-native-reference.py --exe <verified-exe> --final <ssf-final> --output <scratch-dir> --test pipeline
python scripts/ssf-native-reference.py --exe <verified-exe> --final <ssf-final> --output <scratch-dir> --test peaks
python scripts/ssf-native-reference.py --exe <verified-exe> --final <ssf-final> --output <scratch-dir> --test arrays --capture
python scripts/ssf-native-reference.py --exe <verified-exe> --final <ssf-final> --output <scratch-dir> --test generators --capture
node scripts/ssf-lab-browser.mjs --playwright <installed-playwright-module> --output <scratch-dir>
node scripts/ssf-lab-browser.mjs --production --url <preview-url> --playwright <installed-playwright-module> --output <scratch-dir>
```

Python prerequisites: NumPy, pefile, Unicorn and the supplied native reference test/tool package. Browser tests use an installed Playwright Chromium; no unrelated repository is modified. Evidence reports are ordinary deterministic artifacts; environment/timing fields vary by run.

## Final validation

- Full repository tests: **97 files / 1245 tests passed**, zero failures. Baseline was 80 files / 1154 tests.
- `npm run ts-check` and `npm run build`: PASS. Build retains dependency IIFE-name and large-chunk warnings.
- Focused SSF/Lab/changed-file ESLint: **0 errors / 104 warnings**. Full-repository lint was skipped; these warnings include retained code and new numeric/dynamic-index adapters.
- Development browser: ten scenario groups passed, including real sampler, feedback, sized-coordinate and isolated-script probes. Production bundle: six Lab scenario groups passed with no browser errors and equal A/B pass data.
- `git diff --check`: PASS. The unrelated research file remains untouched; build/scratch outputs remain untracked.

[Machine-readable validation](evidence/ssf-original/validation.json), [production browser evidence](evidence/ssf-original/production-browser-report.json), and [Lab overview](evidence/ssf-original/lab-preview.png) accompany the numeric and per-field evidence. Production smoke tests exercise compiled worker bootstraps, rather than relying only on development-module execution.
