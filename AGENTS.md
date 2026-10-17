# Blink agent instructions

## Project contracts

Blink implements the portable BlinkFX format. Read docs/blinkfx/README.md and the
relevant active contract before changing manifests, ABI, converters or runtime.
docs/blinkfx/specification.md is the current Final Candidate R2 package target.
docs/architecture/ contains planned CLI, control and authoring contracts; their
status does not imply implementation. Historical specs under docs/archive/ are
not current authority. Preserve docs/research/audio/ and relevant parity tests.

Keep source-format conversion and compatibility in Blink. ExoJS supplies generic
rendering/input/audio primitives. Inspect the installed released ExoJS API before
introducing a narrowly isolated adapter. Preserve working multipass, audio and
render-target infrastructure. Promote durable decisions into tracked docs.

## Source hygiene

Prefer self-explanatory code. Comments explain non-obvious correctness, lifecycle,
ordering, compatibility or intentional deviations; never narrate visible code.
JSDoc is concise caller-facing reference documentation. No development provenance,
private scratch references, conversation history or machine-specific workspace
paths in source, tests or public guides. Developer-facing documentation is English
with ASCII punctuation. Preserve technically meaningful symbols and localization.

## Commits and publication

Use Conventional Commits and the policy in docs/development/commit-policy.md.
Never add Co-authored-by trailers or assistant/model attribution to commits, PR
titles/bodies or first-party source documentation. Do not erase required third-party
copyright/license information. Technical API usage is allowed; author credits and
generated-by notices are not. Hooks and CI reject violations rather than silently
rewriting attribution. main and v* tags are protected publication targets.

No push, merge, PR, public deployment, license replacement or destructive history
cleanup without explicit authorization. Local baseline commits preserve existing
work before migrations; they do not authorize publishing imported material.

## Validation and files

Use Node 24 and npm ci. Read CONTRIBUTING.md for tooling and build conventions.
Run targeted tests/checks while iterating; the pre-push hook/CI runs npm run check.
Do not weaken or delete tests to satisfy a gate. Report failures and skipped GPU
or private-corpus lanes explicitly. Preserve existing working-tree line endings;
.gitattributes governs Git normalization. New text is LF except Windows formats.
Private scratch, generated output and credentials stay untracked. Use the session
scratch directory or the OS temporary directory, never a drive-root tmp folder.
