# Public repository modernization implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan
> inline. The user has authorized Stages 0 and 1; no push or publication.

**Goal:** Secure the existing work and deliver reproducible contributor tooling,
static builds, GitHub CI/Pages configuration and versioned documentation.

**Architecture:** Preserve src/runtime, converters and ShellHost. Tooling targets
first-party code; private corpora remain a separate lane. Build public and local
frontend artifacts independently. Document later CLI/protocol work without
implementing those subsystems.

**Tech stack:** Node 24, npm lockfile, TypeScript 6, Vite 8, compatible current
Vitest, ESLint 10, Prettier 3, Stylelint SCSS, Husky, lint-staged, Markdown generator.

**Spec:** ../specs/2026-10-13-public-repository-modernization-design.md

## Global constraints

- Baseline commit precedes formatting, migration and deletion.
- No broad source formatting or runtime refactoring; preserve existing line endings.
- No complete test suite at every commit.
- No blanket latest upgrades, license replacement, history rewrite or public action.
- Stage 1 creates no installable CLI or control broker.
- Keep relevant tests, audio research and private scratch; label release blockers.

## Review focus

- Fresh checkout without a private corpus: core tests/build must remain usable.
- Repository subpath: app entry, assets and effect catalogs resolve correctly.
- Unreviewed third-party assets: public artifact must not indiscriminately copy them.
- Staged files on Windows: hooks accept spaces and partially staged changes.
- GPU availability: separate smoke failures from portable unit-test outcomes.

### Task 0: inventory, audit and baseline

**Files:** Private reports under ignored scratch; tracked baseline note in
`docs/development/baseline.md`.
**Produces:** Local recovery commit and before-state inventory.

- [x] Record tracked diff, all untracked paths, root entries and dependency versions.
- [x] Run existing typecheck/tests/lint and record exact outcomes.
- [x] Run redacted secret scanning of working tree and full history; summarize
      paths/counts only. Inventory third-party and private material separately.
- [x] Inspect changed runtime/converter boundaries and preserve all tests/data.
- [x] Stage the inventoried existing work and commit locally, including an honest
      baseline note. Check commit/file counts and retained ignored scratch.

### Task 1: compatible tooling and contributor conventions

**Files:** package.json, package-lock.json, eslint.config.js, stylelint.config.js,
vitest.config.ts, .prettierignore, .editorconfig, .gitattributes, .gitignore,
.node-version, .husky/pre-commit, .husky/pre-push, lint-staged.config.js.
**Produces:** Stable npm commands used by subsequent tasks and CI.

- [x] Query registry versions/peer ranges. Retain TypeScript 6 until the current
      typescript-eslint peer range supports the next major. Align Node types to 24.
- [x] Repair lint scope so typed rules never apply to third-party JS fixtures.
      Use maintainable correctness rules without mass stylistic source rewrites.
- [x] Add SCSS lint, formatting checks with explicit first-party scope, LF Git
      conventions, Node version and local-output/private-file ignores.
- [x] Upgrade Vitest and adapt demonstrated mock incompatibilities narrowly.
      Split portable tests and opt-in corpus tests; preserve both.
- [x] Add staged lint/format hooks and a pre-push gate. Test staged hook selection
      in a disposable Git index; never stage unrelated user changes for a hook test.
- [x] Verify targeted checks, peer resolution and source line-ending preservation.

### Task 2: static artifacts and browser lanes

**Files:** vite.config.ts, scripts/build-site.mjs,
scripts/check-static-build.mjs, scripts/ci-browser-smoke.mjs,
scripts/__tests__/staticBuild.test.ts, public/release-effects.json.
**Consumes:** Toolchain and test commands from Task 1.
**Produces:** Separate dist/pages and dist/local artifacts and asset smoke checks.

- [x] Write/run failing behavioral tests for root/subpath URLs and rejection of
      public copying of unreviewed assets. Implement only the build boundaries
      needed to make these tests pass.
- [x] Preserve the full local catalog. Public builds use an explicit curated
      list of existing first-party MIT-marked packages; copy no third-party
      scenes or research. Record that source/history still require licensing audit.
