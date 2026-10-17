# External probe and control references

These user-supplied gists were reviewed as design/reference evidence, not copied
into product code. No license granting reuse was established during this review.

- [Python Synesthesia bridge](https://gist.github.com/mattorp/1e62915fff14685a88c13d095fddf189):
  HTTP-to-MIDI command forwarding and an NDI/pixel telemetry idea. Useful motivation
  for separating commands and observation, but incomplete code, broad CORS,
  absent authentication, weak input validation and process cleanup make it unsuitable
  as the Blink broker implementation.
- [GLSL variable pixel probe](https://gist.github.com/mattorp/9de35993ad2834c4df064756e1efbc63):
  signal-to-pixel packing could inform private parity probes. Its source is not a
  directly compiling or validated numerical reference, and visible output alpha,
  output format and quantization must be treated explicitly.
- [Benchmark type sketch](https://gist.github.com/mattorp/c00127a662c89fff38be3003bbe99cdd):
  control matrices, timing/durations and trigger frequency are useful inputs to
  later deterministic CLI effect tests. Replace remote song dependencies with
  licensed deterministic PCM fixtures and report warmup, device/backend and statistics.
- [Control indicator script](https://gist.github.com/mattorp/22f2d21821f2175eda1eac4432e27c61):
  maps SSF signals into controls for inspection. This is relevant to private SSF
  behavior probes and the documented raw/normalized control distinction, not a
  substitute for lossless telemetry from the runtime itself.

These probes support observable API investigations. They do not establish exact
audio DSP equations, numerical parity or a production security contract.
