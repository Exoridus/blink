# 11 — Source Notes

## Official SSF sources consulted

- Synesthesia Shader Format overview
- SSF JSON configuration
- SSF standard uniforms
- SSF audio uniforms
- SSF helper functions
- SSF JavaScript scripting

## Official ISF sources consulted

- ISF specification repository
- ISF JSON reference / quick-start material

## Current ExoJS sources inspected

- `CHANGELOG.md` current main branch
- `src/audio/AudioAnalyser.ts`
- `src/audio/BeatDetector.ts`
- `src/rendering/texture/DataTexture.ts`
- relevant rendering / shader filter files from the current repository state

## Existing Blink project sources inspected

- `package.json`
- `src/index.ts`
- `src/classes/Application.ts`
- `src/classes/Scene.ts`
- `src/classes/SceneService.ts`
- `src/classes/Control.ts`
- `src/services/AudioService.ts`
- `src/services/RenderService.ts`
- `src/services/WebsocketService.ts`
- `src/ui/StartScreen.ts`
- `vite.config.ts`

## Research conclusions that are source-backed

- SSF packages are GLSL-centred `.synScene` directories with JSON config, optional script, and optional images.
- SSF exposes a rich audio-reactive surface including spectrum and level-trail textures.
- SSF scripting officially includes setup/update, uniform manipulation, control manipulation, event registration, OOP use cases, pixel readback, and debug output.
- ISF is a GLSL shader file with JSON header, generic inputs, built-ins, helper image functions, multipass support, and persistent buffers.
- ExoJS current main has substantially better primitives for Blink's desired audio layer than the uploaded Blink project currently uses.

## Research limitations

- Public web search did not reveal a broad, reliable corpus of third-party SSF scene repositories or script-heavy scene examples.
- Some SSF scripting semantics still require empirical testing in the actual application, especially lifecycle ordering and `textureFinalPass()` behaviour.
- Exact Synesthesia audio normalisation / juicing curves are not guaranteed by the public docs alone.
