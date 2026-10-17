# Audio research

Ground truth and evidence for Blink's audio analysis pipeline. This is research
material, not product documentation - it records what was measured and how, so a
later change to the audio path can be checked against it instead of re-derived.

| Path | Contents |
| --- | --- |
| `spectrum-pipeline-truth.md` | Confirmed Synesthesia spectrum pipeline and the constants Blink reproduces it with. |
| `baselines/` | Probe-session captures from 2026-07-06. **Withdrawn**: every frame in them is the same; see `../../audio-compatibility.md`. |
| `probes/` | The deterministic probe master (`.wav`) and its manifest. |

The per-signal compatibility levels are in [../../audio-compatibility.md](../../audio-compatibility.md).

## Probe master

`probes/ssf_audio_probe_master_v1.wav` is a 99 s deterministic signal used for
every audio parity capture. Its manifest records the segment layout and a
SHA-256 of the WAV, so a re-encoded or truncated copy is detectable.

It is deliberately not in `public/`: probe capture is a development workflow and
the file would otherwise be copied into every production build. The dev server
serves it straight from the repository, which is what the `?probe=` one-click
capture URL uses. A production deployment reaches it only when the capture URL
passes an explicit `?src=` pointing somewhere it is hosted.

## Recording and comparing sessions

A session is the archive the `?probe=` capture writes: the spectrum and level-trail textures of
every rendered frame while the probe master plays. With the dev server running:

```
node scripts/browser-smoke.mjs --probe-capture session.zip [--chrome-flags "--use-angle=d3d11"]
npm run audio-parity -- baseline.zip session.zip
```

The first command drives a headless Chrome through the whole 99 s probe (about two minutes) and
writes the archive. The second averages both sessions into 250 ms buckets, drops the first and last
two seconds, and compares every channel bin by bin on mean absolute deviation and correlation
against tolerances measured between two captures of one build (`REGRESSION_TOLERANCES` in
`src/runtime/audio/parity/compareSessions.ts`). A stream both sessions leave below 0.001 is
reported `EMPTY` rather than passed.

Three things make a comparison meaningless, and the tool refuses the first two:

- **Identical frames.** A session in which every frame is the same has no time series. This is
  what the July 2026 sessions turned out to be.
- **Different frame rates.** The Juiced stage scales with the square root of the frame time and
  several scalars advance per frame. Sessions more than a quarter apart in frame rate are refused
  (`--allow-rate-mismatch` overrides).
- **Different machines or builds of the browser.** Record the baseline on the machine that will
  compare against it. A baseline is not committed for that reason: it is 20 MB or more, and only
  valid where it was made.
