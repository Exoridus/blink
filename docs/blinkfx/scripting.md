# Native JavaScript and TypeScript

JavaScript and TypeScript are the official native authoring languages. TypeScript
is compiled to standardized JavaScript; JSON stores only manifests and serializable
data. The packaged manifest points to executable `.js` with `language: "javascript"`
and `abi: "blink/1"`. Optional TypeScript sources and source maps can accompany it.
Current CLI packaging does not yet perform TypeScript compilation.

Native scripts export ECMAScript module hooks:

```typescript
import type { BlinkScriptContext } from './types/scene-runtime';

export function setup(ctx: BlinkScriptContext): void {
    ctx.controls.set('speed', 1);
}

export function update(ctx: BlinkScriptContext, dt: number): void {
    ctx.controls.set('speed', Math.min(4, ctx.audio.bass + dt));
}

export function dispose(_ctx: BlinkScriptContext): void {}
```

`setup` runs once per activation; `update` receives the current context and seconds
since the preceding logical frame; `dispose` releases scene-owned work. Hooks may
return promises. Context values are frame snapshots. Controls use the implemented
primitive encoding: booleans as 0/1, enums as option indices and vector values as
typed arrays. The shipped declaration snapshot matches the current context;
arbitrary `ctx.setUniform()` and nested `ctx.audio.bass.level` are not existing APIs.
A future scoped uniform-write extension needs its own additive contract and tests.

Blink's target host creates a persistent worker per active native scene. A successful
update result applies to the same logical render frame. Each request/result carries
its frame ID; stale results are discarded. The host uses an explicit deadline,
keeps the preceding complete script output on a missed deadline, and disables a
repeatedly failing worker with diagnostics. Exact host defaults are documented in
[the planned implementation](../architecture/authoring-and-revisions.md).
The current native runtime still executes lifecycle hooks on the main thread.
The ABI defines observable behavior; another compliant host need not reproduce
Blink's worker implementation.

Effect code is untrusted. A worker isolates execution and has no DOM, but can still
use network-capable browser APIs. Workers alone are not a security sandbox.
Enforce a separate trust/capability policy for community scripts and imports.

SSF retains `ssf/1`: persistent legacy globals, `setup()`, `update(dt)`, `syn_*`
values and compatibility helpers. Do not rewrite SSF scripts into native modules
solely to fit the authoring UI. Existing SSF ordering and fidelity tests remain
authoritative for implemented compatibility behavior.
