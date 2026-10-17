# BlinkFX Multipass Pass-Runtime — Design

Date: 2026-07-06
Status: Approved, ready for implementation planning

## Goal

Implement the native BlinkFX **multi-pass render runtime** (roadmap Phase 3) so that
`effect.passes[]` / `effect.renderTargets[]` — already fully modelled in the IR — are actually
executed, including **persistent feedback buffers** (ping-pong). This closes the single
substantive gap left after the ExoJS 0.15.2 upgrade: `RenderService.updateBlinkFxShader`
currently renders only the first screen pass and warns on anything more
(`src/services/RenderService.ts:245`).

Verification target: real Synesthesia multi-pass effects hand-ported to native `.blinkfx`
packages, driven through the new runtime.

## Decisions (settled during brainstorming)

1. **Strategy: SSF loader unfolds `PASSES` (revised from hand-porting).** Build the native
   runtime, then teach `SynSceneLoader` to emit *real* multipass IR (N buffer passes + final
   screen pass) instead of folding to one screen pass. Real `.synScene` multipass effects then
   run unchanged through the runtime — the SSF prelude already declares `PASSINDEX` and its
   helpers, so no per-effect shader hand-porting. Rationale: the native prelude provides none of
   the SSF built-ins (`_uvc`, `_rotate`, `_fbm`, `RENDERSIZE`, `PASSINDEX`, …) that real SSF
   shaders use, so a faithful *native* `.blinkfx` port would require inlining those helpers by
   hand per effect; unfolding on the SSF path reuses the existing `ssfPrelude` and is both less
   work and higher-value. Primary real-effect target: **`audio_indicators.synScene`**
   (`PASSES:[feedback,helper]`, already catalogued, its buffer samplers already declared in
   `ssfPrelude.ts`) — today folded to single-pass, correct feedback once unfolded. Plus one
   synthetic native `.blinkfx` fixture for a deterministic transient-buffer test.
2. **Substrate 3 (rgba8-only this slice)** — the runtime is built on
   `RenderingContext.renderTo` / `render` (off-screen + screen passes), validated by the engine's
   own `examples/render-targets/{trail-feedback,post-processing-chain}.ts`. ExoJS `RenderTexture`
   is hard-wired to an 8-bit color attachment (`WebGl2Backend` `_syncTexture`, RenderTexture
   branch), so **float render targets are out of scope here**.
3. **Float is deferred to ExoJS**, not worked around in Blink. A self-contained engine
   enhancement spec was written at
   `../ExoJS/.workspace/specs/2026-07-06-render-texture-float-format.md` (indexed in that repo's
   `roadmap/03-needs-refinement.md`). When it lands, Blink's `RenderTargetPool` maps
   `BlinkRenderTargetSpec.format` straight through — no other Blink change.

## Current state (grounding)

- IR data layer is complete and well-tested: `BlinkPassSpec { name, shader, inputs, target,
  clear }`, `BlinkRenderTargetSpec { name, width, height, scale, format, persistent }`,
  `BlinkPassTarget = { kind: 'screen' } | { kind: 'renderTarget'; name }` in
  `src/runtime/ir/types.ts`. Loaders (`src/packages/blinkfx/loader.ts`,
  `src/packages/ssf/SynSceneLoader.ts`) already produce passes + render targets;
  `buildImplicitPass` emits the implicit screen pass.
- Render path is single-mesh: `RenderService.updateBlinkFxShader`
  (`src/services/RenderService.ts:233`) picks the one `target.kind === 'screen'` pass, builds a
  fullscreen `Mesh` + `MeshMaterial`, and `BlinkScene.draw` (`:81`) renders that one mesh + the
  Statistics overlay. No framebuffer / render-target management exists anywhere yet.
- Render helpers (pure, tested) in `src/runtime/render/`: `buildBlinkPrelude`,
  `buildDefaultUniformValues`, `buildBlinkFrameValues`, `buildBlinkAudioValues`,
  `mapControlSpecs`, `stripGlslPreamble`, `upgradeFragmentShaderToGl300`. Reused as-is.

## SSF multipass semantics (verified against real scenes)

From `.workspace/SSF_Builtin/pxl_sort_1.synScene` (`scene.json` + `main.glsl`):

- `PASSES: [{ TARGET: "backbuffer" }]` declares one intermediate buffer. **Total passes =
  `PASSES.length` + 1**: pass `i` (`i < len`) renders into `PASSES[i].TARGET`; the final pass
  (index `len`) renders to screen.
- The shader branches on `PASSINDEX` (float): pass 0 writes `backbuffer` and samples
  `texture(backbuffer, _uv)` — which is the **previous frame's** content (feedback ⇒ persistent
  ping-pong). The final pass samples the just-written `backbuffer` and outputs to screen.
