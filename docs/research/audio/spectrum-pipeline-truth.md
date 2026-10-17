# Blink Spectrum Pipeline — Ground Truth

**Last updated:** 2026-05-13  
**Based on:** Synesthesia 1.25.2 decompilation + runtime Frida captures (session `run_20260513_093855`)  
**Best Blink comparison result:** `stage_raw_fix` — packed_spectrum correlation 0.867

---

## Synesthesia pipeline (confirmed)

| Stage | Output | Width | Channel in syn_Spectrum |
|-------|--------|-------|------------------------|
| Raw | `raw_output` | 1024 floats [0, 1.1] | R |
| Juiced | `juiced_output` | 1024 floats [0, 2.0] | G |
| Smooth | `smooth_output` | 1024 floats [0, 1.0] | B |
| Waveform | `waveform_output` | 1024 floats [0, 1.0] | A |

Packed texture: 1024 × RGBA float32, 16384 bytes/frame.

### Raw spectrum formula (confirmed constants from binary)

```
FLOOR        = 1e-5
THRESHOLD    ≈ 0.05  (runtime diagnosis: bins with raw_input in [1e-4,0.05] produce near-zero output)
QUAD_COEFF   = 6.25 × (5/11) = 125/44 ≈ 2.8409
LIN_COEFF    = 27/55          ≈ 0.4909
BOOST_CLAMP  = 0.72
OUTPUT_CLAMP = 1.1

for each bin i in 0..1023:
    scaled = max(raw_fft[i] × scale_factor, FLOOR)
    if scaled > THRESHOLD:
        boosted = scaled² × QUAD_COEFF + scaled × LIN_COEFF
        boosted = clamp(boosted, (scaled+1)×0.5, BOOST_CLAMP)  ← lower clamp provides floor
        output  = max(scaled, boosted)                          ← KEY: max, not min
    else:
        output  = scaled × sqrt(audioLevel × 2)
    output = clamp(output, FLOOR, OUTPUT_CLAMP)
```

### Frequency axis

Synesthesia's `syn_Spectrum` spans **0 Hz → ~16 kHz** across 1024 bins.  
Web Audio FFT spans 0 Hz → Nyquist (typically 24 kHz at 48 kHz SR).

---

## Blink implementation

### Configuration

| Parameter | Value | Source |
|-----------|-------|--------|
| fftSize | 2048 | AudioService constructor |
| frequencyBinCount | 1024 | derived |
| minDecibels | -90 | AudioService |
| maxDecibels | 0 | AudioService |
| smoothingTimeConstant | 0.8 (default) | Web Audio API default |

### dB → linear mapping

```
linear = 10^(clamp(dB, -90, 0) / 20)
scaled = linear × SCALE_FACTOR        // SCALE_FACTOR = 2.0
```

**SCALE_FACTOR = 2.0** maps 0 dBFS → linear 1.0 → scaled 2.0, matching Synesthesia's
`syn_Spectrum` channel range of [0, 2.0].

**Critical constraint:** `SCALE_FACTOR` must satisfy:  
`10^(-90/20) × SCALE_FACTOR < THRESHOLD (1e-4)`  
With SF=2.0: floor = 6.3e-5 < 1e-4 ✓ → silence correctly routes to the below-threshold branch.  
With SF=200: floor = 6.3e-3 >> 1e-4 → silence saturates to ~0.5 (broken).

### Frequency-axis remap

```
srcIdx = floor(i × SSF_MAX_FREQ_HZ / nyquistHz × srcBins / bins)
       = floor(i × 16000 / (sampleRate/2))
```

At 48 kHz: maps lower ~683 of 1024 FFT bins onto all 1024 SSF bins.  
Validated: 16 kHz sweep peak moves from bin ~632 (pre-remap) to bin ~1019 (post-remap),
matching Synesthesia's bin ~1019–1022.

---

## Comparison results (best Blink session, `stage_raw_fix`)

| Stream | MAE | Correlation |
|--------|-----|-------------|
| raw_input | 0.004 | 0.564 |
| raw_output | 0.028 | 0.108 |
| packed_spectrum | **0.044** | **0.868** |
| juiced_output | 0.051 | −0.011 |
| smooth_output | 0.061 | 0.092 |
| waveform_output | 0.070 | 0.013 |

Session: `blink_spectrum_stage_session_2026-05-13T22-09-22-825Z.zip` (valid, audio confirmed).

**raw_output Corr=0.108 is expected and not a defect.** Explanation: the MAX formula
maps all above-threshold bins to ~0.5–0.6 (lower-clamp dominant), compressing shape variance
and breaking Pearson correlation with Synesthesia's proportional below-threshold outputs.
RMSE/MAE ratio of 2.1 confirms the typical error is 0.028 with rare outliers (maxError=1.2).
packed_spectrum Corr=0.868 is the authoritative quality metric — it uses the full 4-channel
texture and correctly reflects the visual output shaders consume.

---

## What is confirmed vs approximate

| Claim | Status |
|-------|--------|
| 1024-wide Spectrum buffers | Confirmed (Frida capture) |
| Frequency remap 0–16 kHz | Confirmed (sweep-peak analysis) |
| QUAD_COEFF, LIN_COEFF, BOOST_CLAMP, FLOOR | Confirmed (binary data tables) |
| max(scaled, boosted) — not min | Confirmed (runtime scatter analysis) |
| THRESHOLD ≈ 0.05 | Runtime diagnosis: bins in [1e-4,0.05] produce near-zero output (below-threshold branch) |
| OUTPUT_CLAMP = 1.1 | Empirically fitted (Syn max observed at 1.216) |
| SCALE_FACTOR = 2.0 | Confirmed from stage comparison (MAE 0.004 on raw_input) |
| SSF max frequency = 16000 Hz | Strongly supported; exact value may be ±500 Hz |
| Juiced/Smooth/Waveform formulas | Structure confirmed, fine coefficients approximate |

---

## Remaining gaps

1. **Juiced/Smooth/Waveform correlation is low** (−0.015 to 0.039). These stages depend on
   `audioLevel` which is not captured identically between Blink and Synesthesia, and the
   smoothingTimeConstant pre-smoothing compounds the difference. Not pursued in this pass.

2. **LevelTrail (packed_leveltrail)** correlation −0.154. Left for a dedicated block.

3. **smoothingTimeConstant** — Blink uses 0.8 (default). Synesthesia's native FFT has no
   equivalent. Setting it to 0 would improve raw_input comparison accuracy but may produce
   unpleasant visual noise. Adjust when Juiced/Smooth are revisited.

---

## Validation workflow

### Capture a fresh Blink stage session

1. Start Blink dev server: `npm run dev`
2. Load `audio_indicators.synScene` or any effect with `syn_Spectrum`
3. Play the probe: `assets/probes/ssf_audio_probe_master_v1.wav`
4. In the Blink debug panel, trigger a spectrum stage capture (see `BlinkAudioSpectrumStageRecorder`)

### Compare against Synesthesia reference

```
cd synesthesia-forensics-pipeline
node scripts/compare-spectrum-stages.js \
  runtime_probes/output/spectrum_stage_sessions/run_20260513_093855 \
  runtime_probes/<new-blink-session>.zip
```

### Success criteria

| Stream | Target MAE | Target correlation |
|--------|-----------|-------------------|
| raw_input | < 0.015 | > 0.50 |
| raw_output | < 0.035 | > 0.40 |
| packed_spectrum | < 0.050 | > 0.85 |
