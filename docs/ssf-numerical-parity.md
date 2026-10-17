# SSF numerical and resource parity

## Scope

The SSF converter uses recovered Synesthesia 1.25.2 shader arithmetic for its
exposed helper library: 69 helper blocks providing 91 names. Polar angle units,
clockwise rotation, clamping, noise, color and media-helper arithmetic follow
that version's formulas rather than plausible replacements. `_exists` uses the
native texture-dimension test; a texture no larger than 1x1 counts as absent.
Scene-defined helpers retain precedence.

`nativeArithmetic` on a helper block qualifies its formula, not its input
producer. The converter retains warnings for incomplete host media processing.
Helpers such as media transforms can match their formula with neutral host
settings while the complete native media/meta-control pipeline remains absent.

Run the version-qualified GPU regression with a development server and Playwright:

```text
node scripts/ssf-helper-gpu.mjs --url http://127.0.0.1:8080/ --output <report.json>
```

The 311 cases compare GPU results with the frozen recovered-source oracle in
`scripts/fixtures/ssf-helper-native-1.25.2.json`, using the expressions in
`scripts/fixtures/ssf-helper-probes.json`. The comparison tolerance is
`1e-5 * max(1, abs(expected))`, including explicit nonfinite-result handling.
This establishes neither driver-independent bit equality nor live Synesthesia
1.25.4 scene parity. The oracle was produced from recovered native GLSL, not a
new live Synesthesia process comparison.

## Raw images and alpha

SSF compatibility profiles request raw image sampling. Package images use
`colorSpace: 'none'`, straight alpha and no upload premultiplication, preserving
encoded numeric RGB and independent alpha. Browser decoding retains the existing
vertical flip, disables color-space conversion and disables premultiplication.
Native Blink packages retain their managed asset policy.

An uploaded RGB128 texel therefore samples as `128/255`, including when its alpha
is zero, instead of being decoded to approximately 0.216 or scaled by its alpha.
Premultiplying would destroy the source shader's independent RGB/alpha contract.
Final presentation remains a separate boundary; these rules describe shader
resources and attachment writes, not a new output color-management system.

Host image sampling creates owned texture views while preserving producer
ownership. Numeric DataTexture views retain the exact format and share the typed
buffer, avoiding browser-image conversion or quantization. Producer version
changes refresh the view; disposing a view does not dispose its producer.

## Attachment writes and sampling

All GLSL effect passes use the common fullscreen renderer with blending disabled
during the draw. Alpha and RGB are written exactly as shader outputs. Feedback
composition remains shader-defined. The previous GL blend enable state is
restored on success and draw failure; fixed-function float-blend capability is
not required for an unblended float attachment. This is a generic effect-pass
contract with no source-format branch in the renderer.

Optional `sampling` on native render targets and image host inputs travels through
the manifest, validator, IR and binders. When absent, native defaults remain
unchanged. SSF conversion assigns these source defaults:

| Resource | FILTER | WRAP   |
| -------- | ------ | ------ |
| PASSES   | linear | repeat |
| MEDIA    | linear | repeat |
| IMAGES   | mipmap | repeat |

Authored nearest, linear, mipmap, clamp, repeat and mirror settings are retained.
Float targets receive their requested sampler after factory allocation, which
otherwise replaces linear with nearest. Unsupported float filtering raises a
device capability error. SSF border wrapping currently raises
`texture-wrap-unsupported`; it is not silently substituted with repeat.
Unsupported cubemaps also reject conversion.

Render-target mip levels are refreshed after writes. Numeric and single-level
pixel inputs generate requested mips after upload, expand the backend's level-zero
clamp and refresh after producer commits or GPU storage eviction. Authored pixel
mip chains retain their supplied levels. Existing pass ordering, persistent
ping-pong targets and render-target lifetime remain unchanged.

## Scripts and public API inventory

Script uniform inference recognizes arrays, separate numeric components,
coordinate/color objects and constructor instances. Only contiguous xyzw/rgba
fields determine vector arity; smoothing state such as goals and history does
not. Used outputs with unresolved types produce an explicit diagnostic.

The unchanged workshop scenes `circle_lesson_live_2.synScene` and
`mouse_demo_mask_1.synScene` previously failed because Blink inferred incorrect
uniform types. Both now compile and run. Missing manifests and unbundled libraries
in other workshop directories remain source-package limitations; original
fixtures are never repaired by inventing dependencies or rewriting shaders.

The [JavaScript snippets](https://github.com/gravity-current/synesthesia-snippets/blob/master/snippets/js.json)
contain 17 named function entries, all exposed by the script host. The
[uniform snippets](https://github.com/gravity-current/synesthesia-snippets/blob/master/snippets/uniforms.json)
list 44 names: 38 audio scalars, TIME, FRAMECOUNT and four pointer vectors.
Tests cover their publication and script round trips. Snippet prose establishes
API intent, not proprietary DSP formulas or native VM coercion.

`setControl` and `setControlNormalized` support dimension selection and preserve
other components. Scene bank is available; unsupported banks are logged and
leave controls unchanged. `printGlobalKeys` includes host API, script declarations
and published inputs, without claiming native enumeration of JavaScript built-ins.
`_click.xyz` now receives independent left/right/middle button state in shaders
and scripts, including button chords, cancellation and pointer leave.

Recovered native callbacks use function-name strings. Legacy function callbacks
remain supported separately. The snippet's `_textureFinalPass` body conflicts
with its `textureFinalPass` entry and recovered API; it is not an inferred alias.
Production synchronous final-pass readback remains capability-refused. Host meta
banks, complete media processing and Duktape language parity remain unqualified.

## Format impact

`ssf/1` identifies Blink's compatibility profile and JavaScript ABI, independently
of SSF 2.0 source metadata. These changes do not require a `ssf/2` rename or a
BlinkFX v2 format. Optional generic sampling fields are additive BlinkFX v1
metadata; their current implementation and validation are documented above.
The approved R2 bundle remains unchanged. Any future broader sampler modes or
host media/meta-control contracts need their own documented design decision.

Compilation, six-frame rendering and the helper probes qualify different
boundaries. None alone establishes complete native visual parity.
