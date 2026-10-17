# Synesthesia audio compatibility, per signal

The current `ssf/1` default uses the timestamped Original PCM reconstruction. Its numeric profile, fresh native fixture coverage and remaining boundaries are documented in [ssf-original.md](ssf-original.md) and [ssf-implementation-report.md](ssf-implementation-report.md).

The historical signal tables below describe `ssf-semantic/1`, the retained generic-analyzer approximation. They remain useful for legacy diagnostics and audio research; they do not describe the Original scalar bank or its exact array packing. Native BlinkFX, ISF and Shadertoy audio contracts retain their existing behavior.

## Levels

| Level         | Meaning                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **API**       | The name, type and range exist. A scene that reads the signal compiles and runs.                                                                                                     |
| **Semantic**  | The value responds for the same conceptual reason: a hit follows a transient, a level follows loudness in a band. The shape over time is similar; the numbers are not claimed to be. |
| **Numerical** | Measured against recorded Synesthesia output and within a stated tolerance.                                                                                                          |

Every signal below has API compatibility. The columns that differ are the other two.

## Evidence

- **Synesthesia reference captures** (Synesthesia 1.25.2, Frida captures of its audio stages,
  2026-05-13) are not in this repository; they live in the separate forensics pipeline. The
  numbers they produced against Blink's stage recorder are recorded in
  [research/audio/spectrum-pipeline-truth.md](research/audio/spectrum-pipeline-truth.md) and are
  the historical comparison for the generic semantic adapter. Current Original evidence is linked above.
- **Blink against Blink** is checked with `npm run audio-parity` (see
  [research/audio/README.md](research/audio/README.md)). It detects that a change moved the output;
  it says nothing about Synesthesia. The July 2026 baseline measurements of this kind were
  invalid and have been withdrawn (see below).

## Spectrum (`blink.audio.spectrum`, `syn_Spectrum`)

One 1024-wide RGBA texture, one channel per stage.

| Channel               | Semantic                                                                                                                                                                                                                                                                | Numerical (stage capture 2026-05-13)                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **raw** (R)           | Formula and constants confirmed from Synesthesia's binary tables: `FLOOR`, the quadratic and linear coefficients, the boost clamp, `max(scaled, boosted)`. `THRESHOLD` is a runtime diagnosis and `OUTPUT_CLAMP` is fitted. 0 to 16 kHz is mapped across the 1024 bins. | `raw_input` MAE 0.004, correlation 0.564. `raw_output` MAE 0.028, correlation 0.108; the low correlation is expected, because the formula maps every above-threshold bin to about 0.5 and flattens the shape. |
| **juiced** (G)        | Structure confirmed (stage A, then a 15-tap FIR and attack/release); fine coefficients approximate.                                                                                                                                                                     | MAE 0.051, correlation -0.011. **Not met.**                                                                                                                                                                   |
| **smooth** (B)        | A 33-tap average, per-bin emphasis and a level-controlled blend; coefficients approximate, input is the log-frequency spectrum.                                                                                                                                         | MAE 0.061, correlation 0.092. **Not met.**                                                                                                                                                                    |
| **waveform** (A)      | Time-domain samples remapped to 0..1.                                                                                                                                                                                                                                   | MAE 0.070, correlation 0.013. **Not met**; the waveform is not phase-locked, so a correlation is not expected to be high.                                                                                     |
| **packed** (all four) |                                                                                                                                                                                                                                                                         | MAE 0.044, correlation 0.868. **Met** (targets: MAE under 0.050, correlation over 0.85). This is the number that reflects what a shader sees.                                                                 |

Frame-time dependence: the Juiced stage scales its output with the square root of the frame time
(`boostScale = sqrt(2 * dt)`), as Synesthesia's does. Juiced values therefore differ between a
host at 30 fps and one at 144 fps by roughly a factor of two. They are comparable only at equal
frame rates.

## Level trail (`blink.audio.levelTrail`, `syn_LevelTrail`)

A 400-pixel history, newest at pixel 0, with channels all, bass, mid and high. A sample is pushed
at most once per frame, at 31.5 Hz of clock time, so the history spans the same time at any frame
rate above 31.5 fps.

| Channel                  | Semantic                                                                                                                                                                                                                                                                                                                           | Numerical                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **all, bass, mid, high** | Band coverage fitted to probe segments (bass 20 to 200 Hz, mid 320 to 1280 Hz, high from 5120 Hz); smoothed with an exponential average of 2 % per Synesthesia frame, scaled by the frame time. The `all` band has no verified source: several candidate formulas are recorded in `computeTrailCandidates` for offline comparison. | Correlation -0.154 at the 2026-05-13 measurement, before the band fits. **Not measured since.** |

## Scalars (`syn_*`)

All names are fed by `SsfAudioAdapter` from Blink's own audio frame. Numerical status is
**unmeasured** for every row unless stated: there is no recorded Synesthesia trace of these
scalars to compare against.