- A buffer's `TARGET` name is a `sampler2D` uniform bound to that target's texture. A pass that
  samples **its own** target reads the previous frame (`readsPrevFrame`); sampling another
  pass's target reads that target's current-frame result. `backbuffer` is Synesthesia's
  conventional persistent feedback buffer name.
- `FLOAT: true` on a pass makes its target a float texture (out of scope this slice → rgba8).

## Architecture

New package **`src/runtime/render/pass/`** (pure runtime logic). **Substrate:
`RenderingContext.renderTo(node, { target, clear? })`** for off-screen passes and
`context.render(node)` for the screen pass. `renderTo` renders a node into a caller-owned
`RenderTexture`, save/restoring state, and **preserves the target's contents when `clear` is
omitted** (per ExoJS `DrawContext` docs) — the mechanism feedback relies on. The engine's own
examples `examples/render-targets/trail-feedback.ts` (ping-pong feedback) and
`post-processing-chain.ts` (N-pass off-screen chain then composite) validate this approach and
the constraint below. (ExoJS also ships `RenderPipeline` + `RenderNodePass`, but those fix a
pass's target at construction, which would force *two* pipeline variants to ping-pong; the
imperative `renderTo` loop selects the target per call, so one pass loop suffices.)

**Hard constraint (from `trail-feedback.ts`):** a pass may **not** read and write the *same*
`RenderTexture` — that is a GL feedback loop (`INVALID_OPERATION`). Feedback therefore *requires*
two physical textures per persistent target: read the previous frame from one, write the new
frame into the other, and alternate which is which per frame (frame parity).

### `RenderTargetPool`

Owns the physical `RenderTexture` instances derived from `effect.renderTargets[]`.

- Non-persistent target → one `RenderTexture` (written then read within the same frame; distinct
  from any buffer it samples).
- Persistent target → **two** physical textures `(X, Y)`. On even frames the pass reads `Y`
  (previous) and writes `X`; on odd frames it reads `X` and writes `Y`. The unread texture is
  preserved across the frame (no clear), which is the feedback source.
- Sizing: `width`/`height` when given, else `scale` × screen size, else screen size.
- `resize(width, height)` reallocates all textures (persistent contents reset — a deliberate
  one-frame loss on resize).
- rgba8 only this slice; `format` is read but non-rgba8 downgrades to rgba8 with one console
  warning (documented degradation until the ExoJS float enhancement lands).
- `dispose()` destroys every `RenderTexture`.
- Accessors resolve a target name + frame-parity to the correct physical texture:
  `write(name, parity)` / `read(name, prevFrame, parity)`.

### `BlinkPass`

Each `BlinkPassSpec` compiles once to a `CompiledPass`: a fullscreen-quad `Mesh` (+
`MeshMaterial`, built with the existing prelude/control machinery exactly as
`updateBlinkFxShader` does today, plus the injected `bl_pass` uniform and one `sampler2D` per
input), together with its resolved `target`, `inputs` (`{ uniform, source, readsPrevFrame }`),
`clear`, and `passIndex`.

```ts
interface CompiledPass {
  name: string;
  mesh: Mesh;
  material: MeshMaterial;
  target: BlinkPassTarget;   // { kind:'screen' } | { kind:'renderTarget', name }
  inputs: ReadonlyArray<{ uniform: string; source: string; readsPrevFrame: boolean }>;
  clear: boolean;
  passIndex: number;
}
```

### `BlinkPassRuntime`

Builds the compiled passes + pool and drives them each frame; replaces the single-mesh path.

- `build` compiles every pass in IR order and allocates the pool.
- `execute` runs one imperative loop over the passes (see Data flow) using
  `context.renderTo` / `context.render`, then flips frame parity. Per-frame uniform upload
  (frame/audio/control + `bl_pass` + input samplers) happens per pass, immediately before its
  draw.
- `resize` forwards to the pool (and updates the `bl_resolution`/`RENDERSIZE` the executor
  uploads); `dispose` destroys every pass material + the pool.

```ts
class BlinkPassRuntime {
  build(effect: BlinkEffectIR, screen: { width: number; height: number }): void;
  execute(context: RenderingContext, upload: (material: MeshMaterial, passIndex: number) => void): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
```

### `bl_pass` uniform (deliberate, v1-compatible ABI addition)

The runtime injects `uniform int bl_pass;` into the prelude so a **single shared shader** can
branch across passes (mirrors SSF `PASSINDEX`), making SSF ports nearly mechanical. The native
"one shader file per pass" form (`shaders.glsl` map + `BlinkPassSpec.shader`) remains fully
supported and unchanged — `bl_pass` is additive and breaks no existing package. (Note in the
BlinkFX v1 contract doc as an additive prelude uniform.)

## Data flow

**Build time** (`BlinkPassRuntime.build`, invoked from `RenderService.updateBlinkFxShader`):

