# Converters and package checks

The existing development CLI is available as `npm run blinkfx -- <command>`.
It reuses Blink's package validation and source-format converters. An installable
`blink` command is a later deliverable; do not assume it is available yet.

| Existing command                                                             | Purpose                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| `inspect <package> [--json]`                                                 | Metadata, controls, passes, requirements and findings    |
| `validate <package>... [--json]`                                             | Static manifest, references, files, includes and budgets |
| `convert <source>... --out <directory> [--format auto\|isf\|ssf\|shadertoy]` | Convert supported sources and produce reports/catalog    |
| `pack <directory> --out <effect.blinkfx>`                                    | ZIP distribution package                                 |
| `unpack <effect.blinkfx> --out <directory>`                                  | Editable project contents                                |
| `report <directory>`                                                         | Summarize conversion findings                            |
| `doctor`                                                                     | Repository tools and local reference availability        |

Exit status is 0 for success, 1 for invalid input/failed conversion, and 2 for usage
errors. Both an editable package directory and a packed archive are accepted where
a command operates on a package. `pack` currently packages existing files; it does
not replace validation or compile TypeScript.

Preserve mode is the foreign-format default. ISF shaders use the `isf/2` profile,
Shadertoy exports use `shadertoy/1`, and SSF scene directories use `ssf/1`.
Converters retain supported controls, media, passes, feedback and script behavior.
Unsupported resources and approximations must appear as findings. Exact SSF audio
and Shadertoy numerical parity require reference comparisons beyond structural checks.

Static validation does not execute scripts or prove GPU compilation, rendering or
audio performance. Browser/GPU tests must explicitly select the backend, inputs,
reference time and capabilities. Private corpus/reference tests stay in their own
lane. Source licenses and asset attribution remain necessary after conversion.

See [the future CLI contract](../architecture/cli.md) for `blink effect test` and
the planned executable distribution.