| Signals                                                                                          | How Blink derives them                                                                                                                              | Semantic                                         | Frame-rate dependence                                         |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| `syn_Level`, `syn_BassLevel`, `syn_MidLevel`, `syn_MidHighLevel`, `syn_HighLevel`                | The level-trail band values after the exponential average.                                                                                          | Yes; band edges fitted as above.                 | Scaled by the frame time.                                     |
| `syn_RawLevel`                                                                                   | Mean of the 12 raw band energies, normalized by a decaying peak (about 2 s half-life at 60 fps).                                                    | Approximate.                                     | The peak decays per frame, not per second.                    |
| `syn_InputLevel`                                                                                 | The analyser's RMS, scaled and passed through.                                                                                                      | Approximate.                                     | None.                                                         |
| `syn_Hits`, `syn_BassHits`, `syn_MidHits`, `syn_MidHighHits`, `syn_HighHits`                     | Onset strength with quadratic emphasis, scaled per band, then a decay of 10 % per frame.                                                            | Approximate.                                     | The decay is per frame.                                       |
| `syn_Presence`, `syn_BassPresence`, `syn_MidPresence`, `syn_MidHighPresence`, `syn_HighPresence` | How far a fast follower exceeds a slow baseline of the band energy: spectral novelty, not energy.                                                   | Approximate.                                     | Both followers advance per frame.                             |
| `syn_Time`, `syn_BassTime`, `syn_MidTime`, `syn_MidHighTime`, `syn_HighTime`                     | Clocks that run at 0.25 plus 1.5 times the band level, in clock seconds per second.                                                                 | The rates are Blink's choice, not Synesthesia's. | Scaled by the frame time.                                     |
| `syn_CurvedTime`                                                                                 | An accumulator whose rate grows with raw energy, wrapped to 0..1.                                                                                   | Approximate.                                     | Scaled by the frame time.                                     |
| `syn_OnBeat`, `syn_ToggleOnBeat`, `syn_RandomOnBeat`, `syn_BeatTime`                             | A pulse on each detected beat with a refractory window of 0.12 s, a toggle and a random value drawn on the pulse's rising edge, and a beat counter. | Approximate.                                     | The pulse decays per frame; the refractory window is in time. |
| `syn_BPM`                                                                                        | The beat detector's tempo, rounded.                                                                                                                 | Follows the detector.                            | None.                                                         |
| `syn_BPMConfidence`                                                                              | **Not the detector's confidence.** A heuristic from onset strength and the distance of the tempo from 120 BPM.                                      | Placeholder.                                     | None.                                                         |
| `syn_BPMSin`, `syn_BPMSin2`, `syn_BPMSin4`, `syn_BPMTri`, `syn_BPMTri2`, `syn_BPMTri4`           | Sine and triangle waves of 1, 2 and 4 cycles per beat over the beat clock.                                                                          | By convention; unverified.                       | None.                                                         |
| `syn_BPMSin8`, `syn_BPMTri8`                                                                     | 8 cycles per beat, scaled by the heuristic confidence above.                                                                                        | By convention; unverified.                       | None.                                                         |
| `syn_BPMTwitcher`                                                                                | A phase running at three times the beat rate, scaled by the heuristic confidence.                                                                   | Placeholder.                                     | None.                                                         |
| `syn_FadeInOut`                                                                                  | Rises to 1 over about 2 s while there is sound and falls over about 5 s without.                                                                    | Time constants chosen, not measured.             | None.                                                         |
| `syn_Intensity`                                                                                  | The level followed with a 10 s time constant.                                                                                                       | Time constant chosen, not measured.              | None.                                                         |
| `syn_BassExpoCurve`                                                                              | The bass level squared.                                                                                                                             | A guess at the curve.                            | None.                                                         |
| `syn_MediaType`                                                                                  | 1 when a media input is bound, otherwise 0.                                                                                                         | Yes.                                             | None.                                                         |

Presence, Hits, the RawLevel peak and the OnBeat decay advance once per rendered frame, not once
per unit of time, so they match their intended response only near 60 fps. Scaling them by the
frame time the way the level average is would remove the dependence, but without Synesthesia
traces to measure against there is no way to tell whether it would bring the values closer.

## Withdrawn: the July 2026 baseline comparison

`research/audio/baselines/` holds two probe sessions recorded on 2026-07-06 and a note that
compared them and concluded no recalibration was needed after the ExoJS 0.8.3 to 0.15.2 upgrade.
The recorder stored a view of the live texture buffer for every frame instead of a copy, so every
frame of each session is the last one: the silent tail after the probe. The comparison measured
two final frames, not a time series, and its conclusion is not supported. The surface recorder is
fixed (a frame is copied when it is appended), `audio-parity` refuses a session whose frames are
identical, and the stage recorder, which copies, was never affected: the numbers in the spectrum
table above stand.

## Next steps toward numerical parity

Each needs a recorded Synesthesia trace of the signal, which this repository does not have:

1. Record Synesthesia's scalar uniforms against the probe master, as the stage capture did for the
   spectrum, and compare them with `syn_*` per signal.
2. Make the per-frame constants (Presence, Hits, RawLevel peak, OnBeat decay) frame-time based and
   measure whether that moves them toward the trace.
3. Replace the heuristic `syn_BPMConfidence` and the placeholder `syn_BPMTwitcher` with signals
   from the beat detector once ExoJS exposes beat-phase confidence.
4. Re-measure the level trail after the band fits, and the Juiced, Smooth and Waveform channels
   against a trace recorded at the same frame rate as Blink's.
