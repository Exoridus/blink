# Audio-Baseline: ExoJS 0.8.3 (vor Upgrade auf 0.15.2)

> **Zurückgezogen (2026-10-06).** Diese Session ist als Zeitreihe ungültig: der Recorder hat für jeden
> Frame eine *Ansicht* auf den überschriebenen Live-Puffer gespeichert statt einer Kopie, daher ist
> jeder aufgezeichnete Frame der letzte (die stille Phase nach dem Probe-Signal). Alle Kennzahlen
> und Entscheidungen unten beruhen auf zwei solchen Endframes und sind nicht belastbar. Der
> Recorder ist behoben; `npm run audio-parity` weist Sessions mit identischen Frames ab. Siehe
> `docs/audio-compatibility.md`, Abschnitt "Withdrawn".

- **Session-ZIP:** `blink_surface_session_2026-07-06T00-52-37-551Z.zip` (2,6 MB komprimiert)
- **Aufgenommen:** 2026-07-06 00:50–00:52 UTC, Commit-Stand `237b22d` (master, ExoJS 0.8.3)
- **Audio-Quelle:** `http://localhost:8080/probes/ssf_audio_probe_master_v1.wav`
  (deterministisches Probe-Master, 99 s, 48 kHz dual-mono, SHA-256
  `71f8b3efbd2e4919ba7e0919315e3999d6bbe477174a6dcb24e274680eac24e6` — von der
  Session als `probe.knownSha256` bestätigt)
- **Effekt:** `com.codexo.audio_debug` (Audio Analysis Dashboard)
- **Capture:** `?probe=exojs-0.8.3-baseline&dur=99` → 1 s Pre-Roll, 99 s Erwartung,
  3 s Post-Roll; 14 804 Frames erfasst, ~143.7 fps
- **Inhalt:** `spectrum_frames.bin` (1024 Bins × Kanäle raw/juiced/smooth/waveform,
  16 384 B/Frame), `leveltrail_frames.bin` (400 px × all/bass/mid/high),
  `frame_index.jsonl`, `manifest.json`

## Wiederholvorschrift für die Vergleichsmessung (Task 10, auf 0.15.2)

Identisch wiederholen mit `?probe=exojs-0.15.2-compare&dur=99` und derselben
Quell-URL. Vergleich frame-basiert über die Binärstreams (Layout siehe
`manifest.json` → `buffers`).
