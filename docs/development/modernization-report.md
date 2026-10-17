# Modernization and browser release report

The browser-first preparation is implemented locally. Blink keeps its existing UI,
audio analysis and renderer together. No remote, push, merge, PR, public repository
creation or deployment was performed. CLI packaging, a broker, editor, scene worker
pipeline and streaming implementation remain separate future stages.

The subsequent [music expansion](music-corpus-expansion.md) adds five recordings,
bringing the catalog to seven, with 32 targeted catalog/StartScreen tests and
14 real-music browser scenarios across local and Pages builds. The full-suite
counts below describe the preceding modernization checkpoint.

## Release assessment

The existing application is a usable basis for a first browser preview. A process
split or a different renderer language is not required before that preview. Root
and Pages artifacts build and run. The remaining release blockers concern rights,
license terms, publication history, remote settings and broader hardware coverage;
a passing build is not a publication approval.

## Recovery and preservation

- Baseline: 747dc1a07c8bf62b854889721d7c688b849c7d69.
- Recovery branch: baseline/ssf-runtime-2026-10-13; current branch: main.
- The baseline secured 974 changed/new files before cleanup and migration.
- No rendering, converter or audio implementation was rewritten. Existing source
  changes are limited to the requested start-page demo selection and tests.
- All 13 original fixture-dependent scene/corpus assertions remain in the explicit
  private lane; portable cases use authored inline scenes instead.
- Foreign files were moved, not deleted. Their complete move inventory and the
  pre-migration working-copy backup remain in private recovery storage.
- Root LICENSE is unchanged. There is no automatic history rewrite.

## Root and workspace before/after

Root configuration contains 23 files versus 15 in the secured baseline. The added
files are standard contributor/tool configurations; content and generated corpora
are moved out rather than replacing them with another root hierarchy.

| Before                                                        | After                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Three converted-corpus directories at root                    | Private corpora grouped by SSF, ISF and Shadertoy, preserving legacy outputs       |
| Foreign source scenes in public/effects and workshop fixtures | Private builtin/community/workshop corpora; blanket *.synScene ignore rule         |
| Derived control gallery and imported thumbnails               | Private converted packages and preview archive                                     |
| Generated test-results directory at root                      | Recovered artifacts in private storage; future browser evidence stays there        |
| Unused AWS buildspec                                          | Removed from intended source tree after checking consumers; recovery copy retained |
| Root SSF research document                                    | docs/research/ssf/algorithms-and-changelogs.md                                     |
| Mixed .mjs/TypeScript tooling                                 | All scripts use typed .ts; Python reference tools retain their separate purpose    |
| 137 catalog entries including foreign scenes                  | 15 native development packages; five curated shipping effects                      |
| Upload or externally hosted stream needed to try audio        | Seven bundled, source-verified CC0 recordings on the start page                    |

New root files: .editorconfig, .gitattributes, .node-version, .prettierignore,
CONTRIBUTING.md, commitlint.config.js, lint-staged.config.js, stylelint.config.js,
vitest.config.ts and vitest.private.config.ts. The development server binds to
loopback and denies private scratch and Git paths. Ignored dependencies/builds and
private recovery data remain local. An ignore rule does not remove historical data.

## Dependency changes

