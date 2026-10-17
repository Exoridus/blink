# Design: ExoJS-Upgrade 0.8.3 → 0.15.2

**Datum:** 2026-07-05
**Status:** Freigegeben
**Kontext:** Blink nutzt `@codexo/exojs@0.8.3`. Auf npm ist `latest` = 0.15.2
(2026-07-02, Bugfixes 0.15.1/0.15.2 vom 2026-07-04). Die 2.x-Linie ist als
`legacy-2x` getaggt und nicht das Ziel. Zwischen 0.8.3 und 0.15.2 liegen
sieben Minor-Releases mit dokumentierten Breaking Changes (Changelog:
https://github.com/Exoridus/ExoJS/blob/main/CHANGELOG.md, Migrationsguide
0.8.x→0.9.0: https://exoridus.github.io/ExoJS/en/guide/migration/v0-8-x-to-v0-9-0/).

## Entscheidungen

1. **Zielversion:** `@codexo/exojs@^0.15.2` plus neu `@codexo/exojs-audio-fx@^0.15.2`
   (lockstep-versioniert; `AudioAnalyser`/`BeatDetector` wurden in 0.14 dorthin
   extrahiert).
2. **Sequenzierung:** Der aktuelle Working-Tree-WIP (SSF-Paket, Audio-Pipeline-
   Ausbau, Docs, Testeffekte) wird **zuerst committet**. Das Upgrade läuft
   danach als eigener Branch / eigene Commit-Serie auf sauberer Basis.
3. **Umfang:** Migration der Breaking Changes **plus gezielter Rückbau** von
   Eigenbau, den ExoJS 0.15 nachweislich übernimmt. Keine darüber hinausgehende
   Modernisierung (View-Compositions, KeyValueStore, loadContainer etc. sind
   explizit out of scope).
4. **Ansatz:** Big-Bang-Upgrade in einem Schritt, aber mit vorher aufgenommener
   Verifikations-Baseline und fester Subsystem-Reihenfolge (Typen/Imports →
   Rendering → Audio → Debug/UI).
5. **Audio-Verhalten:** Ändern sich Analyser-/Detector-Werte, wird **neu
   kalibriert** (keine Werte-Parität erzwungen, kein Kompensations-Layer).
   Grundlage ist die vorhandene Probe-Infrastruktur; `docs/architecture/spectrum-pipeline-truth.md`
   wird bei geänderten Konstanten aktualisiert.

## Migrations-Map

Aktuelle ExoJS-Berührungspunkte in Blink und die zugehörigen Breaking Changes:

| Datei | Genutzte Symbole | Relevante Änderungen |
| --- | --- | --- |
| `src/services/AudioService.ts` (+ Tests) | `AudioAnalyser`, `BeatDetector`, `getAudioContext` | 0.14: Audio-Singleton entfernt, Audio app-owned; Analyser/Detector nach `@codexo/exojs-audio-fx`; Playback erst nach Autoplay-Unlock. 0.15: BeatDetector-Härtung (Tempo 50–300 BPM, Recall 92–99 %, Offsets 1–4 ms). 0.15.2: `onUnlock`-Fix für spät konstruierte Manager. |
| `src/services/acquireSource.ts` (+ Tests) | `getAudioContext` | wie oben — Bezug des AudioContext läuft neu über die app-eigene Audio-Instanz. |
| `src/services/RenderService.ts` | `Application`, `Scene`, `Color`, `Container`, `Mesh`, `MeshShader`, `Signal`, `upgradeFragmentShaderToGl300`; Typen `MeshShaderUniformValue`, `RenderBackend`, `RenderNode`, `Time` | 0.9: `ApplicationOptions` gruppiert (`canvas`/`loader`/`rendering`/`input`), `app.sceneManager`→`app.scene`. 0.10: `Scene.draw(context)` statt `(backend)`, `app.rendering` kanonisch. 0.14: kuratierte Barrels, Renderer-Interna hinter `@codexo/exojs/renderer-sdk` (betrifft evtl. `RenderBackend`), `canvas`-Mount/`sizingMode`, Scene-Stack entfernt (nur noch `setScene`). 0.15: `Camera`→`View`, `PassContext` für Pass-Callbacks. |
| `src/classes/Statistics.ts` | `Text`, `DebugOverlay` (`/debug`) | 0.14: `Text`-Konstruktor nur noch `new Text(text, options?)`. 0.9: `setText()`/`setStyle()` entfernt. 0.12: echtes `/debug`-Subpath mit Typen. |
| `src/ui/StartScreen.ts` | `Signal` | voraussichtlich stabil; verifizieren. |
| `src/runtime/audio/BlinkAudioTextureRuntime.ts` | `DataTexture`, `MeshShaderUniformValue` | Oberfläche gegen 0.15-Barrel verifizieren. |
| `src/types/codexo-exojs-debug.d.ts` | eigenes Modul-Shim | **Rückbau:** löschen, 0.12+ liefert echte Typen für `/debug`. |

Zusätzlich: Die `vi.mock('@codexo/exojs')`-Blöcke in `AudioService.test.ts` und
`acquireSource.test.ts` ziehen auf die neuen Import-Pfade/Oberflächen um.

## Gezielter Rückbau

- `src/types/codexo-exojs-debug.d.ts` entfernen.
- In `AudioService` vorhandene BeatDetector-Workarounds/Kompensationen
  identifizieren und entfernen — der 0.15-Detector übernimmt Tempo-Tracking,
  Octave-Error-Korrektur und Phase selbst.
- Weitere Rückbau-Kandidaten, die während der API-Inventur auffallen, werden im
  Plan einzeln gelistet (kein stiller Scope-Creep).
- **Nicht angetastet:** die Blink-eigene Spektrum-Pipeline (Surfaces, Packers,
  Texture-Runtime, 12→4-Band-Builder, Spectrum-Generatoren) — nur Konstanten
  dürfen sich durch Re-Kalibrierung ändern.

## Verifikation & Kalibrierung

**Baseline (vor dem Upgrade, auf 0.8.3):**

1. WIP committen; `npm test` + `npm run ts-check` grün dokumentieren.
2. Mit `BlinkAudioProbeSessionRecorder` mindestens eine Referenz-Probe-Session
   aufnehmen (deterministisches Eingangsmaterial).
3. `audio_indicators`/`audio_debug` visuell festhalten (Screenshots).

**Nach der Migration:**

1. `ts-check`, `lint`, `vitest` grün.
2. Probe-Playback (`BlinkProbePlayback`) gegen die Baseline vergleichen;
   Abweichungen in Analyser-/Detector-Werten quantifizieren.
3. Bei Abweichungen: Konstanten (u. a. `SCALE_FACTOR`) neu vermessen,
   `spectrum-pipeline-truth.md` aktualisieren.
4. App real per `vite dev` mit den Testeffekten fahren (BlinkFX nativ +
   SSF-Pfad + Legacy-Adapter).

## Risiken

- **Unverifizierte API-Oberflächen:** Ob z. B. `upgradeFragmentShaderToGl300`
  noch im Root-Barrel liegt oder `RenderBackend` hinter `renderer-sdk` wandert,
  ist unbestätigt. Erster Implementierungsschritt ist eine **API-Inventur**
  gegen die installierten 0.15.2-Typen + Migrationsguide.
- **Bewusste Verhaltensänderung im Audio-Stack:** BeatDetector/Analyser liefern
  andere (bessere) Werte → Kalibrier-Schritt ist fest eingeplant, nicht optional.
- **Blocker-Bug in 0.15.2:** Fallback ist 0.14.x (dokumentieren, welcher
  Breaking Change dann entfällt: `View`/`PassContext`).
