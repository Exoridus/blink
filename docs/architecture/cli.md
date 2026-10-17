# Installable CLI contract

Status: planned; this modernization implements tooling and documentation only.

The first distribution is a Node 24 package exposing `blink` through npm `bin`.
Its ESM entry has a shebang and includes the production root-path frontend build.
It runs after installation without Vite, vite-node or the repository checkout.
Fully self-contained native binaries are a later packaging step.

| Planned command                                                                     | Contract                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `blink serve [--host 127.0.0.1] [--port 8080]`                                      | Serve bundled app and, later, the authenticated control broker |
| `blink effect validate <package>... [--json]`                                       | Static package validation; executes no effect code             |
| `blink effect convert <source>... --out <dir> [--format auto\|isf\|ssf\|shadertoy]` | Existing converters and structured findings                    |
| `blink effect test <package> --backend webgl2\|webgpu [--json]`                     | Validate, then execute in an explicitly selected browser/GPU   |
| `blink effect pack <project> --out <package.blinkfx>`                               | Validate/build authoring input before portable ZIP export      |
| `blink effect unpack <package.blinkfx> --out <project>`                             | Editable project extraction with traversal/size checks         |

Retain inspect/report/doctor and help/version commands. Exit codes: 0 success,
1 failed validation/conversion/execution, 2 usage error. Unsupported requested GPU
capabilities are a failed test with a structured reason, never a silent success.
Static manifest validity and rendering conformance are separate results.

## Implementation sequence

1. Extract reusable argument/command handlers from existing tooling, bundle the
   executable, package `dist/local`, and verify a clean npm-pack/install cycle.
2. Implement loopback static hosting with explicit paths, MIME types and shutdown.
   Reject traversal, symlinks, arbitrary filesystem serving and directory listings.
3. Connect existing converters/validators and add browser test orchestration using
   explicit trusted fixtures and bounded execution. Preserve compatibility tests.
4. Add the shared JS/TS compiler and worker host under the separate authoring plan.
5. Add the broker/protocol and revision services, then multi-instance control UI.

Import boundaries: directory/archive parsing, URL fetching, scripts and shaders
are independently validated. URL imports are opt-in, restrict protocols/redirects,
block private network destinations unless explicitly allowed, and cap bytes/time.
ZIPs have bounded entry counts/uncompressed sizes and no escaping paths. GPU tests
have watchdogs and budgets. Compiler module resolution stays within the project;
runtime imports do not grant arbitrary npm, filesystem or network access.

Pages is a static distribution mode and cannot run this Node process. It may run
standalone and later connect to a configured HTTPS/WSS broker without embedding
credentials in the public bundle.