1. `RenderTargetPool` from `effect.renderTargets` (two physical textures per `persistent`).
2. For each `effect.passes[i]` in IR order: resolve the shader source
   (`shaders.glsl[pass.shader]`), compile the material once (prelude + controls + `bl_pass` +
   input samplers), record `inputs[]` as `{ uniform, source, readsPrevFrame }` (`readsPrevFrame`
   = input name equals this pass's own target name), `target`, `clear`, `passIndex = i`.
3. Store the compiled passes; no pipeline objects are built (imperative loop at execute).

**Frame time** (`BlinkPassRuntime.execute`, from `BlinkScene.draw`):

1. For each compiled pass in IR order:
   - upload per-pass uniforms to `pass.material` via the injected `upload(material, passIndex)`
     callback (frame/audio/control + `RENDERSIZE`, reusing the current `uploadUniforms` logic)
     and set `bl_pass = pass.passIndex`;
   - bind each input's `sampler2D` to `pool.read(source, readsPrevFrame, parity)`;
   - `renderTarget` pass: `context.renderTo(pass.mesh, { target: pool.write(name, parity),
     clear: pass.clear ? clearColor : undefined })`;
   - `screen` pass: `context.render(pass.mesh, { view: context.screenView })`.
2. Flip frame parity for next frame.
3. Statistics overlay renders after the pass loop (unchanged).

`readsPrevFrame` model: an input reads the *previous* frame only when it names the pass's **own**
target (self-referential feedback, e.g. `sim` writing and reading `backbuffer`); any other input
reads the source target's **current**-frame texture. This covers self-referential feedback and
forward chains (a later pass reading an earlier pass's output this frame), which is what
`audio_indicators` and the synthetic fixture need. General cross-buffer *previous*-frame reads
(naming another persistent buffer expecting its prior frame) are not specially modelled this
slice.

**Integration point**: `RenderService` holds a `BlinkPassRuntime` instead of a single
`sceneMesh`. `updateBlinkFxShader` calls `build`; `BlinkScene.draw` calls `execute`; `resize`
forwards to `runtime.resize`. The multipass warning (`:245`) and the single-screen-pass `find`
are removed. Material disposal on effect replacement extends to all pass meshes + pool targets.

## SSF loader unfolding mechanics

`SynSceneLoader.parsePasses` (`src/packages/ssf/SynSceneLoader.ts:97`) currently folds all
`PASSES` into a single screen pass. Change it to emit **real multipass IR**:

- **Passes:** for `PASSES = [P0, P1, … Pn-1]`, emit `n` buffer passes
  (`{ name: Pi.TARGET, shader:'main', target:{kind:'renderTarget', name: Pi.TARGET}, inputs:
  <all buffer names>, clear:false }`) followed by one final screen pass
  (`{ name:'present', shader:'main', target:{kind:'screen'}, inputs:<all buffer names>,
  clear:true }`). Every pass reuses the single `main` shader; per-pass behaviour comes from the
  `PASSINDEX` branch already in the SSF shader.
- **Render targets:** one `BlinkRenderTargetSpec` per `PASSES[i].TARGET`, `persistent: true`
  (SSF buffers are ping-pong feedback by default; a target treated persistent still renders a
  transient-style chain correctly — `read(current)` and `write` resolve to the same physical
  texture). `format: 'rgba8'` this slice (SSF `FLOAT` degraded, warned). Drop the current
  hard-coded `1920×1080`; use `scale: 1` (screen-sized).
- **`PASSINDEX` per pass:** the SSF prelude already declares `uniform int PASSINDEX;`
  (`ssfPrelude.ts:15`). The runtime's per-pass upload sets `PASSINDEX = passIndex` (float-cast
  as the shader compares `PASSINDEX == 0.0`) alongside `bl_pass`. So SSF shaders need no change.
- **Buffer samplers:** the SSF prelude hard-codes `uniform sampler2D feedback; uniform sampler2D
  helper;` (`ssfPrelude.ts:18-19`) — exactly `audio_indicators`'s buffers. Generalise: inject
  `uniform sampler2D <name>;` per `PASSES[i].TARGET` from `adaptSsfShader` (passed the target
  names) and remove the hard-coded pair, so any `.synScene`'s buffers are declared. Guard against
  duplicate declaration for effects that already declare them.
- **`readsPrevFrame`:** as in the runtime — an input reads the previous frame when it names the
  pass's own target. For SSF every pass lists all buffers as inputs; self-reference → prev frame,
  others → current. Covers feedback and forward chains; general cross-buffer temporal reads are
  not specially modelled (documented limitation).

**Primary real target — `audio_indicators.synScene`**: `PASSES:[{TARGET:"feedback"},
{TARGET:"helper"}]` → passes `feedback`(idx0), `helper`(idx1), `present`(idx2); `feedback`
persistent (self-sampled). Its samplers are already declared. Renders correct feedback once
unfolded (today folded/incorrect). `pxl_sort`/`cosmic_dust` additionally need their SSF helpers
(`_fbm`, `_rotate`, `_pixelate`, `_uvc`, `_loadMedia`, `FRAMECOUNT`) added to `ssfPrelude.ts` —
tracked as a stretch/follow-up, not required for this slice's green bar.

## Testing strategy

- **Unit (headless, deterministic)** in `src/runtime/render/pass/__tests__/`:
  - `RenderTargetPool`: parity read/write selection, persistent (2 textures) vs. transient (1),
    resize reallocation, unknown-name error — with a stub `RenderTexture` factory.
  - `planPasses`: pass order, `readsPrevFrame` detection, unknown-input error, implicit single
    screen pass. `executePasses`: call order, per-pass sampler binding, `renderTo` vs `render`
    target selection across parities — with a fake context + fake passes/pool.
  - `buildPassPrelude`: `bl_pass` present, one `sampler2D` per input, empty-input case.
- **SSF unfolding** in `src/packages/ssf/__tests__/`: `parsePasses` emits `n+1` passes + `n`
  persistent targets with correct names/inputs; single-pass scenes still emit one screen pass;
  `adaptSsfShader` declares a `sampler2D` per target and no longer hard-codes `feedback`/`helper`.
- **Synthetic native fixture**: a 2-pass transient `.blinkfx` (pass 0 writes a constant color to
  a buffer, pass 1 samples it → screen) → deterministic `loadBlinkFx` → `planPasses` test, plus a
  real `public/effects/multipass_probe.blinkfx/` package for live smoke.
- **Live smoke (`/run`)**: `audio_indicators.synScene` renders with correct feedback trails
  (persist across frames; broken today under the folded path); `multipass_probe.blinkfx` shows
  the transient chain. Verify no console errors and window-resize keeps rendering.

## Scope

**In scope**: multipass + persistent feedback (ping-pong) on rgba8; `bl_pass` + per-pass
`PASSINDEX`; RenderService integration; `SynSceneLoader` PASSES unfolding + generalised buffer
samplers; `audio_indicators.synScene` verified + 1 synthetic native fixture; the ExoJS float spec
(written; implementation external).

**Out of scope** (later slices): float render targets (waits on ExoJS enhancement); adding the
remaining SSF built-in helpers so `pxl_sort`/`cosmic_dust` render (stretch); native image assets,
presets, native scripting; compute passes; video/media streaming inputs.

## Error handling

- Unknown buffer input name at build → throw with effect id + pass name (fail fast, before
  first frame).
- `RenderTexture` allocation failure → console warning + skip the offending target, degrade to
  the screen pass only; never crash the frame loop.
- Non-rgba8 `format` requested this slice → one console warning, allocate rgba8.
- Resize mid-feedback → pool reallocates; persistent contents intentionally reset (one-frame
  visual discontinuity, acceptable).

## Risks & mitigations

- **Feedback preservation & the read/write-same-RT hazard** — *de-risked by the engine examples*.
  ExoJS's own `examples/render-targets/trail-feedback.ts` demonstrates ping-pong (two textures,
  alternated) and documents that reading and writing the same `RenderTexture` is a GL feedback
  loop (`INVALID_OPERATION`). Our two-texture-per-persistent-target + parity design follows that
  invariant; `renderTo` with `clear` omitted preserves the unread texture (per `DrawContext`
  docs). A persistence integration check is still the first end-to-end test.
