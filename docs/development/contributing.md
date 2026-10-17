# Contributor workflow

Use Node 24 and npm 11. The committed lockfile is authoritative: start with
`npm ci`. Installation enables Husky unless `HUSKY=0` is set for CI. Keep source
changes narrow and preserve existing working-tree line endings; Git attributes
normalize new committed text to LF, with Windows format exceptions.

| Command                         | Check                                                       |
| ------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                   | Development app with the complete local catalog             |
| `npm run ts-check`              | TypeScript contracts                                        |
| `npm run lint`                  | JS/TS correctness and SCSS lint                             |
| `npm run format:check`          | Repository-owned tooling and public guides                  |
| `npm test`                      | Portable unit/conformance tests and tooling behavior tests  |
| `npm run test:private`          | Opt-in private SSF reference and corpus tests               |
| `npm run build:local`           | Root-path app with complete local assets                    |
| `npm run build:pages`           | Public subpath app and generated docs with curated assets   |
| `npm run test:browser`          | Built-artifact browser/WebGL2 smoke                         |
| `npm run test:showcase:browser` | Built-artifact browser smoke for all shipping effects       |
| `npm run test:showcase:gpu`     | Deterministic shader checks with silence and audio bands    |
| `npm run test:demo:browser`     | Both bundled CC0 recordings through real audio playback     |
| `npm run export:spec`           | Independent BlinkFX spec candidate, into an empty directory |
| `npm run check`                 | Final integration gate used before pushing                  |

Pre-commit lints/formats staged files only and checks added provenance. Commit-msg
enforces Conventional Commits and the attribution policy. No full test suite runs
on every commit. Pre-push validates new commits/provenance before the integration
gate. Hooks are convenience checks; required CI and server-side rules enforce the
policy on the future remote.

Formatting is adopted incrementally. Existing source, archived specs, third-party
fixtures and research are not mass-formatted. Prettier handles staged first-party
files; the format gate covers the newly maintained tooling and guides. ESLint's
portable correctness baseline replaces the previous broad stylistic policy;
type-aware floating-promise checks remain active for production TypeScript.
Legacy unused-disable and redundant-escape warnings are reported, not hidden by
source rewrites. SCSS naming/notation styles are preserved; syntax/property checks
remain active. Accessibility fallback use of deprecated `clip` is currently a warning.

Portable CI must work without external source corpora or another engine checkout.
Browser/GPU execution is a separate lane. Native reference fixtures remain tested
and stored for local parity work but still require a publication-provenance review.
Hardware WebGPU/audio fidelity tests cannot be substituted by mocked unit tests.

The TypeScript 7 native compiler is installed through `@typescript/native` and
provides `tsc`. The `typescript` npm alias supplies Microsoft's TypeScript 6 API
compatibility package for ESLint; no forced or invalid peer resolution is used.
Node 24 runs tooling `.ts` files through type stripping after the strict compiler
gate. Browser modules remain bundled by Vite. Effect distribution scripts remain
JavaScript as required by the BlinkFX ABI.

`BLINK_CORPUS_ROOT` can override private storage. The private runner otherwise
uses `corpora` inside the ignored `.workspace` directory. Private scenes are
organized by `synesthesia/builtin`, `community` and `workshop`, with separate
original, local and converted inputs. A missing private fixture fails the explicit
lane. Portable fixtures are authored inline or tracked; none require an external
corpus. Formatter exclusions for fixtures are separate from Git ignore rules.

Browser artifacts are written under `artifacts/browser` in the private workspace;
CI uploads only that artifact directory. `test-results` remains ignored for tools
that use it conventionally. Generated directories need not exist in a checkout.

The development server binds to loopback and denies access to private workspace
and Git files. An explicit Vite `--host` override enables LAN development; it does
not turn that development server into the future authenticated Blink host.
