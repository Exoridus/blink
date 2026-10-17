# 01 — Blink Product Concept

## Executive summary

**Blink** should become a modern browser-based audio-visualisation application for spectacular real-time 2D shader visuals. It should continue the existing project rather than replace it, but the architecture should be modernised around three stable concepts:

1. **Blink runtime** — the player / renderer / audio analysis engine.
2. **BlinkFX packages** — native self-contained effect packages.
3. **Control plane** — an output client and a separate responsive control UI kept in sync over a transport layer.

Blink is not intended to become a general 3D scene engine, a node-based compositor, or a generic creative-coding platform. Its strength is narrower and clearer:

> **High-quality real-time audio-reactive visuals built from fragment shaders, multipass feedback, and curated effect packages.**

## Product goals

### Primary goals

- Produce **spectacular** audio-reactive visuals in a browser.
- Make effects **self-contained, shareable, installable, and removable**.
- Support **native BlinkFX packages** and **external SSF / ISF packages**.
- Offer a **stable authoring ABI** after BlinkFX 1.0 so packages keep working without per-package Blink or ExoJS version negotiation.
- Provide a **remote-control model** suitable for live use:
  - output client: fullscreen visual output
  - control client: responsive operator UI
- Use ExoJS as the rendering/audio backbone rather than rebuilding basic engine infrastructure.

### Non-goals

- General-purpose 3D scenes
- Camera systems as a core format feature
- Arbitrary scene graphs inside effect packages
- Full node-based video compositing
- Replacing dedicated VJ suites
- Making every imported foreign format lossless in every corner case

## Product shape

### Output client (`/`)

Responsibilities:

- Render the active effect fullscreen.
- Acquire / receive the active audio source.
- Maintain the current runtime state.
- Receive control commands and publish state snapshots.
- Stay visually minimal; no operator UI beyond diagnostics / boot errors.

### Control client (`/control`)

Responsibilities:

- Browse installed effects.
- Select, activate, and transition between effects.
- Expose effect controls from the active package.
- Install / uninstall packages.
- Manage presets.
- Display connection and runtime status.
- Later: support playlists, favourites, transition automation, device selection.

### Package system

Blink should support three kinds of input:

1. **Native `.blinkfx` packages**
2. **ISF files**
3. **SSF `.synScene` directories**

Native BlinkFX is the preferred authoring target for new effects. ISF and SSF are compatibility formats, not templates for the native format.

## Visual philosophy

A native Blink effect should not default to “spectrum bars plus glow.” Spectacle should be treated as a design property:

- audio should modify **structure**, not only brightness
- strong effects should have a recognisable motion architecture
- depth can come from recursive fields, tunnels, layered masks, feedback, volumetric illusions, or raymarched forms
- effects should have a compelling idle state when audio is quiet
- effects should remain legible at low and high energy
- presets should represent meaningful curated looks, not random parameter snapshots

## Why BlinkFX should be native instead of SSF-shaped

Because Blink can support SSF and ISF directly through loaders, the native format does not need to preserve their historical naming and structure. This gives BlinkFX freedom to be:

- simpler than SSF where SSF carries application-specific history
- more audio-visual-specific than ISF where ISF stays generic
- modern in naming, layout, and scripting API
- tightly matched to Blink’s intentionally narrow long-term scope

## Existing project continuation

The uploaded project already contains useful foundations:

- a Vite + TypeScript application
- a fullscreen rendering path
- audio source acquisition
- an `AudioService`
- a scene loader with SSF-like fields (`CONTROLS`, `IMAGES`, `PASSES`, transitions)
- an older WebSocket service

The target is not to discard these pieces, but to refactor them into clearer layers:

```text
Current scene-centric prototype
        ↓
Package loaders + BlinkEffectIR + runtime services
        ↓
Native BlinkFX + SSF/ISF adapters + client/control split
```

## MVP recommendation

### MVP scope

- `/` output client
- `/control` host UI
- local connection between both
- native BlinkFX loader
- core BlinkFX v1 fragment-pass runtime
- package install / uninstall from local uploads
- control syncing
- one or two native demo packages
- one ISF demo import
- one SSF demo import (without complex script dependencies)

### Explicitly defer

- cloud accounts
- remote installation marketplaces
- compute passes
- panels / masks
- package signing
- playlists
- remote Internet transport
- perfect SSF scripting compatibility

## Success criteria

Blink reaches a strong first milestone when:

1. A native `.blinkfx` package can be dropped in, discovered, loaded, controlled, and unloaded without custom code.
2. `/control` can drive `/` in real time.
3. ISF and SSF examples can be loaded through the same runtime pipeline.
4. Audio-reactive built-ins are stable enough that future packages do not need to know Blink or ExoJS implementation details.
5. The codebase is clearer after the refactor than before it.
