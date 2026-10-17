# BlinkFX v1

BlinkFX is the official format name. Its major tag is `blinkfx/1` and its portable
archive extension is `.blinkfx`. An editable directory and a ZIP archive carry
the same package contents and normalize through the same loader.

Blink implements BlinkFX; the format is not defined by Blink or ExoJS internals.
This directory is the initial, extractable contract bundle for a separate
BlinkFX specification repository. No external repository or spec release has
been created yet.

## Contract bundle

- [Package, manifest, rendering, audio and script specification](specification.md)
- [Custom effect authoring and ABI](custom-effects.md)
- [JavaScript and TypeScript scripting](scripting.md)
- [Compatibility and converters](converters.md)
- [Draft 2020-12 manifest schema](schemas/v1/manifest.schema.json)
- [Manifest TypeScript declarations](types/manifest.d.ts)
- [Native scene declarations](types/scene-runtime.d.ts)
- [Minimal visual example](examples/minimal/manifest.json)

The schema is an unreleased `1.0.0-rc.2` candidate with a versioned URN. Do not
advertise it as an immutable published release. A published spec release gets a
permanent identifier and is never overwritten. The draft is checked against
valid/invalid fixtures and selected native manifests; semantic package validation
remains necessary for paths, dependencies, duplicate names and runtime capabilities.

| Version                              | Meaning                                       |
| ------------------------------------ | --------------------------------------------- |
| `blinkfx/1`                          | Package structure and major semantic contract |
| Spec release, initially `1.0.0-rc.2` | Versioned documentation/schema/declarations   |
| Effect `version`                     | Version of an individual package              |
| `blink/1`, `ssf/1`                   | Independently versioned scripting ABIs        |

## Implementation boundaries

The specification describes the target contract. Existing tests cover package
validation, archive reading, multipass/history, assets, host inputs, compatibility
profiles, audio output, GLSL and selected WGSL execution paths. Coverage is not a
claim of complete format or numerical compatibility with every source host.

Native JS lifecycle execution exists. TypeScript as an official authoring language,
shared compiler tooling, persistent scene workers and their deadlines are planned
v1 delivery work. Distributed packages execute JavaScript, not TypeScript or JSON.
Existing JavaScript packages remain valid. WGSL has existing native runtime support;
foreign GLSL conversion and WGSL audio parity need separate coverage.

The future spec repository owns schemas, declarations, examples and conformance
rules. Manifest declarations are currently a checked snapshot of implemented
types; schema-driven generation is later tooling. Runtime declarations are
maintained separately because JSON Schema cannot express function/lifecycle rules.
See [authoring and revision architecture](../architecture/authoring-and-revisions.md).

The promoted schema now checks type-specific control defaults, tuple sizes and enum options. Some normative constraints remain stricter than current manifest validation, including integer defaults and nonempty enum options; runtime conformance completion is separate work.
