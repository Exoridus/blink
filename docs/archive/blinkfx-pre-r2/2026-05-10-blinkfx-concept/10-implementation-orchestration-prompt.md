# 10 — Implementation Orchestration Prompt

## How to use this document

This is a copy-pastable prompt for **Claude Opus** as the architectural lead. Opus should maintain the overall plan, inspect the existing repository, and delegate narrow implementation tasks to **Claude Sonnet** or prepare precise task packets for **Codex**.

---

## Prompt for Claude Opus

You are the architecture lead for modernising the existing Blink repository. Do **not** create a new greenfield project. Continue and refactor the existing codebase incrementally.

### Project goal

Modernise Blink into a browser-based audio-visualisation app with:

- `/` as fullscreen output client
- `/control` as responsive control UI
- a native `.blinkfx` package format
- native ISF and SSF compatibility loaders
- one normalised internal `BlinkEffectIR`
- a stable Blink shader/audio ABI
- optional scoped native scripting
- local control transport for MVP via `ws://localhost:1337`

### Non-goals

- no general-purpose 3D scene platform
- no greenfield rewrite
- no giant single PR
- no arbitrary native script access to engine internals
- no compute-pass implementation in v1 unless separately approved

### Required source reading before changes

Read:

1. the existing Blink repository
2. the concept pack docs
3. current ExoJS public APIs used by Blink
4. official SSF docs
5. official ISF docs

### Working principles

- Prefer vertical slices that keep the app runnable.
- Separate **confirmed current behaviour**, **desired target behaviour**, and **migration steps**.
- Keep BlinkFX native; do not contort it into SSF/ISF naming.
- SSF and ISF support belong in loaders/adapters, not in native format design.
- Do not overbuild speculative future features.
- Preserve strict TypeScript quality.

### Architecture target

```text
BlinkFX / ISF / SSF loaders
        ↓
BlinkEffectIR
        ↓
Runtime services
  - render
  - audio
  - scripts
  - package lifecycle
        ↓
Output client + control client
```

### High-level phases

#### Phase 0 — Baseline audit

- inspect current code
- identify what can be reused
- record current tests / missing tests
- decide minimal ExoJS bump required

#### Phase 1 — Native domain model

- define `BlinkEffectIR`
- define native BlinkFX manifest types
- implement manifest validation
- add a minimal `.blinkfx` example
- adapt current local scenes into IR through a temporary loader

#### Phase 2 — Native runtime slice

- implement native Blink audio frame / texture layer
- replace direct scene mesh construction with a minimal pass runtime
- preserve one-pass fullscreen rendering first
- then add persistent target / feedback support

#### Phase 3 — App split and protocol

- add route-based `/` and `/control` bootstrapping
- define transport interface and protocol types
- implement local WebSocket-broker-compatible client transport
- implement effect list / activate / control set flow end-to-end

#### Phase 4 — Package lifecycle

- install / uninstall native packages
- package registry
- asset loading / unloading
- resource cleanup

#### Phase 5 — Compatibility loaders

- ISF parser / adapter
- SSF parser / adapter
- helper preludes and compatibility aliases
- warnings for unsupported subsets

#### Phase 6 — Optional scripting

- native scoped script context
- manifest-bound handlers
- resource scopes
- SSF documented script compatibility subset

### Delegation rules

Use Sonnet / Codex for **narrow mechanical tasks only**. Every delegated task must include:

- exact files or subsystem scope
- target behaviour
- non-goals
- validation commands
- definition of done
- expected output format

Do not delegate ambiguous architecture decisions.

### Good delegation examples

#### Sonnet task: manifest types

Implement `BlinkFxManifest` TypeScript types and zod-free hand-written validation in a new `src/packages/blinkfx/` module. Do not touch rendering. Add fixture tests for minimal and full manifests.

#### Sonnet task: route split

Refactor app bootstrap so `/` mounts `OutputApp` and `/control` mounts `ControlApp`, preserving current output behaviour. Do not redesign UI styling yet.

#### Codex task: package example fixtures

Create two fixture package directories under `examples/` matching the approved manifest spec. Ensure paths and JSON are valid. No runtime changes.

### Required outputs after each phase

1. summary of what changed
2. affected files
3. tests run
4. known limitations
5. next recommended phase

### Things to watch carefully

- Current uploaded project uses SSF-shaped scene classes; do not let those become the new core model.
- Current `RenderService` is WebGL2-only and built around one fullscreen mesh.
- Current `WebsocketService` is historical and should not define the new protocol.
- ExoJS current main has newer audio / texture capabilities than the uploaded Blink lockfile version.
- Keep compatibility adapters separate from native BlinkFX ABI.

### First requested action

Start with a written repository audit and a proposed file-by-file phase 1 plan. Do not implement code until the audit is complete.