- [x] Build app with production minification and a correctly joined Pages base.
      Keep root/local and subpath/public artifact validation distinct.
- [x] Add a portable Playwright smoke against built artifacts, using synthetic
      browser audio and an existing small native effect. Test the startup UI,
      successful frame execution and reported GPU faults; do not claim fidelity.
- [x] Run both static artifact checks and browser lanes when a browser is available.

### Task 3: versioned public documentation and architecture contracts

**Files:** README.md, docs/README.md, scripts/build-docs.mjs,
docs/blinkfx/*, docs/architecture/control-protocol.md,
docs/architecture/cli.md, docs/development/*,
docs/research/ssf/algorithms-and-changelogs.md.
**Produces:** Documentation site and implementation boundaries for later stages.

- [x] Promote the R2 package/ABI contract and JSON schema into tracked docs.
      Relink examples, remove private scratch references from public documentation,
      and mark target versus implemented behavior. Preserve archived history.
- [x] Document native effect layout, manifest, controls, inputs, GLSL/functions,
      scripts, WGSL coverage, future TS authoring, conversion and existing CLI.
- [x] Write the versioned HTTP/WS contract with roles, capabilities, ack/error
      lifecycle, runtime-owned state, revisions, reconnect and explicit limits.
      Write a separate later-stage CLI plan with the user's exact command surface.
- [x] Configure a VitePress site whose published pages omit evidence/research
      datasets and archived specs; retain those files in the repository locally.
- [x] Move the root research report to research docs and correct its references.
      Preserve legacy deployment scripts/config under documented legacy tooling.
- [x] Build docs for the Pages base and verify internal links and schema fixtures.

### Task 4: GitHub workflows and public audit

**Files:** .github/workflows/ci.yml, .github/workflows/pages.yml,
.github/workflows/browser.yml, .github/workflows/security.yml,
docs/development/public-release.md.
**Consumes:** Commands/artifacts from Tasks 1-3.

- [x] CI: npm ci, format check, typecheck, ESLint/Stylelint, core tests and both
      static build checks. Run on PRs and pushes, with read-only permissions.
- [x] Separate browser WebGL2 lane from optional WebGPU/manual private reference
      runs. Upload failure evidence. No private corpus dependency in public CI.
- [x] Pages workflow builds/upload artifacts automatically but requires explicit
      repository-variable opt-in before deployment. Default-branch only, minimal
      deployment permissions and concurrency. Do not enable or run deployment.
- [x] Add full-history secret scanning with a pinned scanner and redacted reports.
      Keep project/asset license selection, private data review and repo/domain
      setup as release blockers rather than assigning a license.

### Task 5: final verification and handoff

**Files:** docs/development/modernization-report.md; private verification logs.

- [x] Run a clean npm ci, peer validation and the complete authorized gate once.
- [x] Validate root/local and Pages/subpath artifacts separately; run browser
      smoke when possible and explicitly report skipped hardware lanes.
- [x] Review the diff against baseline, root before/after and dependency changes.
      Check hooks, Git ignores/attributes, docs references and preserved tests.
- [x] Record local baseline hash, actual outcomes and remaining publication
      blockers. Leave implementation diff reviewable; no push/merge/PR/deploy.

## Deferred implementation plans

- Stage 2: installable Node CLI with `blink serve` and
  `blink effect validate|convert|test`, packaging smoke in a clean install.
- Stage 3: loopback broker, role/auth/origin validation, HTTP/WS adapters and
  two-renderer integration tests against the versioned protocol.
- Stage 4: multi-instance control frontend and separately approved public release.

## Steering incorporated

Add main/version-tag ruleset templates, Commitlint and staged/push/CI provenance checks.
Prepare the independent BlinkFX contract bundle with Draft 2020-12 schema and checked declaration snapshots.
Document JS/TS compilation, worker timing and source revision/rollback contracts as later delivery steps.
The four supplied SSF gists are reference evidence only, linked in research documentation.
