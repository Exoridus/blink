# SSF visual parity implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution.

**Goal:** Separate render dimensions from presentation and expose deterministic visual diagnostics.

**Architecture:** Retain the common pass runtime and independent Lab lanes. Use the browser canvas compositor for preview fitting, with a fixed backing framebuffer.

**Tech Stack:** TypeScript, ExoJS 0.19.1, WebGL2, Vitest, Playwright.

**Spec:** docs/ssf-visual-parity.md and the supplied visual parity brief.

## Global constraints

No DSP or ExoJS modifications. No push, merge, PR or commit. Preserve existing line endings.

## Review focus

Square preview, cropped pointer coordinates, resize without feedback reset,
small pass coordinates, and float RGBA versus browser presentation.

## Tasks

- [x] Add output settings, fitting/pointer math and cancellable RAF cap; test square fit, crop, invalid dimensions, and cap cancellation red then green.
- [x] Integrate output sizing in RenderService and shell settings; test resize invariance and per-pass RENDERSIZE.
- [x] Integrate common Lab output settings, deterministic coordinate/texture probes and enriched export; retain private scripts, PCM and feedback.
- [x] Run GPU corner, ramp, alpha/color and resizing probes, targeted tests, typecheck and build. Record scope and first divergent stage without claiming screenshot/native pixel parity.

Rulings: The supplied design authorizes inline implementation without another approval round. Native pass-sized RENDERSIZE supersedes the earlier synthetic screen-uniform claim. The first divergent sizing stage uses a fixed canvas framebuffer and browser compositor fitting. Standard inverse sRGB at final presentation is warranted by the native context contract and the failing GPU color fixture. Lab clock remains60Hz independent of FPS cap; live drift stops playback. Reference PNG tests are plumbing only, not a native parity acceptance.
