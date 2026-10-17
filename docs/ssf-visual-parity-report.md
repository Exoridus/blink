# SSF visual parity report - 2026-10-13

Two host mismatches were isolated and corrected without changing audio DSP or
ExoJS. The first divergent stage was output sizing: the normal RenderService
used window dimensions for the canvas, screen-sized attachments and shader
resolution. A window resize therefore changed scene geometry and feedback
allocation. This is consistent with the reported stretching; the supplied
screenshots were not attached to this session, so their exact pixels were not
measured.

Output now defaults to 1920 x 1080 at pixel ratio 1. Window resizing changes only
the presentation box. Fit Within Window uses contain; Fill / Crop uses cover;
Stretch uses fill. A 600 x 600 contain preview displays the 1920 x 1080 image in
a 600 x 337.5 rectangle at y=131.25. Resolution presets, custom dimensions,
aspect lock, FPS cap and 50/75/100/125/150 percent UI scaling are exposed in
Output & Preview. Alt+5 opens the normal shell panel. UI scale and fitting do
not reset analysis or feedback. Pointer coordinates include fitting offsets.

The second divergence was final presentation. The float marker RGBA
(0.25,0.5,0.75,1) was exact in the attachment but appeared as bytes
(137,188,225,255). ExoJS 0.19.1 has a mandatory linear-to-sRGB output transform;
the recovered native fresh context has framebuffer-sRGB disabled and a direct
presentation copy. The encoded-RGB profile now adapts only the screen shader
into ExoJS's linear working space using the standard inverse sRGB transfer.
The same marker now presents as (64,128,191,255). Opaque presentation ignores
shader alpha, while intermediate RGBA32F values, including alpha 2, remain
unchanged. No hue, saturation or artistic gamma adjustment was added. Other
formats retain their existing presentation behavior.

The supplied host specification binds RENDERSIZE per pass. The earlier 8 x 8
probe used a screen-sized uniform and only tested our own injected formula; it
did not prove native small-pass parity. That claim was corrected in the prior
documentation. The replacement GPU probe returns (0.0625,0.9375,-0.4375,0.4375)
for (_uv.x,_uv.y,_uvc.x,_uvc.y) at the top-left pixel of an 8 x 8 attachment.
The fullscreen vertex shader writes clip-space positions directly and applies
no camera matrix. Readback rows are top-left; fragment coordinates are
bottom-left pixel centers. No global UV inversion was introduced.

Spectrum remains 1024 x 1 RGBA32F and LevelTrail 400 x 1 RGBA32F, LINEAR/REPEAT.
Fixed, distinct RGBA ramps verify direction and every channel independently
of live audio. The existing seven seam/wrap/texel-center GPU probes remain
exact against their sampling oracle. The non-power-of-two trail ramp oracle
rounds normalized-to-texel multiplication to binary32, matching the shader/GPU
sampling boundary. The native history provider, with newest trail value at 399,
was not changed. These tests establish orientation for the tested host inputs;
they do not establish whether the live strip in the reported screenshot was
mirrored or used a different audio frame.

The Lab keeps independent render targets, script workers and providers, and
both lanes consume the same recorded PCM. It now has common output settings,
quadrant/UV-grid modes with audio disabled, RGBA ramps, numeric texture samples,
pointer-coordinate inspection, pass thumbnails, actual uniform snapshots,
float attachment diffs and an optional reference PNG comparison. PNG dimensions
must match the output; explicit rectangle masks exclude UI and trial watermark
pixels. RGB-byte max, mean and RMS error plus a heatmap are exported with
reference hashes and frame/epoch. The comparison reads the preserved canvas
without advancing feedback. The self-image test covers plumbing, not native
parity.

The replay clock remains fixed at 60 Hz, separately from the presentation cap.
Changing only FPS cap, fitting or UI scale preserves replay state. The browser
controls display synchronization; V-Sync off cannot be forced by this UI.
If live playback falls more than 0.25 s behind the audio clock it stops and
reports the drift. Deterministic stepping remains the reference comparison
path. The cap scheduler carries an absolute deadline across RAF callbacks;
the 144-on-165-Hz regression prevents the former half-rate scheduling error.

Exports include scene/package asset hashes, PCM hash, effective controls,
captured and live uniforms separately, pass formats/dimensions, capture instant,
browser/GPU identity, CPU concurrency and submission/analysis/script timings.
GPU duration is explicitly marked not measured. Scene hashes include sorted
package-relative names and contents. Historic captures retain their own uniforms.

Validation:

- 24 targeted Vitest files, 225 tests passed, covering the common pass runtime,
  shell/application, output sizing, cap scheduling, masked pixel metrics and SSF
  conversion/import. Full repository tests and full repository lint were not
  repeated for this focused change.
- Typecheck and production build passed. Existing IIFE export-name and large
  chunk warnings remain.
- Scoped ESLint: 0 errors, 29 warnings. No blanket suppressions added.
- Real Chromium 153.0.8010.12 WebGL2/SwiftShader: 8 visual probe groups, 10
  development Lab groups and 6 production Lab groups passed.
- The color and empty-pass Inspector regressions were observed failing before
  the corrections. Output math and mask tests initially failed with missing
  implementations; the cap cadence regression exposed an extra scheduling error
  before the absolute-deadline correction.
- Independent review findings were addressed; git diff whitespace check passed.

Machine-readable evidence:
[visual probes](evidence/ssf-visual-parity/visual-browser-report.json),
[development Lab](evidence/ssf-visual-parity/lab-browser-report.json),
[production Lab](evidence/ssf-visual-parity/production-browser-report.json).
The test entry points are scripts/ssf-visual-browser.mjs and
scripts/ssf-lab-browser.mjs; both accept --url, --playwright and --output.

Frozen native reference remains Synesthesia 1.25.2.185. The comparison version
1.25.4.189 is user-reported. Full native scene pixel parity is INCONCLUSIVE until
aligned native image/PCM/frame/control captures are supplied. Native media/final
SCREENSIZE bindings, transparent window composition, full meta/trial shader
behavior and hardware-specific presentation remain qualified separately. The
installed ExoJS pair is still 0.19.1; no v0.20 integration is claimed. The wider
SSF release gate remains NOT_ACCEPTED as documented in the implementation report.
No commit, push, merge, PR, other-repository edit or frozen-algorithm change was
performed.

## Audio Indicators interpretation and runtime repairs

The original scene now runs from its source directory through activation-time
normalization, with the complete three-pass graph and script. The top slice reads
normalized band histories, not raw volume. A deterministic three-tone probe at
amplitudes 0.02, 0.1 and 0.5 produced newest top trail values 1 at each amplitude,
while positive PCM peaks were 0.01987, 0.09935 and 0.49676. Changing reactivity from
0.5 to 0.1 did not change those histories or the raw/script bars.

The right bars use raw positive PCM peak plus the original script's per-frame 0.04
EMA and 0.05 release. After a tenfold amplitude reduction, the smooth bar at two
seconds was 0.14748, 0.09013 and 0.05394 at 30, 60 and 120 FPS respectively, with
identical raw input 0.049676. Analysis warmup and peak history also matter. Original
bypasses the generic analyzer's gain and beat boosts; no accidental additional gain
was found. These measurements explain possible visual differences, not the cause
of an unmatched live recording. Comparison still needs identical PCM, controls,
FPS, histories and native version. No verified core DSP formulas were changed.

The full catalog smoke and repairs are recorded in
[the effect smoke report](ssf-effect-smoke-report.md). Loading and GPU success do
not establish equality with a native Synesthesia window.
