# Standalone BlinkFX specification export

The active contract in `docs/blinkfx/` remains the sole tracked authority until
a separate specification release is approved. The export is preparation for a
standalone repository; it does not create a remote repository or publish a release.

Run `node scripts/export-blinkfx-spec.ts` to export into `dist/blinkfx-spec`.
An optional destination argument must name an empty directory. The exporter
rejects parent traversal, symlink ancestors and destinations containing the
source repository. It never deletes or overwrites an existing export. Use a new
empty directory when refreshing a candidate.

The exported bundle contains:

- `spec/v1/`: the specification, contract index and authoring guides, with
  application architecture links replaced by explanatory text.
- `schemas/v1/`: the existing Draft 2020-12 manifest schema, unchanged.
- `types/`: the existing manifest, native script and audio declarations, unchanged.
- `conformance/`: valid/invalid manifest fixtures and a standalone typed checker.
- `examples/`: the minimal package and its shader.
- A standalone package manifest, dependency lockfile, strict TypeScript config and
  MIT license for the specification bundle.
- A GitHub Actions conformance workflow for main and pull requests; it publishes nothing.

In the export, use Node 24, `npm ci`, then `npm run check`. Dependencies are Ajv,
Node declarations and TypeScript 7; there is no application engine dependency.
The dependency closure comes from the application's lockfile, so identical
source contracts and lockfiles produce identical normalized LF output.

The checker validates schema fixtures, selected semantic manifest rules and the
minimal example's file references. Semantic rules include duplicate names,
control bounds, enum membership, relative paths, declared shader/resource
references, target dependency order, persistent history and sampler names.
It does not prove GPU rendering, audio behavior, script lifecycle execution,
host capabilities, archive security, include resolution or size-expression
evaluation. Manifest fixtures do not include all referenced package files.
Runtime conformance remains a separate release requirement.

The owner's chosen direction is MIT for the specification bundle, with
copyright 2026 Dieter Giesler. The application license remains unchanged.
Original source-format collections, third-party effects, private research and
application code are excluded and keep their existing licensing requirements.

Before external publication, review ownership of every exported artifact,
confirm the immutable release identifier and schema URI, document remaining
runtime conformance gaps, and approve the external repository and release.
The current `1.0.0-rc.2` URN identifies an unreleased candidate and must not be
advertised as an immutable published release.
