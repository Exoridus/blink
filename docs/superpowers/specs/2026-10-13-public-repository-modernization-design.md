# Public repository modernization

Status: direction approved; Stages 0 and 1 authorized. Later stages and all public
publication require separate authorization. Binding requirements below supersede
the original proposal where they differ.

## Binding delivery requirements

1. Stage 0 inventories and checks all existing SSF/runtime work, then secures it
   in a traceable local baseline commit before formatting, migration or deletion.
   Preserve relevant tests and record baseline failures without disguising them.
2. Select an up-to-date compatible toolchain, not blanket `latest` upgrades.
   Use ESLint, Stylelint for existing SCSS, Prettier, EditorConfig and targeted
   Husky/lint-staged checks. Never run the complete test suite at every commit.
3. CI covers typecheck, lint, tests and production builds. Validate public
   subpath and locally hosted root builds separately. Pages is static only.
   Separate browser/GPU and private-corpus lanes from the portable core gate.
4. Later CLI work starts with an installable Node CLI: `blink serve` and
   `blink effect validate|convert|test`. Reuse existing implementations. Static
   validation and browser/GPU execution are different checks. Native executable
   packaging is deferred. Do not implement the CLI in Stage 1.
5. Draft a versioned control contract now: HTTP queries/commands, WebSocket
   events/telemetry, renderer/controller/observer roles, instance IDs,
   capabilities, acknowledgements, snapshots, revisions and reconnect.
   The browser owns render/audio state; the broker has no parallel runtime state.
   Do not implement the broker or protocol adapters in Stage 1.
6. Broker defaults to loopback. Explicit LAN/remote access requires authentication,
   origin checks, validated inputs and bounded payloads. Untrusted shaders,
   scripts and file/URL imports are separate security boundaries. No WebTransport.
7. Audit repository and Git history for secrets, private research and assets
   without redistribution permission before publication. Project license and
   asset licensing are separate decisions. Preserve LICENSE until the owner
   selects a replacement. No history rewriting or data removal without approval.
8. `docs/` is the versioned source of truth, preferably a generated website.
   Publish the BlinkFX spec/schema/ABI, custom effects, conversion and CLI docs.
   Keep historical specs clearly archived. Private scratch stays private.
9. Deliver a Git diff, executed checks, root before/after comparison, dependency
   changes and remaining publication blockers. No push, merge, PR or public deploy.

## Intent

Prepare Blink for a public GitHub repository with a reproducible frontend build,
consistent contributor tooling, documented BlinkFX authoring, and an executable
CLI. Enable a future control frontend to manage multiple rendering instances
through a shared application protocol.

Preserve the existing rendering, multipass, audio, package validation and
conversion implementations. The BlinkFX v1 Final Candidate R2 defines the target
package contract. Document implemented behavior separately from target behavior.
Control transport remains an application concern outside effect manifests.

## Observed starting point

- Vite 8, TypeScript 6, ESLint 10 and Prettier 3 are already declared.
- Vitest remains on 2.x. Node 24 is installed locally.
- ExoJS and its audio package are pinned to 0.19.1.
- `scripts/blinkfx.ts` implements inspect, validate, convert, report, pack,
  unpack and doctor, including ISF, SSF and Shadertoy conversion.
- `ShellHost` provides asynchronous effect operations and state/diagnostic
  subscriptions. Output settings currently also expose synchronous methods;
  those need an adapter before becoming remote operations.
- EditorConfig, Git attributes, Stylelint, Husky and GitHub workflows are absent.
- Existing deployment scripts and `buildspec.yml` target an earlier workflow.
- README contains only a title. LICENSE contains discussion text rather than a
  project license. Package metadata refers to GitLab; no Git remote is configured.
- The worktree contains extensive existing runtime, SSF, UI and documentation
  changes. Do not overwrite, revert or incorporate them into unrelated commits.

## Approaches

1. Recommended: modernize the existing repository in independently verifiable
   stages. Preserve `src/` and extract only the boundaries CLI and transport need.
2. Convert immediately to npm workspaces with separate app, runtime, CLI and
   protocol packages. This helps independent releases, but adds import and build
   migration work before those boundaries have been demonstrated.
3. Only refresh configuration and publish the frontend. This is smaller, but
   leaves the requested CLI and control architecture outside the resulting scope.

Use approach 1. The staged order below is proposed; the first-stage scope awaits
the user's response.

## Stage 1: repository, tooling, CI and documentation foundation

Keep essential package, compiler, bundler and contributor configuration in the
root. Move the research report into research documentation after checking its
references. Retire AWS deployment configuration only when the GitHub workflow
replaces it and continued AWS hosting is ruled out. Leave ignored build outputs,
logs and conversion corpora alone unless cleanup is specifically needed.

Use Node 24 LTS and npm with a committed lockfile. Resolve current stable package
versions from the registry during implementation, inspect peer requirements and
migrate consumers before accepting major upgrades. Keep ExoJS packages aligned.
Do not select prereleases just because their version number is higher.

Retain ESLint for JS/TS correctness and Prettier for formatting across code,
JSON, Markdown and YAML. Add Stylelint with the standard SCSS configuration.
Avoid duplicate formatting rules. Scope each tool explicitly so archives,
third-party shader corpora and generated material are not reformatted.

Add EditorConfig and Git attributes with LF as the default and explicit CRLF
exceptions where Windows formats require them. Preserve existing working-tree
line endings during unrelated edits. Expand ignore rules for tool outputs and
local configuration; ignore rules do not remove already tracked files.

Pre-commit uses Husky and lint-staged on staged first-party files. Pre-push runs
type checks, lint, tests and production builds once. CI repeats the complete
gate on pull requests and pushes, using `npm ci` and a fixed Node major. During
iteration use targeted checks rather than repeatedly running the full gate.