These are resolved versions, not an unqualified latest migration. TypeScript 7
provides the compiler; Microsoft's TypeScript 6 compatibility alias supplies the
API required by the current ESLint parser. No forced peer resolution is used.
[Official side-by-side guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
ExoJS remains on the compatible 0.19.1 pair.

| Dependency                       | Baseline resolved | Final resolved                | Decision                                      |
| -------------------------------- | ----------------- | ----------------------------- | --------------------------------------------- |
| @codexo/exojs                    | 0.19.1            | 0.19.1                        | Retained compatible version                   |
| @codexo/exojs-audio-fx           | 0.19.1            | 0.19.1                        | Retained compatible version                   |
| @commitlint/cli                  | -                 | 21.2.3                        | New direct dependency                         |
| @commitlint/config-conventional  | -                 | 21.2.3                        | New direct dependency                         |
| @eslint/js                       | 10.0.1            | 10.0.1                        | Retained compatible version                   |
| @types/node                      | 25.6.0            | 24.19.2                       | Updated compatible line                       |
| ajv                              | 6.15.0            | 8.20.0                        | New direct dependency (previously transitive) |
| eslint                           | 10.3.0            | 10.12.0                       | Updated compatible line                       |
| eslint-config-prettier           | 10.1.8            | -                             | Removed unused plugin/configuration           |
| eslint-plugin-security           | 4.0.0             | -                             | Removed unused plugin/configuration           |
| eslint-plugin-simple-import-sort | 13.0.0            | -                             | Removed unused plugin/configuration           |
| eslint-plugin-unicorn            | 64.0.0            | -                             | Removed unused plugin/configuration           |
| eslint-plugin-unused-imports     | 4.4.1             | -                             | Removed unused plugin/configuration           |
| fflate                           | 0.8.2             | 0.8.3                         | Updated compatible line                       |
| globals                          | 17.6.0            | 17.13.0                       | Updated compatible line                       |
| husky                            | -                 | 9.1.7                         | New direct dependency                         |
| jsdom                            | 29.1.1            | 29.1.1                        | Retained compatible version                   |
| lint-staged                      | -                 | 17.6.0                        | New direct dependency                         |
| markdown-it                      | -                 | 15.0.2                        | New direct dependency                         |
| playwright                       | -                 | 1.64.0                        | New direct dependency                         |
| prettier                         | 3.8.3             | 3.9.10                        | Updated compatible line                       |
| sass                             | 1.99.0            | 1.105.1                       | Updated compatible line                       |
| stylelint                        | -                 | 17.16.0                       | New direct dependency                         |
| stylelint-config-standard-scss   | -                 | 17.0.0                        | New direct dependency                         |
| typescript                       | 6.0.3             | @typescript/typescript6 6.0.2 | Official parser API compatibility alias       |
| typescript-eslint                | 8.59.2            | 8.71.2                        | Updated compatible line                       |
| vite                             | 8.0.10            | 8.3.4                         | Updated compatible line                       |
| vite-node                        | 2.1.9             | 6.0.0                         | New direct dependency (previously transitive) |
| vitest                           | 2.1.9             | 5.0.4                         | Updated compatible line                       |
| @typescript/native               | -                 | typescript 7.0.2              | Native compiler, provides tsc                 |
| @types/markdown-it               | -                 | 14.2.0                        | Strict documentation generator types          |
| @webgpu/types                    | -                 | 0.1.74                        | Strict browser/GPU tooling types              |

ESLint checks correctness, Stylelint checks SCSS and Prettier owns formatting.
Formatting is incremental outside the explicitly modernized scripts directory.
Staged hooks do not run the entire test suite. Conventional Commit and attribution
checks apply to new contributions; they do not certify or rewrite old history.

## Verification executed

| Check                                  | Observed outcome                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Baseline                               | 116 files / 1,456 tests and typecheck passed; old lint failed on fixture JS parser services                                    |
| Clean checkout without private corpora | npm ci and complete npm run check passed                                                                                       |
| Final portable Vitest                  | 119 files / 1,499 tests passed                                                                                                 |
| Node tooling after privacy review fix  | 12 tests passed; preview filtering and ancestor junction failures observed red before green                                    |
| Private scene/corpus lane              | Six suites / 13 cases passed after data moves                                                                                  |
| All shipping packages                  | Five validate and preserve archive bytes/resource references                                                                   |
| New shader GPU lane                    | Three effects passed finite RGBA32F, silence, independent bass/mid/high, fixed-clock repeatability and zero-sensitivity checks |
| Pages application smoke                | All five effects rendered with synthetic microphone audio; no browser, shader or missing-resource errors                       |
| Root application smoke                 | Passed separately on /                                                                                                         |
| CC0 demo UI                            | 30 StartScreen tests passed, including eight demo cases; source/catalog checksum test passed                                   |
| Real music playback                    | Both Ogg files played and rendered on /blink/ without autoplay bypass                                                          |
| Spec export                            | Independent npm ci and strict TypeScript/conformance gate passed; 14 manifest fixtures, semantic cases and minimal package     |
| Secret scans                           | All 123 commits: no findings; intended source tree: 11 MB scanned, no findings, 19 MB WAV skipped by size limit                |
| Production dependency audit            | Zero reported vulnerabilities                                                                                                  |
| Remaining warnings                     | 11 ESLint warnings, one Stylelint clip warning, Vite large-chunk and IIFE-name warnings                                        |

The final isolated integration gate after the music addition passed. Hardware WebGPU, Safari/mobile codec coverage, live audio fidelity and
real GitHub Actions execution are not certified by these local checks. A scanner
run that initially inspected zero bytes was rejected and rerun from the correct
directory; only the effective scan is counted above.

## Deliverables

- Active versioned contracts in docs/blinkfx; historical specifications remain archived.
- Independent spec candidate under dist/blinkfx-spec with schema, types, examples,
  conformance checker, lockfile, MIT candidate scope and GitHub Actions workflow.
- Root/local app at dist/local and subpath/public app plus documentation at dist/pages.
- Aurora, Hypercoil and three original audio-reactive examples, with generated previews.
- CC0 demo music with original author notice, exact source/download provenance,
  CC0 text and recording/archive hashes. App licensing does not replace those terms.
- CI core checks on Ubuntu/Windows, separate browser and optional hardware lanes,
  secret scanning, disabled-by-default Pages publishing, main/version-tag ruleset templates.
- Versioned HTTP/WebSocket control and CLI plans, plus researched output transport
  alternatives. No custom streaming infrastructure was implemented.

## Publication blockers

1. Choose concrete application licensing terms. BlinkFX is intended to remain
   public under MIT; Blink product redistribution/competitive reuse is a separate
   source-available licensing question. Neither MIT nor GPL reserves all commercial
   reuse to the original author. Root LICENSE has not changed.
2. Audit rights in existing effects, native numerical captures, derived tables,
   research and the full publication history. Foreign scenes remain in the secured
   baseline/history even though absent from the working public asset tree. There
   are 45 historical commit attribution/session candidates. No rewrite was performed.
3. Review the large WAV and binary/private data outside the bounded secret scan.
   Zero scanner findings is not a rights or privacy clearance.
4. Review ten high npm audit entries in the development SCSS/braces chain. Stable
   braces remains 3.0.3 with no patched stable release found; runtime audit is clean.
   No incompatible override or force fix was applied.
5. Approve and create Exoridus/blink and Exoridus/blinkfx, apply main/tag rules and
   resolve single-maintainer approval counts. Templates are not remote enforcement.
   Enable Pages only after the separate deployment approval and configured base review.
6. Select immutable spec release identifiers and complete remaining runtime/ABI
   conformance work before calling the candidate a fully certified v1 release.

The full working-tree patch and root inventory are provided separately for local
review. No implementation commit has been made after the recovery baseline.
