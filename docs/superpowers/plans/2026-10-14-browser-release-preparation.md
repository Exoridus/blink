# Browser release preparation implementation plan

> **For agentic workers:** Use superpowers:executing-plans for integration. Independent script and fixture migrations use superpowers:dispatching-parallel-agents.

**Goal:** Prepare the existing browser application and an independent BlinkFX contract bundle for a reviewable first release.

**Architecture:** Keep the current frontend and renderer together. Separate private reference data from portable tests and shipping effects. Export the specification without the engine; investigate output transports without implementing a broker or streaming subsystem.

**Tech stack:** Node 24, TypeScript 7 compiler, TypeScript 6 parser API compatibility, Vite, Vitest, Playwright, ESLint, Stylelint and Prettier.

**Spec:** The approved public modernization design and the browser-first scope supplied on 2026-10-14.

## Global constraints

- Preserve the SSF/runtime baseline and all meaningful test assertions.
- No public repository creation, push, deployment, history rewrite or license replacement.
- Keep GitHub Pages static and validate root and subdirectory builds separately.
- Use strict types in migrated scripts; no blanket `any`, `ts-ignore` or `ts-nocheck`.
- Preserve private source material locally; a conversion does not grant redistribution rights.

## Review focus

- A fresh checkout without private corpora runs the portable gate.
- Explicit private tests fail clearly if their required data is absent.
- Both build variants contain only intentional application assets.
- Node script execution and browser-evaluated functions retain their runtime behavior.
- Showcase shaders compile and render with silence and synthetic audio, without copyrighted external assets.

## Tasks

- [x] Inventory root artifacts, tracked foreign content, consumers and release blockers; preserve a recovery inventory.
- [x] Move corpora into private storage, retain original private tests and add authored portable cases. Remove unused AWS configuration after checking consumers.
- [x] Migrate tooling and browser/research scripts to typed `.ts`; update commands, hooks, policies and CI. Verify TypeScript 7 and ESLint parser compatibility.
- [x] Prepare an independent local specification export with schemas, declarations, examples and a standalone conformance runner. Preserve license uncertainty explicitly.
- [x] Add a small original audio-reactive showcase and curate the default catalog; verify manifests, packages and browser rendering.
- [x] Document transport alternatives, integration boundaries and an empirical latency test plan using primary sources.
- [x] Run the portable gate, fresh-checkout validation and both browser build lanes; review the complete diff and report blockers and actual outcomes.

The existing baseline commit remains the recovery point. Local working changes are kept reviewable; external publication is a separate decision after the complete result is available.
