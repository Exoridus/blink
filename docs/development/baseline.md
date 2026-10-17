# Local baseline before public preparation

The pre-existing SSF, runtime, UI and package work is secured in the local commit
whose subject is `chore: secure SSF and runtime baseline before public preparation`.
It is a recovery point, not a release approval or a claim that every stored asset
may be redistributed.

## Inventory and checks

- 68 previously tracked files changed, including removal of the old converted
  audio-indicators package and replacement with its source scene.
- 905 untracked files were discovered before the design/plan additions, spanning
  SSF scenes, native reference fixtures, screenshots, research, scripts and tests.
- The existing 116 Vitest files passed: 1,456 tests, including locally available
  corpus tests. `npm run ts-check` passed.
- `git diff --check` passed.
- `npm run lint` failed before modernization: type-aware rules were applied to
  third-party JavaScript under `test/fixtures/ssf/workshop` without parser services.
- Review of manifest/IR and service changes found additive compatibility metadata,
  SSF runtime integration and output configuration changes; retain them together
  with their regression tests. This is inventory review, not a full numerical
  parity or security certification.

## Publication boundaries

The source scenes, workshop examples, captured native reference vectors and
research evidence require individual redistribution/privacy review. Securing
them locally does not authorize pushing this recovery commit to a public remote.
The current LICENSE text does not establish a project license and is preserved.
Private scratch and build output remain outside Git. Detailed local inventories,
baseline logs and redacted scanner reports are retained only in ignored scratch.

Before public release, scan the full history again, resolve asset and project
licenses, review native-reference provenance, and decide how to produce an
approved publication history without losing this recovery point.
