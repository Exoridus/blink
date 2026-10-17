# Vergleichsmessung: ExoJS 0.15.2 vs. Baseline 0.8.3

> **Zurückgezogen (2026-10-06).** Diese Session ist als Zeitreihe ungültig: der Recorder hat für jeden
> Frame eine *Ansicht* auf den überschriebenen Live-Puffer gespeichert statt einer Kopie, daher ist
> jeder aufgezeichnete Frame der letzte (die stille Phase nach dem Probe-Signal). Alle Kennzahlen
> und Entscheidungen unten beruhen auf zwei solchen Endframes und sind nicht belastbar. Der
> Recorder ist behoben; `npm run audio-parity` weist Sessions mit identischen Frames ab. Siehe
> `docs/audio-compatibility.md`, Abschnitt "Withdrawn".

- **Session-ZIP:** `blink_surface_session_2026-07-06T01-40-40-336Z.zip`
- **Aufgenommen:** 2026-07-06 01:38–01:40 UTC, Branch `exojs-0.15-upgrade` (nach Task 9),
  gleicher Browser wie Baseline, `?probe=exojs-0.15.2-compare&dur=99`
- **Quelle:** identisches Probe-Master (SHA-256 `71f8b3ef…`, 99 s), 14 762 Frames @ ~143.3 fps
  (Baseline: 14 804 @ ~143.7 — vergleichbar)

## Methode

Frame-Streams beider Sessions zeitlich in 250-ms-Buckets gemittelt (Pre-/Post-Roll-Ränder
±2 s verworfen), pro Kanal: mittlere absolute Abweichung (MAD), p95, Korrelation, Bias.
Skript: Scratchpad `compare_sessions.py` (Methode hier dokumentiert, Kennzahlen unten).

## Ergebnis (396 Buckets)

| Surface / Kanal | MAD (absolut, 0–1-Skala) | Korrelation | Bias |
| --- | --- | --- | --- |
| spectrum/juiced | 0.0016 | 0.9954 | −1.5 % rel. |
| leveltrail/all | 0.0045 | 0.9923 | +2.8 % rel. |
| leveltrail/bass | 0.0082 | 0.9955 | +0.8 % rel. |
| leveltrail/mid | 0.0040 | 0.9033 | +10.9 % rel. (absolut nur +0.003) |
| leveltrail/high | 0.0034 | 0.8900 | +11.7 % rel. (absolut nur +0.002) |
| spectrum/waveform | 0.0000 | — (bucket-gemittelt ≡ 0.5) | 0 |

`spectrum/raw` und `spectrum/smooth` sind in BEIDEN Sessions nahezu leer
(max ≈ 0.0001) — konsistentes Verhalten, kein Upgrade-Effekt; vermutlich werden diese
Kanäle nur in bestimmten Modi befüllt (separat zu untersuchen, unabhängig vom Upgrade).

## Entscheidung

**Keine Re-Kalibrierung.** Plan-Kriterium war MAD < 2 % des Wertebereichs (0–1):
alle Kanäle max. 0.8 %. Der kleine systematische +Bias in mid/high-LevelTrail
(+0.002–0.003 absolut) ist konsistent mit dem in 0.15 bewusst gehärteten
BeatDetector (Recall 92–99 % statt 11–42 % → geringfügig mehr Beat-Boost) und liegt
weit unter jeder wahrnehmbaren Schwelle. `SCALE_FACTOR` und alle Konstanten aus
`spectrum-pipeline-truth.md` bleiben unverändert. Der vorbereitete
`status !== 'locked'`-Filter für provisorische Beats wird NICHT aktiviert
(kein Befund von nervösem Beat-Verhalten; bei Bedarf später aktivierbar,
siehe Task-7-Report).
