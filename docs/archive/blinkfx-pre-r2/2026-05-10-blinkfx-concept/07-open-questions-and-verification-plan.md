# 07 — Open Questions and Verification Plan

## Confirmed by current research

### SSF scripting documentation covers

- `setup()` and `update(dt)`
- global input uniforms
- `setUniform()`
- deprecated `inputs` / `uniforms`
- control update functions
- event registration functions
- OOP use cases
- `textureFinalPass(x, y)`
- console helpers

### ExoJS current main branch now supplies the missing primitives needed for a strong Blink audio layer

- richer `AudioAnalyser`
- visual `BeatDetector` getters
- `DataTexture`

### ISF and SSF both support multipass workflows

- ISF: `PASSES`, `PERSISTENT`, `FLOAT`, size expressions
- SSF: `PASSES`, feedback, transitions, images

## Items that still require empirical verification

### SSF scripting semantics

1. **Frame order**
   - Does `update()` run before or after registered event callbacks?
   - Do control changes made by handlers affect the same rendered frame?
   - Do control changes trigger more handlers in the same frame or next frame?

2. **Name normalisation**
   - Which characters are stripped when resolving controls / events?
   - What happens on collisions?

3. **Event equality / thresholds**
   - Is `onChange()` strict equality, epsilon-based, or value-copy based for vectors?
   - What happens exactly at `0.5`?

4. **Output uniform typing**
   - Can a later `setUniform()` call change the apparent arity / type?
   - Are booleans / integers ever inferred?

5. **`textureFinalPass()` semantics**
   - Which frame is sampled?
   - Is sampling nearest or filtered?
   - Is the call synchronous?
   - What is the observable cost?

6. **Deprecated APIs**
   - Are `inputs` / `uniforms` still used by real-world scenes?

### SSF external use cases

The official documentation names several built-in scene use cases for OOP scripts, including camera movement, BPM counters, timers, physics simulation, and controlled randomness. Public web searches did not reveal a broad corpus of external `.synScene` repositories or script-heavy examples, so real-world community usage should be sampled manually from actual Synesthesia libraries if available.

## Tests to run against Synesthesia

### Script lifecycle harness

Create a tiny SSF scene whose script appends entries into a debug string / printed log for:

- `setup`
- `update`
- `onChange`
- `whileOn`
- control mutation inside handlers

Use frame counters to determine order.

### Name normalisation harness

Create controls with variants involving:

- spaces
- underscores
- hyphens
- mixed case
- repeated separators

Resolve them through each control and event API.

### Uniform typing harness

Call `setUniform()` with:

- scalar
- vec2
- vec3
- vec4
- then change arity under the same name

Observe shader compile / runtime behaviour.

### Pixel readback harness

Render a known pattern, call `textureFinalPass()` at sample points, and test:

- current vs previous frame
- sampling edge behaviour
- readback precision
- performance under repeated calls

### SSF audio matching harness

Compare Blink compatibility values to Synesthesia for:

- silence
- sine tone
- kick loop
- broadband noise
- mixed music

Evaluate only semantic closeness unless exact normalisation details are discovered.

## Questions to decide internally before implementation

1. Is native BlinkFX scripting included in v1 or shipped later?
2. Does BlinkFX v1 expose both GLSL and WGSL officially, or is WGSL an optional early lane?
3. Does package installation persist to browser storage, filesystem via desktop wrapper, or only current session in MVP?
4. Does the output client own audio acquisition, or can `/control` select/configure it remotely?
5. Are transitions between packages part of MVP or phase 2?
6. Do we want to keep `autobind-decorator` and older project patterns, or modernise during refactor?

## Research notes from public sources

- Official SSF docs are detailed enough to implement a documented compatibility subset.
- Official docs explicitly list OOP use cases for built-in scenes, confirming that scripting is used for more than trivial sliders.
- Public web search did not surface a meaningful open corpus of third-party SSF scripts, so compatibility confidence should not be overclaimed without testing against local / bundled Synesthesia scenes.
