# Blink Concept Pack

This archive is a consolidated design package for continuing and modernising the existing **Blink** prototype rather than starting a new project from scratch.

## Documents

1. [`docs/01-product-concept.md`](docs/01-product-concept.md) — Blink as a modern audio-visualisation app
2. [`docs/02-blinkfx-format.md`](docs/02-blinkfx-format.md) — native `.blinkfx` package format, manifest, defaults, layout, examples
3. [`docs/03-runtime-abi.md`](docs/03-runtime-abi.md) — native shader ABI, audio surface, scripting API, lifecycle
4. [`docs/04-isf-overview.md`](docs/04-isf-overview.md) — concise ISF overview
5. [`docs/05-ssf-overview.md`](docs/05-ssf-overview.md) — concise SSF overview
6. [`docs/06-compatibility-architecture.md`](docs/06-compatibility-architecture.md) — how native BlinkFX, ISF, and SSF converge into one runtime
7. [`docs/07-open-questions-and-verification-plan.md`](docs/07-open-questions-and-verification-plan.md) — what is still unverified and what to test
8. [`docs/08-existing-project-modernisation.md`](docs/08-existing-project-modernisation.md) — how to evolve the uploaded Blink project
9. [`docs/09-control-plane-and-mvp.md`](docs/09-control-plane-and-mvp.md) — `/` output client, `/control` host UI, local transport, protocol sketch
10. [`docs/10-implementation-orchestration-prompt.md`](docs/10-implementation-orchestration-prompt.md) — implementation prompt / orchestration plan for Claude Opus delegating to Sonnet or preparing Codex tasks
11. [`docs/11-source-notes.md`](docs/11-source-notes.md) — source inventory and research notes

## Supporting files

- [`schemas/blinkfx.types.ts`](schemas/blinkfx.types.ts) — proposed TypeScript format surface
- [`examples/minimal.blinkfx/`](examples/minimal.blinkfx/) — minimal valid native package
- [`examples/full.blinkfx/`](examples/full.blinkfx/) — illustrative fuller native package

## Core decisions captured here

- **BlinkFX is native, modern, and deliberately not shaped like SSF or ISF.**
- **SSF and ISF are supported as external formats through native loaders/adapters.**
- **All formats normalise into the same internal Blink IR and runtime pipeline.**
- **Blink remains intentionally narrow:** 2D, shader-first, audio-reactive visual effects; no general-purpose 3D scene platform.
- **BlinkFX v1 stays small:** fragment passes, controls, textures/assets, presets, optional scripts; compute remains a later optional extension.
- **Scripting is optional, scoped, and resource-owned** in native BlinkFX; SSF scripting compatibility is handled separately.
- **MVP app structure:** `/` is the fullscreen output client; `/control` is the responsive host UI; both stay synchronised through a small local transport layer.

