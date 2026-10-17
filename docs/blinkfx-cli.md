# BlinkFX command line and package validation

`npm run blinkfx -- <command>` (`scripts/blinkfx.ts`) is the one tool for working with packages
outside the running app. A package is an unpacked directory or a `.blinkfx` archive; every command
accepts either.

| Command                                                                                                   | Purpose                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `inspect <package> [--json]`                                                                              | What a package declares: controls, inputs, assets, passes, script, requirements, compatibility provenance and its static budget.          |
| `validate <package>... [--json]`                                                                          | Validate one or more packages; exit status 1 if any has an error finding.                                                                 |
| `convert <input>... --out <dir> [--format auto\|ssf\|isf\|shadertoy] [--skip-scripts] [--license <text>]` | Convert Synesthesia scenes, ISF shaders and Shadertoy exports. Writes `<slug>.blinkfx/` per input, plus `report.json` and `catalog.json`. |
| `report <dir>`                                                                                            | Summarize the `report.json` of a convert run: statuses, most frequent issue codes, failures.                                              |
| `pack <directory> [--out <file.blinkfx>]`                                                                 | Directory to archive, `manifest.json` first.                                                                                              |
| `unpack <file.blinkfx> --out <directory>`                                                                 | Archive to directory.                                                                                                                     |
| `doctor`                                                                                                  | Check the tools the repository's workflows need: Node, ExoJS readback, a browser for the smoke run, the SSF corpus.                       |

Exit status: 0 success, 1 invalid package or failed conversion, 2 usage error.

## What validation checks

`validatePackage` (`src/packages/blinkfx/validatePackage.ts`) returns findings as data and never
throws for a bad package:

- `manifest-missing`, `manifest-json`, `manifest-invalid`: the manifest is absent, not JSON, or
  breaks the `blinkfx/1` schema.
- `reference-invalid`: a pass, input, preset or script reference does not resolve.
- `file-missing`: a shader, asset, preset, script or thumbnail the manifest names is not in the
  package.
- `include-invalid`: a package-local shader `#include` is malformed, escapes the package, cycles, is too deep, or exceeds the size limit.

A package with an `error` finding is invalid. Archives are read in memory; an entry whose name is
absolute or climbs out of the package rejects the whole archive.

## Static budgets

Validation also measures the package against a reference output of 1920x1080, so a package that
cannot run well is found before it is loaded.

| Finding                   | Severity | Condition                                                                                                             |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `budget-texture-bindings` | error    | A pass binds more than 7 textures, the most one mesh material holds.                                                  |
| `budget-passes`           | warning  | More than 16 passes.                                                                                                  |
| `budget-target-memory`    | warning  | Render targets exceed 512 MiB; persistent targets count twice and `rgba16f` / `rgba32f` count 8 / 16 bytes per pixel. |
| `budget-shader-size`      | warning  | A shader exceeds 256 KiB of source.                                                                                   |
| `budget-package-size`     | warning  | The package exceeds 64 MiB.                                                                                           |

These are static estimates. What a running effect actually costs per frame is measured at run time; see [runtime-health.md](runtime-health.md).

## Round trip

`writeBlinkFxManifest` (`src/packages/blinkfx/writeManifest.ts`) writes an IR back as a `blinkfx/1`
manifest in normalized form: every default the loader fills in is spelled out, the shader and
pass-input shorthands are expanded, and optional fields that hold no information are left out.
Loading its output gives an IR equal to the one written, and writing that IR again gives the same
manifest. The test suite holds every bundled package and every converted fixture package to both
properties, so a field the loader reads but the writer drops, or the reverse, fails there.

An effect whose shader source is held inline rather than at a package path cannot be written back
(`ManifestWriteError`), and neither can a path outside the package root. Size expressions are
written with `formatSizeExpression`, which parses back to an equal tree.

## Compatibility report

A converted package carries `compatibility` metadata: source format and version, profile
(`ssf/1`, `isf/2`, `shadertoy/1`), mode (`preserve` or `native`) and converter. At run time
`RenderService.compatibilityReport()` turns that and the resolved capabilities into a
`CompatibilityReport` (`src/runtime/diagnostics/CompatibilityReport.ts`), which the shell's
compatibility panel renders. Its `level` is:

- `native`: authored for Blink, no source format involved.
- `compatible`: converted, and every capability it asked for is present as asked.
- `degraded`: converted, and at least one capability is disabled or downgraded.

The report also lists each capability's outcome and the standing caveats of the profile, for
example that `ssf/1` audio values claim API and semantic compatibility but not numerical parity
with Synesthesia.