- **Sampler binding of a `RenderTexture` as a material uniform** (open): confirm `MeshMaterial`
  accepts a `RenderTexture` as a `sampler2D` uniform value. `RenderTexture` is a valid texture
  source (the examples sample it via `Sprite(rt)`), and materials already bind `DataTexture`
  uniforms — but binding a `RenderTexture` to a custom material sampler must be validated in the
  very first implementation step; if unsupported, wrap via the pass's `PassContext`/backend bind.
- **State/disposal leaks** on effect switch: dispose every compiled pass's material + mesh and
  every pool `RenderTexture` on `build`-replacement and teardown, following the existing
  material-free/dispose discipline (`this.sceneMesh?.material?.destroy()` today).

## Follow-up slices (not this one)

1. ExoJS float `RenderTexture` (spec already handed off) → flip pool targets to real `format`;
   restore SSF `FLOAT` targets to `rgba16f`/`rgba32f`.
2. Extend `ssfPrelude.ts` with the remaining SSF built-ins (`_fbm`, `_rotate`, `_pixelate`,
   `_uvc`, media helpers, `FRAMECOUNT`) so `pxl_sort`, `cosmic_dust`, and the wider `.synScene`
   multipass library render.
3. Native `.blinkfx` image assets, presets, and native scripting execution (all parsed to IR
   today, none executed).
