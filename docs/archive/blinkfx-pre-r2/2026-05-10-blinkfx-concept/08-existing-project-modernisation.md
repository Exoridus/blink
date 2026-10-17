# 08 — Existing Project Modernisation

## Current uploaded project snapshot

The uploaded project already contains:

- Vite + TypeScript setup
- ExoJS dependency (`@codexo/exojs` currently pinned to `^0.8.2` in the uploaded ZIP)
- fullscreen render path
- audio source selection (`mic`, `screen`, URL, upload)
- an `AudioService`
- SSF-inspired `SceneConfig` models (`CONTROLS`, `IMAGES`, `PASSES`, transitions)
- a local scene list and scene loader
- an older `WebsocketService`

## Current architectural characteristics

### Positive foundations

- The project already understands the notion of a self-contained scene/effect.
- Existing code has useful typed domain objects for controls, images, passes, and transitions.
- The rendering path already uses ExoJS rather than a bespoke renderer.
- The audio path already combines `AudioAnalyser` and `BeatDetector`.

### Main limitations

1. **Scene model is source-format-shaped**
   - current domain types mirror SSF naming rather than a native Blink model.

2. **Renderer is currently WebGL2-only**
   - the current `RenderService` explicitly requests `{ type: 'webgl2' }`.

3. **Shader execution is one fullscreen mesh path**
   - no native package pass runtime yet.

4. **Audio surface is bespoke and legacy-named**
   - current globals use `BASS`, `MID`, `TREBLE`, `BPM`, etc., not the proposed native Blink ABI.

5. **Scene loading is local and ad hoc**
   - hard-coded scene list, `main.frag`, loose config normalisation.

6. **WebSocket layer is historical**
   - its opcodes describe a prior server/plugin ecosystem rather than the new Blink output/control protocol.

7. **No `/control` surface yet**
   - current start screen is embedded in the output app.

## Refactor direction

### Target modules

```text
src/
├── app/
│   ├── output/
│   └── control/
├── packages/
│   ├── blinkfx/
│   ├── isf/
│   └── ssf/
├── runtime/
│   ├── ir/
│   ├── render/
│   ├── audio/
│   ├── script/
│   └── package-lifecycle/
├── transport/
│   ├── protocol/
│   └── client/
└── shared/
```

### Migration strategy

#### Phase 1 — Stabilise the base

- bump ExoJS to current release needed for `DataTexture`, visual beat getters, and dual shader support
- keep current output working
- add tests around current audio and scene behaviour

#### Phase 2 — Introduce the IR layer

- define `BlinkEffectIR`
- add `BlinkFxLoader`
- adapt the current local scenes through a temporary loader into the IR
- stop letting UI or runtime code depend directly on SSF-shaped scene fields

#### Phase 3 — Introduce the runtime

- replace `createSceneMesh()` with a pass runtime capable of native package passes
- add native audio frame / texture assembly
- add render target ownership and disposal

#### Phase 4 — Split client and control surfaces

- `/` becomes output client
- `/control` becomes control UI
- move start/configuration responsibilities into control surface where appropriate
- introduce the new protocol and transport

#### Phase 5 — Compatibility loaders

- add ISF loader
- add SSF loader
- add compatibility shader preludes / aliases
- add documented warnings for unsupported features

#### Phase 6 — Native scripting and package lifecycle

- add scoped script context
- add package install / uninstall
- add resource scopes and cleanup

## Recommended deletions / replacements

| Existing element | Recommendation |
|---|---|
| `SceneService` hard-coded list | replace with package registry |
| SSF-shaped `Scene` as core model | keep only inside SSF loader, not core runtime |
| old `WebsocketService` protocol | replace with new Blink control protocol |
| current start screen in output app | move source/effect selection to `/control` MVP UI |
| legacy global uniform map | replace with native Blink ABI builder |

## What to preserve

- useful local audio acquisition utilities
- typed control concepts where they fit native controls
- ExoJS integration patterns
- render statistics / debug visibility
- project style discipline rather than introducing unnecessary framework churn

## Important caution

Do not perform a giant all-at-once rewrite. The project should be modernised in vertical slices:

1. native package loader
2. native runtime
3. control transport
4. compatibility loaders
5. scripts / lifecycle

Each step should leave the app runnable.