Build the frontend with Vite's production bundling and minification. Publish a
Pages artifact with the correct repository or custom-domain base path. Deploy
only from the default branch after checks pass, with minimal job permissions
and deployment concurrency. Pull requests build without deploying.

Pages hosts the standalone application and documentation. It cannot host the
CLI broker; remote sessions require a separately running broker. Keep standalone
use functional without a backend.

Create `docs/README.md` as the documentation index. Promote the R2 package and
ABI contract into `docs/blinkfx/`, including its schema and small examples, after
checking the schema against runtime validation. Cover package layout, manifest,
files, controls, inputs, uniforms, passes, GLSL, helper functions, scripting,
conversion, CLI, installation and application control architecture. Label WGSL
implementation coverage honestly; existing WGSL runtime tests mean it is not
accurate to describe all WGSL support as future work. TypeScript effect scripting
is a future authoring/build feature, not a claimed v1 runtime requirement.

Keep Markdown in this repository as the source of truth. A later documentation
site can publish it under `/docs/`; a separate GitHub Wiki would duplicate the
review and versioning workflow. Preserve audio research and historical archives.

Stage acceptance: fresh `npm ci`, lint, format checks, type checks, tests and
production build pass; hooks operate on Windows and Linux; a subpath build finds
its effects/assets; CI builds without a private corpus or machine-specific tools.
Remote deployment remains unverified until the repository and Pages are configured.

## Stage 2: executable CLI

Expose `blink` through npm `bin`, as a bundled Node ESM entry with a shebang.
Include the production frontend distribution in its package. It must run after
installation without Vite, vite-node or the source checkout. Native standalone
OS executables are a separate distribution decision.

Reuse existing package readers, validators, writers and converters. Provide
`blink serve`, `blink fx inspect`, `blink fx validate`, `blink fx convert`,
`blink fx pack`, `blink fx unpack`, `blink fx report` and `blink doctor`.
Keep the existing development command available during migration. Specify help,
version, structured JSON output and exit codes. Separate static validation from
browser/GPU verification: a structurally valid package is not proof of rendering
correctness. GPU verification needs a real browser and explicit capabilities.

`serve` hosts the bundled app with correct MIME types and package routes, binds
to loopback by default, supports explicit host/port choices, and stops cleanly.
Reject filesystem traversal and do not expose arbitrary repository files.

Stage acceptance: install a packed npm artifact into a clean temporary directory;
run help/version, serve assets, exercise valid and invalid packages, and convert
small licensed fixtures for all three formats. Test conversion/archive round trips.

## Stage 3: HTTP and WebSocket control

The CLI server owns a registry and routing broker. Each output browser owns its
GPU/audio runtime and registers a session. Controllers discover sessions, select
an instance, send commands, and subscribe to state and diagnostics. Browser media
permissions and autoplay still require interaction in the rendering browser.

Use HTTP for discovery, snapshots, package operations and commands. Use WebSocket
for renderer connections and controller subscriptions. Both adapt one versioned
command/event model; do not implement two independent control paths. WebTransport
is deferred until a concrete requirement justifies another transport.

Specify session IDs, protocol version, request IDs, error codes, command timeouts,
disconnect behavior and state revisions before implementation. A command succeeds
only when its target runtime confirms application, not merely when the broker
queues it. Do not replay commands automatically after reconnect. Send a fresh
snapshot on subscription/reconnect and distinguish disconnected sessions from
fresh live state. Bound message sizes, pending requests and telemetry queues.

Preserve effect-switch transactionality and ordering. Send control metadata and
values as coherent snapshots. Revisit the existing preset/effect-only state push
policy so remote controllers receive accepted control changes and useful,
rate-limited script changes. Keep bang events distinct from durable controls.

For non-loopback hosting require explicit configuration, authentication and an
origin policy. Never embed broker credentials in a public Pages bundle. Document
HTTPS/WSS requirements for secure browser deployments and media access.

Stage acceptance: two renderer clients and one controller; correct instance
routing, command acknowledgement and errors, state revisions, reconnect snapshot,
bounded telemetry, cleanup and unchanged local standalone operation.

## Stage 4: control frontend and public release

Build the command center against the same asynchronous host contract and remote
adapter. Include instance selection, effects, controls, inputs, output settings
and diagnostics. Avoid exposing arbitrary runtime internals as a public protocol.

Before public release, select the project's license and GitHub destination,
audit bundled effect provenance and redistribution permissions, and replace
placeholder package metadata. Moving files does not clean Git history; any
history rewrite requires a separate review and recovery point.

## Review decisions

- First delivery: Stage 1 only, or also CLI hosting and the control transport.
- Project license and destination repository/custom domain before publication.
- Whether legacy AWS deployment must remain available.

Package upgrades, hooks, workflows and runtime behavior have not been changed
or validated by this design draft.

## Accepted additions during implementation

- main is the default target; prepare branch and version-tag rulesets without applying a remote change.
- Commitlint enforces Conventional Commits; hooks/CI block co-author trailers and assistant/model provenance while preserving technical and third-party license references.
- BlinkFX remains .blinkfx with format blinkfx/1. Prepare an extractable, engine-independent spec bundle for a later separately authorized repository.
- Draft 2020-12 schema candidates, TypeScript declarations, examples and conformance checks live together. No immutable published release is claimed yet.
- JS and TS are official authoring languages; distributed code is JS. Shared compiler, persistent native workers, Monaco and revisions are separately planned, not implemented here.
- Source revisions belong to the broker; render/audio state remains in each renderer. Rollback restores code/assets/control configuration, not historical GPU/audio buffers.
- Use a small Markdown documentation generator instead of VitePress 1.x, which imports a vulnerable legacy Vite dependency.
