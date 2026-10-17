# Start gallery and static effect previews

The start page selects an audio source first. Clicking an effect thumbnail starts
that effect immediately with the selected source. Native BlinkFX, shipped SSF and
community SSF remain separate groups. Source fields and keyboard-accessible effect
buttons replace the dropdown and source submit buttons. The last effect/source
preferences, default stream URL and centered error display remain available.

Bundled previews are generated offline through the existing application runtime
and served as static PNG files. The application needs no rendering server or
background GPU instances for browsing. Each preview has a content fingerprint
covering its scene/package inputs and the rendering/conversion implementation.
Hashed image paths permit HTTP caching; an optional preview manifest maps effect
IDs to images. Missing or failed previews do not prevent effect selection.

The generator emits `public/effects/previews/manifest.json`, with version 1 and a
`previews` object mapping IDs to `{path, fingerprint, source}`. Paths are relative
to the application's public base. Source identifies rendered, declared-thumbnail
or blank fallback images. Existing scene images can cover media-only or initial
blank output. Previews use synthetic audio, not a recording of the user's source.

Implementation:

1. Add optional preview URLs to package listing, reading preview metadata once with
   the catalog and tolerating absent/unavailable/invalid preview manifests. Catalog
   refresh atomically replaces both list and preview metadata; loading remains
   unchanged. Verify fallback, metadata refresh and base-path resolution.
2. Generate actual screenshots in isolated Chromium with the same loader/runtime,
   preserving original render targets and scripts. Save each result incrementally
   and skip unchanged fingerprints on rerun. Produce bundled static images.
3. Replace StartScreen selection/submission with responsive grouped image buttons
   and compact source selection. Verify direct submission, readiness, loading lock,
   restored effect/source selection, escaping and keyboard access.
4. Inspect browser layout on desktop/mobile, start an effect from the gallery,
   verify static preview loading and persistence, then run focused tests and type
   checking. Existing source compatibility gates remain unchanged.

IndexedDB is an alternative for later locally generated previews of user-installed
packages. The bundled gallery uses the static option so browsing does not require
rendering 135 effects on the user's device.

## Regenerating bundled previews

Run with a local development server available; the generator can start Vite itself
when the default localhost server is absent:

```text
node scripts/render-effect-previews.mjs --fresh-browser
node scripts/render-effect-previews.mjs --only com.codexo.aurora --force --fresh-browser
```

Each success is persisted immediately. Unchanged fingerprints reuse the existing
PNG. `--fresh-browser` isolates expensive scenes to avoid accumulated browser/GPU
state; `--timeout-ms` sets the per-scene watchdog. Generated files and the manifest
are static deployment inputs; no render process needs to run on the hosted app.

Preview metadata is optional. Missing, invalid or stalled metadata falls back to
selectable effect cards; its request is aborted after three seconds. Image failures
hide only the broken image. Hashed file paths keep refreshed previews independent
of an older cached PNG.

The bundled catalog contains 135 preview files at 320x180: 125 captured from actual
rendered frames and 10 using the scene's declared image after an initially dark
render. Image decoding is lazy. The static bundle occupies 9.09 MiB. Runtime playback
remains independent of preview metadata and browser storage permissions.

## Validation

All 135 previews passed PNG CRC/decompression, dimensions and manifest-path checks.
All 135 were reused on an unchanged rerun. Neuron Proximitors initially exceeded
its reused-browser watchdog, then completed six frames without GL errors in an
isolated retry. See [preview evidence](evidence/effect-gallery/previews.json).

The final UI/service gate passed 114 targeted tests, type checking and targeted
lint. Chromium checked 135 cards and static images, all three groups, desktop and
390-pixel mobile layouts, keyboard start, loading lock, fresh file selection,
preference restoration, broken-image fallback and a safely escaped microphone
failure followed by successful playback. Before activation the gallery creates no
canvas or GPU context. See [browser evidence](evidence/effect-gallery/browser.json).
