# Authoring, workers and live revisions

Status: accepted direction, implementation deferred. Keep `blinkfx/1` and existing
JS/SSF packages valid. A separate BlinkFX spec repository owns format, schema,
declarations, examples and conformance; it owns no rendering engine or editor.

## Shared compiler

An editable project contains its manifest, shaders, JS/TS modules and assets.
Distribution is a ZIP `.blinkfx` containing executable JavaScript. Preserve optional
TS sources/maps without requiring them at execution. Compile TypeScript to JavaScript,
not JSON. JavaScript remains equally supported, with optional JSDoc type checking.

The compiler pipeline runs independently of a broker. Node CLI/broker and static
browser editing share resolution, validation and output rules. Evaluate esbuild
for Node and esbuild-wasm in a compiler worker for browser builds. Transpilation is
not type checking: use TypeScript's language service/compiler for diagnostics.
Resolve only package-local modules or explicitly bundled dependencies; no arbitrary
runtime network imports. Reproducible packing validates all inputs and records
content hashes. Editing a ZIP first creates a virtual working project; saving a
file does not recompress the whole archive.

Monaco is later frontend work. Add runtime and manifest-specific declarations to
its TypeScript service for control-name/value completion. GLSL needs its own language
support; `.d.ts` files cannot supply shader completion. Save stores source revisions;
preview/apply compiles and validates; publish/pack performs complete checks.

## Native scene worker

Keep a persistent native JS worker per active scene. Compiler, scene worker and
renderer have separate lifetimes. Frame input includes frame ID, seconds/delta,
control values and an immutable audio snapshot. Frame output includes the same ID,
control/uniform changes and bounded diagnostics. Apply a successfully completed
update to that same logical render frame.

Proposed host defaults: an 8 ms update deadline, no concurrent update requests for
one worker, discard late results, hold the last complete output on a miss, and
disable the worker after three consecutive misses/errors. Keep visuals and audio
alive with the last valid effect configuration and publish the fault. Setup has a
separate two-second deadline; shutdown terminates a worker that ignores disposal.
These are host policy defaults, not manifest format constants. Prove ordering and
error semantics before replacing the existing native or SSF execution hosts.

SSF stays behind `ssf/1`; migrate its execution thread only after its synchronous
event/update/readback contracts can be preserved. Do not make worker placement
an excuse to change observable SSF semantics.

## Source revisions and rollback

Source revision and runtime state are separate. The broker persists immutable
source/build revisions, compilation findings and activation outcomes. A renderer
owns its current running revision, controls, GPU feedback buffers and audio queue.
There is no second runtime state machine in the broker.

Revision creation carries a known base revision. Reject stale bases with 409;
never overwrite another editor silently. Revision IDs are content hashes of a
canonical file-path/content manifest. Compile, statically validate and prepare
resources before sending an activation command. Renderer GPU/script preparation
must succeed before activation at a defined frame boundary. Failure leaves the
previous valid revision running.

Planned routes extend `/api/v1/projects/{id}/revisions` for source/build history and
instance commands for activate/rollback. Project upload limits, retention, compiler
capabilities and authorization belong to a separate implementation plan; arbitrary
files are never accepted through the ordinary control WebSocket.

Rollback restores code, assets and selected control configuration, not previous
audio samples or feedback frames. Script reload starts a new worker by default;
feedback resets when shader/pass/resource compatibility cannot be proved. Optional
state migration needs a later explicit contract. Ordinary control changes bypass
full compilation/reload.

## Delivery sequence

1. Promote/check the R2 contract and prepare its extractable spec bundle here.
2. Create the independent specification repository after destination/license approval.
3. Deliver installable CLI and root/static hosting.
4. Implement shared JS/TS compiler and native worker with ordering/watchdog tests.
5. Add Monaco and local static-browser preview.
6. Add broker source revisions, prepare/activate transactions and rollback tests.
7. Build the multi-instance control studio against the versioned control protocol.
