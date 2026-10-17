# BlinkFX Multipass Pass-Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the full BlinkFX pass graph — sequential multipass and persistent ping-pong feedback on rgba8 render targets — replacing the current single-screen-pass renderer, and light up real `.synScene` multipass effects by unfolding their `PASSES`.

**Architecture:** A new `src/runtime/render/pass/` package: `RenderTargetPool` owns ping-pong `RenderTexture`s, `planPasses` resolves the IR into an ordered pass plan, `executePasses` drives one imperative `context.renderTo`/`render` loop per frame, and `BlinkPassRuntime` ties compilation + execution together. `RenderService` swaps its single `sceneMesh` for a `BlinkPassRuntime`. `SynSceneLoader` is changed to emit real multipass IR instead of folding to one pass.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 2, ExoJS 0.15.2 (WebGL2 backend, `RenderingContext.renderTo`/`render`, `RenderTexture`, `MeshMaterial`, `Mesh`).

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-07-06-blinkfx-multipass-runtime-design.md`. Read it before starting.
- rgba8 render targets only. `BlinkRenderTargetSpec.format` other than `rgba8` → one `console.warn`, allocate rgba8. Float is an external ExoJS task (`../ExoJS/.workspace/specs/2026-07-06-render-texture-float-format.md`); do NOT implement float here.
- Do NOT modify the ExoJS package or any file under `../ExoJS/`.
- Substrate is imperative `context.renderTo(mesh, { target, clear? })` for off-screen passes and `context.render(mesh, { view })` for the screen pass. Do NOT introduce `RenderPipeline`/`RenderNodePass` (they fix target at construction → would force two-variant ping-pong).
- A pass must never read and write the same physical `RenderTexture` (GL feedback loop). Persistent targets use two textures (ping-pong by frame parity); transient targets use one.
- New files under `src/runtime/render/` use **2-space** indentation (match `BlinkPrelude.ts`). `RenderService.ts` uses **4-space** indentation — match the file you edit.
- Verify commands: `npm run ts-check`, `npm run lint`, `npm test` (Vitest run), `npm run build`, `npm run dev` (live smoke).
- IR field names are fixed (`src/runtime/ir/types.ts`): `BlinkPassSpec { name, shader, inputs: readonly string[], target: BlinkPassTarget, clear: boolean }`; `BlinkPassTarget = { kind:'screen' } | { kind:'renderTarget', name:string }`; `BlinkRenderTargetSpec { name, width, height, scale, format, persistent }`.
- ExoJS facts (verified in installed `.d.ts`, 0.15.2): `new RenderTexture(width, height)` (rgba8, `.destroy()`, `.resize(w,h)`); `RenderingContext.renderTo(node, { target: RenderTexture, clear?: Color })` preserves target contents when `clear` omitted; `RenderingContext.render(node, { view? })`; `context.screenView` is the screen-space view; `MeshMaterial.setUniform(name, value)` where `UniformValue` includes `RenderTexture`; `new Mesh({ vertices: Float32Array, material })`; `MeshMaterial.from(vertexSrc, fragmentSrc, { uniforms })`.

---

### Task 1: `RenderTargetPool`

**Files:**
- Create: `src/runtime/render/pass/RenderTargetPool.ts`
- Test: `src/runtime/render/pass/__tests__/RenderTargetPool.test.ts`

**Interfaces:**
- Produces:
  - `type RenderTextureFactory = (width: number, height: number) => RenderTexture`
  - `class RenderTargetPool` with `constructor(specs, screen: { width, height }, createTexture?)`, `has(name): boolean`, `write(name, parity): RenderTexture`, `read(name, prevFrame, parity): RenderTexture`, `resize(width, height): void`, `dispose(): void`.

- [ ] **Step 1: Write the failing test**

Create `src/runtime/render/pass/__tests__/RenderTargetPool.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { BlinkRenderTargetSpec } from '../../../ir/types';
import { RenderTargetPool } from '../RenderTargetPool';

interface FakeTexture {
  width: number;
  height: number;
  destroyed: boolean;
  id: number;
}

let nextId = 0;
function makeFactory() {
  const created: FakeTexture[] = [];
  const factory = (width: number, height: number) => {
    const tex: FakeTexture = { width, height, destroyed: false, id: nextId++ };
    created.push(tex);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tex as any).destroy = () => { tex.destroyed = true; };
    return tex as unknown as import('@codexo/exojs').RenderTexture;
  };
  return { created, factory };
}

function spec(overrides: Partial<BlinkRenderTargetSpec>): BlinkRenderTargetSpec {
  return { name: 'buf', width: null, height: null, scale: null, format: 'rgba8', persistent: false, ...overrides };
}

const SCREEN = { width: 800, height: 600 };

describe('RenderTargetPool', () => {
  it('allocates one texture for a transient target and returns it for read and write', () => {
    const { factory } = makeFactory();
    const pool = new RenderTargetPool([spec({ name: 'a', persistent: false })], SCREEN, factory);
    const w = pool.write('a', 0);
    expect(pool.read('a', false, 0)).toBe(w);
    expect(pool.read('a', true, 0)).toBe(w);
  });

  it('ping-pongs two textures for a persistent target by parity', () => {
    const { factory } = makeFactory();
    const pool = new RenderTargetPool([spec({ name: 'fb', persistent: true })], SCREEN, factory);
    const even = pool.write('fb', 0);
    const odd = pool.write('fb', 1);
    expect(even).not.toBe(odd);
    // even frame: read prev = the odd texture, read current = the even texture
    expect(pool.read('fb', true, 0)).toBe(odd);
    expect(pool.read('fb', false, 0)).toBe(even);
    // odd frame: read prev = the even texture
    expect(pool.read('fb', true, 1)).toBe(even);
  });

  it('resolves size from explicit dims, then scale, then screen', () => {
    const { factory } = makeFactory();
    const pool = new RenderTargetPool(
      [spec({ name: 'x', width: 320, height: 240 }), spec({ name: 'y', scale: 0.5 }), spec({ name: 'z' })],
      SCREEN,
      factory,
    );
    expect([pool.write('x', 0).width, pool.write('x', 0).height]).toEqual([320, 240]);
    expect([pool.write('y', 0).width, pool.write('y', 0).height]).toEqual([400, 300]);
    expect([pool.write('z', 0).width, pool.write('z', 0).height]).toEqual([800, 600]);
  });

  it('reallocates on resize and destroys the old textures', () => {
    const { created, factory } = makeFactory();
    const pool = new RenderTargetPool([spec({ name: 'fb', persistent: true })], SCREEN, factory);
    const before = created.length;
    pool.resize(1024, 768);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(created.slice(0, before).every(t => (t as any).destroyed)).toBe(true);
    expect(pool.write('fb', 0).width).toBe(1024);
  });

  it('throws on an unknown target name', () => {
    const { factory } = makeFactory();
    const pool = new RenderTargetPool([spec({ name: 'a' })], SCREEN, factory);
    expect(() => pool.write('missing', 0)).toThrow(/unknown render target/i);
  });

  it('dispose destroys every texture', () => {
    const { created, factory } = makeFactory();
    const pool = new RenderTargetPool([spec({ name: 'fb', persistent: true }), spec({ name: 'a' })], SCREEN, factory);
    pool.dispose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(created.every(t => (t as any).destroyed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/runtime/render/pass/__tests__/RenderTargetPool.test.ts`
Expected: FAIL — cannot find module `../RenderTargetPool`.

- [ ] **Step 3: Write the implementation**

Create `src/runtime/render/pass/RenderTargetPool.ts`:

```ts
import { RenderTexture } from '@codexo/exojs';

import type { BlinkRenderTargetSpec } from '../../ir/types';

export type RenderTextureFactory = (width: number, height: number) => RenderTexture;

interface PooledTarget {
  spec: BlinkRenderTargetSpec;
  textures: RenderTexture[];
}

/**
 * Owns the offscreen RenderTextures for a BlinkFX effect's render targets.
 *
 * Transient targets get one texture; persistent (feedback) targets get two,
 * ping-ponged by frame parity so a pass never reads and writes the same
 * physical texture (a GL feedback loop). rgba8 only this slice.
 */
export class RenderTargetPool {
  private readonly targets = new Map<string, PooledTarget>();
  private readonly createTexture: RenderTextureFactory;
  private screenWidth: number;
  private screenHeight: number;

  public constructor(
    specs: readonly BlinkRenderTargetSpec[],
    screen: { width: number; height: number },
    createTexture: RenderTextureFactory = (w, h) => new RenderTexture(w, h),
  ) {
    this.createTexture = createTexture;
    this.screenWidth = screen.width;
    this.screenHeight = screen.height;

    for (const spec of specs) {
      if (spec.format !== 'rgba8') {
        console.warn(
          `RenderTargetPool: target "${spec.name}" requests format "${spec.format}"; ` +
          'float render targets are not yet supported (pending ExoJS RenderTexture format). Using rgba8.',
        );
      }
      this.targets.set(spec.name, { spec, textures: this.allocate(spec) });
    }
  }

  public has(name: string): boolean {
    return this.targets.has(name);
  }

  public write(name: string, parity: number): RenderTexture {
    const target = this.get(name);
    return target.spec.persistent ? target.textures[parity & 1] : target.textures[0];
  }

  public read(name: string, prevFrame: boolean, parity: number): RenderTexture {
    const target = this.get(name);
    if (!target.spec.persistent) {
      return target.textures[0];
    }
    const writeIndex = parity & 1;
    return prevFrame ? target.textures[writeIndex ^ 1] : target.textures[writeIndex];
  }

  public resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    for (const target of this.targets.values()) {
      for (const texture of target.textures) {
        texture.destroy();
      }
      target.textures = this.allocate(target.spec);
    }
  }

  public dispose(): void {
    for (const target of this.targets.values()) {
      for (const texture of target.textures) {
        texture.destroy();
      }
    }
    this.targets.clear();
  }

  private get(name: string): PooledTarget {
    const target = this.targets.get(name);
    if (target === undefined) {
      throw new Error(`RenderTargetPool: unknown render target "${name}"`);
    }
    return target;
  }

  private allocate(spec: BlinkRenderTargetSpec): RenderTexture[] {
    const [width, height] = this.resolveSize(spec);
    const count = spec.persistent ? 2 : 1;
    const textures: RenderTexture[] = [];
    for (let i = 0; i < count; i++) {
      textures.push(this.createTexture(width, height));
    }
    return textures;
  }

  private resolveSize(spec: BlinkRenderTargetSpec): [number, number] {
    if (spec.width !== null && spec.height !== null) {
      return [spec.width, spec.height];
    }
    if (spec.scale !== null) {
      return [
        Math.max(1, Math.floor(this.screenWidth * spec.scale)),
        Math.max(1, Math.floor(this.screenHeight * spec.scale)),
      ];
    }
    return [this.screenWidth, this.screenHeight];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/runtime/render/pass/__tests__/RenderTargetPool.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/runtime/render/pass/RenderTargetPool.ts src/runtime/render/pass/__tests__/RenderTargetPool.test.ts
git commit -m "feat: add RenderTargetPool for multipass ping-pong render targets"
```

---

### Task 2: `buildPassPrelude`

**Files:**
- Create: `src/runtime/render/pass/buildPassPrelude.ts`
- Test: `src/runtime/render/pass/__tests__/buildPassPrelude.test.ts`

**Interfaces:**
- Produces: `buildPassPrelude(names: readonly string[]): string` — GLSL fragment declaring `uniform int bl_pass;` and one `uniform sampler2D <name>;` per name. The caller (Task 5) passes the **union of all render-target names** so the shared shader compiles for every pass. Appended after the main Blink prelude, before the shader body, at material-build time.

- [ ] **Step 1: Write the failing test**

Create `src/runtime/render/pass/__tests__/buildPassPrelude.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildPassPrelude } from '../buildPassPrelude';

describe('buildPassPrelude', () => {
  it('always declares the bl_pass uniform', () => {
    expect(buildPassPrelude([])).toContain('uniform int bl_pass;');
  });

  it('declares one sampler2D per input', () => {
    const source = buildPassPrelude(['backbuffer', 'helper']);
    expect(source).toContain('uniform sampler2D backbuffer;');
    expect(source).toContain('uniform sampler2D helper;');
  });

  it('emits no sampler lines when there are no inputs', () => {
    expect(buildPassPrelude([])).not.toContain('sampler2D');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/runtime/render/pass/__tests__/buildPassPrelude.test.ts`
Expected: FAIL — cannot find module `../buildPassPrelude`.

- [ ] **Step 3: Write the implementation**

Create `src/runtime/render/pass/buildPassPrelude.ts`:

```ts
/**
 * Per-pass GLSL declarations appended after the shared Blink prelude:
 * the pass index and one sampler per render-target input the pass reads.
 * The runtime uploads `bl_pass` and binds each sampler every frame.
 */
export function buildPassPrelude(inputs: readonly string[]): string {
  const samplers = inputs.map(name => `uniform sampler2D ${name};`).join('\n');
  return samplers.length > 0
    ? `uniform int bl_pass;\n${samplers}\n`
    : 'uniform int bl_pass;\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/runtime/render/pass/__tests__/buildPassPrelude.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/runtime/render/pass/buildPassPrelude.ts src/runtime/render/pass/__tests__/buildPassPrelude.test.ts
git commit -m "feat: add buildPassPrelude for per-pass bl_pass and sampler declarations"
```

---

### Task 3: `planPasses`

**Files:**
- Create: `src/runtime/render/pass/planPasses.ts`
- Test: `src/runtime/render/pass/__tests__/planPasses.test.ts`

**Interfaces:**
- Consumes: `BlinkEffectIR` from `src/runtime/ir/types.ts`.
- Produces:
  - `interface PassInputPlan { uniform: string; source: string; readsPrevFrame: boolean }`
  - `interface PassPlan { name: string; shaderKey: string; target: BlinkPassTarget; inputs: PassInputPlan[]; clear: boolean; passIndex: number }`
  - `interface EffectPassPlan { passes: PassPlan[]; renderTargets: readonly BlinkRenderTargetSpec[] }`
  - `planPasses(effect: BlinkEffectIR): EffectPassPlan`

- [ ] **Step 1: Write the failing test**

Create `src/runtime/render/pass/__tests__/planPasses.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { BlinkEffectIR, BlinkPassSpec, BlinkRenderTargetSpec } from '../../../ir/types';
import { planPasses } from '../planPasses';

function effect(passes: BlinkPassSpec[], renderTargets: BlinkRenderTargetSpec[]): BlinkEffectIR {
  return {
    format: 'blinkfx-ir/1',
    metadata: { id: 'com.test.fx', title: 'FX', author: null, description: null, license: null, thumbnail: null, tags: [] },
    controls: [],
    assets: [],
    renderTargets,
    passes,
    shaders: { glsl: {}, wgsl: {} },
    presets: [],
    script: null,
  };
}

const RT = (name: string, persistent: boolean): BlinkRenderTargetSpec =>
  ({ name, width: null, height: null, scale: 1, format: 'rgba8', persistent });

describe('planPasses', () => {
  it('plans a single screen pass with a sequential passIndex', () => {
    const plan = planPasses(effect(
      [{ name: 'main', shader: 'main', inputs: [], target: { kind: 'screen' }, clear: true }],
      [],
    ));
    expect(plan.passes).toHaveLength(1);
    expect(plan.passes[0].passIndex).toBe(0);
    expect(plan.passes[0].inputs).toEqual([]);
  });

  it('marks a self-referential input as readsPrevFrame and a downstream read as current', () => {
    const plan = planPasses(effect(
      [
        { name: 'sim', shader: 'main', inputs: ['fb'], target: { kind: 'renderTarget', name: 'fb' }, clear: false },
        { name: 'present', shader: 'main', inputs: ['fb'], target: { kind: 'screen' }, clear: true },
      ],
      [RT('fb', true)],
    ));
    expect(plan.passes[0].inputs[0]).toEqual({ uniform: 'fb', source: 'fb', readsPrevFrame: true });
    expect(plan.passes[1].inputs[0]).toEqual({ uniform: 'fb', source: 'fb', readsPrevFrame: false });
    expect(plan.passes.map(p => p.passIndex)).toEqual([0, 1]);
  });

  it('throws when an input names an undeclared render target', () => {
    expect(() => planPasses(effect(
      [{ name: 'main', shader: 'main', inputs: ['ghost'], target: { kind: 'screen' }, clear: true }],
      [],
    ))).toThrow(/ghost/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/runtime/render/pass/__tests__/planPasses.test.ts`
Expected: FAIL — cannot find module `../planPasses`.

- [ ] **Step 3: Write the implementation**

Create `src/runtime/render/pass/planPasses.ts`:

```ts
import type { BlinkEffectIR, BlinkPassTarget, BlinkRenderTargetSpec } from '../../ir/types';

export interface PassInputPlan {
  uniform: string;
  source: string;
  readsPrevFrame: boolean;
}

export interface PassPlan {
  name: string;
  shaderKey: string;
  target: BlinkPassTarget;
  inputs: PassInputPlan[];
  clear: boolean;
  passIndex: number;
}

export interface EffectPassPlan {
  passes: PassPlan[];
  renderTargets: readonly BlinkRenderTargetSpec[];
}

/**
 * Resolve a BlinkEffectIR into an ordered pass plan: assigns each pass its
 * index, resolves each input to a render-target name, and flags an input as
 * reading the previous frame when it names the pass's own target (feedback).
 * Throws when an input names a target that is not declared.
 */
export function planPasses(effect: BlinkEffectIR): EffectPassPlan {
  const targetNames = new Set(effect.renderTargets.map(rt => rt.name));

  const passes: PassPlan[] = effect.passes.map((pass, index) => {
    const ownTarget = pass.target.kind === 'renderTarget' ? pass.target.name : null;
    const inputs: PassInputPlan[] = pass.inputs.map(source => {
      if (!targetNames.has(source)) {
        throw new Error(
          `planPasses: effect "${effect.metadata.id}" pass "${pass.name}" reads input "${source}", ` +
          'which is not a declared render target',
        );
      }
      return { uniform: source, source, readsPrevFrame: source === ownTarget };
    });

    return {
      name: pass.name,
      shaderKey: pass.shader,
      target: pass.target,
      inputs,
      clear: pass.clear,
      passIndex: index,
    };
  });

  return { passes, renderTargets: effect.renderTargets };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/runtime/render/pass/__tests__/planPasses.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/runtime/render/pass/planPasses.ts src/runtime/render/pass/__tests__/planPasses.test.ts
git commit -m "feat: add planPasses to resolve BlinkEffectIR into an ordered pass plan"
```

---

### Task 4: `executePasses`

**Files:**
- Create: `src/runtime/render/pass/executePasses.ts`
- Test: `src/runtime/render/pass/__tests__/executePasses.test.ts`

**Interfaces:**
- Consumes: `RenderTargetPool` (Task 1), `PassInputPlan` (Task 3), ExoJS `Mesh`/`MeshMaterial`/`RenderTexture`/`Color`.
- Produces:
  - `interface CompiledPass { name: string; mesh: Mesh; material: MeshMaterial; target: BlinkPassTarget; inputs: PassInputPlan[]; clear: boolean; passIndex: number }`
  - `interface PassDrawContext { renderTo(node, options: { target: RenderTexture; clear?: Color }): void; render(node, options?: { view?: unknown }): void; readonly screenView: unknown }`
  - `executePasses(context: PassDrawContext, passes: readonly CompiledPass[], pool: RenderTargetPool, parity: number, clearColor: Color, uploadFrameUniforms: (material: MeshMaterial, passIndex: number) => void): void`

- [ ] **Step 1: Write the failing test**

Create `src/runtime/render/pass/__tests__/executePasses.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { BlinkRenderTargetSpec } from '../../../ir/types';
import type { CompiledPass, PassDrawContext } from '../executePasses';
import { executePasses } from '../executePasses';
import { RenderTargetPool } from '../RenderTargetPool';

function fakeMaterial() {
  return { setUniform: vi.fn() } as unknown as import('@codexo/exojs').MeshMaterial;
}

function fakeTextureFactory() {
  return (width: number, height: number) =>
    ({ width, height, destroy: () => {} }) as unknown as import('@codexo/exojs').RenderTexture;
}

function recordingContext() {
  const calls: Array<{ kind: string; node: unknown; target?: unknown }> = [];
  const context: PassDrawContext = {
    renderTo: (node, options) => { calls.push({ kind: 'renderTo', node, target: options.target }); },
    render: (node) => { calls.push({ kind: 'render', node }); },
    screenView: {},
  };
  return { context, calls };
}

const rt = (name: string, persistent: boolean): BlinkRenderTargetSpec =>
  ({ name, width: null, height: null, scale: 1, format: 'rgba8', persistent });

const CLEAR = { r: 0, g: 0, b: 0, a: 1 } as unknown as import('@codexo/exojs').Color;

describe('executePasses', () => {
  it('renders a feedback sim pass into the write texture and the screen pass to the canvas', () => {
    const pool = new RenderTargetPool([rt('fb', true)], { width: 8, height: 8 }, fakeTextureFactory());
    const simMat = fakeMaterial();
    const presentMat = fakeMaterial();
    const passes: CompiledPass[] = [
      { name: 'sim', mesh: { id: 'simMesh' } as never, material: simMat, target: { kind: 'renderTarget', name: 'fb' }, inputs: [{ uniform: 'fb', source: 'fb', readsPrevFrame: true }], clear: false, passIndex: 0 },
      { name: 'present', mesh: { id: 'presentMesh' } as never, material: presentMat, target: { kind: 'screen' }, inputs: [{ uniform: 'fb', source: 'fb', readsPrevFrame: false }], clear: true, passIndex: 1 },
    ];
    const { context, calls } = recordingContext();
    const upload = vi.fn();

    executePasses(context, passes, pool, 0, CLEAR, upload);

    // sim pass: uploaded, bound prev-frame fb, rendered into fb write texture
    expect(upload).toHaveBeenNthCalledWith(1, simMat, 0);
    expect(simMat.setUniform).toHaveBeenCalledWith('fb', pool.read('fb', true, 0));
    expect(calls[0]).toMatchObject({ kind: 'renderTo', node: { id: 'simMesh' }, target: pool.write('fb', 0) });
    // present pass: bound current fb, rendered to screen
    expect(presentMat.setUniform).toHaveBeenCalledWith('fb', pool.read('fb', false, 0));
    expect(calls[1]).toMatchObject({ kind: 'render', node: { id: 'presentMesh' } });
  });

  it('passes clear color only when the pass clears', () => {
    const pool = new RenderTargetPool([rt('a', false)], { width: 8, height: 8 }, fakeTextureFactory());
    const passes: CompiledPass[] = [
      { name: 'w', mesh: {} as never, material: fakeMaterial(), target: { kind: 'renderTarget', name: 'a' }, inputs: [], clear: true, passIndex: 0 },
    ];
    const captured: Array<{ clear?: unknown }> = [];
    const context: PassDrawContext = {
      renderTo: (_node, options) => { captured.push({ clear: options.clear }); },
      render: () => {},
      screenView: {},
    };
    executePasses(context, passes, pool, 0, CLEAR, () => {});
    expect(captured[0].clear).toBe(CLEAR);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/runtime/render/pass/__tests__/executePasses.test.ts`
Expected: FAIL — cannot find module `../executePasses`.

- [ ] **Step 3: Write the implementation**

Create `src/runtime/render/pass/executePasses.ts`:

```ts
import type { Color, Mesh, MeshMaterial, RenderTexture } from '@codexo/exojs';

import type { BlinkPassTarget } from '../../ir/types';
import type { PassInputPlan } from './planPasses';
import type { RenderTargetPool } from './RenderTargetPool';

export interface CompiledPass {
  name: string;
  mesh: Mesh;
  material: MeshMaterial;
  target: BlinkPassTarget;
  inputs: PassInputPlan[];
  clear: boolean;
  passIndex: number;
}

/**
 * The subset of ExoJS RenderingContext this loop needs. Declared narrowly so
 * the executor is unit-testable with a plain recording fake.
 */
export interface PassDrawContext {
  renderTo(node: Mesh, options: { target: RenderTexture; clear?: Color }): void;
  render(node: Mesh, options?: { view?: unknown }): void;
  readonly screenView: unknown;
}

/**
 * Run one frame of the pass graph. For each pass in order: upload the shared
 * frame/audio/control uniforms (+ bl_pass) via `uploadFrameUniforms`, bind its
 * input samplers to the pool texture resolved for (source, readsPrevFrame,
 * parity), then draw — off-screen into the pool for a render-target pass, or to
 * the active target for the screen pass. Parity is chosen by the caller and
 * flipped after this returns.
 */
export function executePasses(
  context: PassDrawContext,
  passes: readonly CompiledPass[],
  pool: RenderTargetPool,
  parity: number,
  clearColor: Color,
  uploadFrameUniforms: (material: MeshMaterial, passIndex: number) => void,
): void {
  for (const pass of passes) {
    uploadFrameUniforms(pass.material, pass.passIndex);

    for (const input of pass.inputs) {
      pass.material.setUniform(input.uniform, pool.read(input.source, input.readsPrevFrame, parity));
    }

    if (pass.target.kind === 'renderTarget') {
      context.renderTo(pass.mesh, {
        target: pool.write(pass.target.name, parity),
        clear: pass.clear ? clearColor : undefined,
      });
    } else {
      context.render(pass.mesh, { view: context.screenView });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/runtime/render/pass/__tests__/executePasses.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/runtime/render/pass/executePasses.ts src/runtime/render/pass/__tests__/executePasses.test.ts
git commit -m "feat: add executePasses imperative multipass render loop"
```

---

### Task 5: `BlinkPassRuntime` + `RenderService` integration

**Files:**
- Create: `src/runtime/render/pass/BlinkPassRuntime.ts`
- Create: `src/runtime/render/pass/index.ts`
- Modify: `src/services/RenderService.ts`

**Interfaces:**
- Consumes: `planPasses` (Task 3), `buildPassPrelude` (Task 2), `RenderTargetPool` (Task 1), `executePasses` + `CompiledPass` + `PassDrawContext` (Task 4), `buildBlinkPrelude` (`../BlinkPrelude`), `upgradeFragmentShaderToGl300`, `stripGlslPreamble`.
- Produces:
  - `class BlinkPassRuntime` with `build(effect: BlinkEffectIR, screen: { width, height }, resolvedShaders: Map<string, string>): void`, `execute(context: PassDrawContext, uploadFrameUniforms: (material: MeshMaterial, passIndex: number) => void): void` (no-op when no effect is built), `resize(width, height): void`, `dispose(): void`.

**Design notes for this task:**
- `RenderService` currently resolves one shader (inline `source` or `fetch(path)`). Multipass may reference multiple shader keys; resolve each **unique** `pass.shaderKey` once into a `Map<string,string>` before `build`.
- The per-pass fragment source = `buildBlinkPrelude(effect.controls).source` + `buildPassPrelude(inputNames)` + `stripGlslPreamble(upgradeFragmentShaderToGl300(shaderSource))`.
- Move the existing `uploadUniforms` body into a closure `uploadFrameUniforms(material, passIndex)` that sets the same globals/frame/audio/texture uniforms on the given `material` plus `material.setUniform('bl_pass', passIndex)` and `material.setUniform('PASSINDEX', passIndex)` (SSF shaders compare `PASSINDEX == 0.0`; ExoJS marshals the int to the float uniform).

- [ ] **Step 1: Write `BlinkPassRuntime`**

Create `src/runtime/render/pass/BlinkPassRuntime.ts`:

```ts
import { Color, Mesh, MeshMaterial } from '@codexo/exojs';

import type { BlinkEffectIR } from '../../ir/types';
import { buildBlinkPrelude } from '../BlinkPrelude';
import { stripGlslPreamble } from '../stripGlslPreamble';
import { upgradeFragmentShaderToGl300 } from '../upgradeFragmentShaderToGl300';
import { buildPassPrelude } from './buildPassPrelude';
import type { CompiledPass, PassDrawContext } from './executePasses';
import { executePasses } from './executePasses';
import { planPasses } from './planPasses';
import { RenderTargetPool } from './RenderTargetPool';

const FULLSCREEN_VERTICES = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

const FULLSCREEN_VERTEX_SOURCE = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/**
 * Compiles a BlinkEffectIR pass graph into fullscreen-quad meshes and drives
 * the per-frame multipass render loop, ping-ponging persistent targets.
 */
export class BlinkPassRuntime {
  private passes: CompiledPass[] = [];
  private pool: RenderTargetPool | null = null;
  private parity = 0;
  private clearColor = new Color(0, 0, 0, 1);

  public build(
    effect: BlinkEffectIR,
    screen: { width: number; height: number },
    resolvedShaders: Map<string, string>,
    clearColor?: Color,
  ): void {
    this.dispose();
    if (clearColor !== undefined) {
      this.clearColor = clearColor;
    }

    const plan = planPasses(effect);
    this.pool = new RenderTargetPool(plan.renderTargets, screen);

    const preludeSource = buildBlinkPrelude(effect.controls).source;
    // Passes share one shader source, so every pass's material must declare
    // ALL buffer samplers (the union), not just the buffers that pass binds —
    // otherwise the shared shader fails to compile for a pass that references a
    // buffer only in another PASSINDEX/bl_pass branch. This is the single
    // sampler-declaration site for both native and SSF effects.
    const passPrelude = buildPassPrelude(plan.renderTargets.map(rt => rt.name));

    this.passes = plan.passes.map(pass => {
      const shaderSource = resolvedShaders.get(pass.shaderKey);
      if (shaderSource === undefined) {
        throw new Error(`BlinkPassRuntime: no resolved shader for key "${pass.shaderKey}"`);
      }
      const body = stripGlslPreamble(upgradeFragmentShaderToGl300(shaderSource));
      const fragmentSource = `${preludeSource}\n${passPrelude}\n${body}`;
      const material = MeshMaterial.from(FULLSCREEN_VERTEX_SOURCE, fragmentSource, { uniforms: {} });
      const mesh = new Mesh({ vertices: FULLSCREEN_VERTICES, material });
      return {
        name: pass.name,
        mesh,
        material,
        target: pass.target,
        inputs: pass.inputs,
        clear: pass.clear,
        passIndex: pass.passIndex,
      };
    });
  }

  public execute(
    context: PassDrawContext,
    uploadFrameUniforms: (material: MeshMaterial, passIndex: number) => void,
  ): void {
    if (this.pool === null || this.passes.length === 0) {
      return;
    }
    executePasses(context, this.passes, this.pool, this.parity, this.clearColor, uploadFrameUniforms);
    this.parity ^= 1;
  }

  public resize(width: number, height: number): void {
    this.pool?.resize(width, height);
  }

  public dispose(): void {
    for (const pass of this.passes) {
      pass.material.destroy();
    }
    this.passes = [];
    this.pool?.dispose();
    this.pool = null;
    this.parity = 0;
  }
}
```

Create `src/runtime/render/pass/index.ts`:

```ts
export { BlinkPassRuntime } from './BlinkPassRuntime';
export type { CompiledPass, PassDrawContext } from './executePasses';
export { RenderTargetPool } from './RenderTargetPool';
```

- [ ] **Step 2: ts-check the new package compiles**

Run: `npm run ts-check 2>&1 | grep -E "runtime/render/pass" || echo "pass package clean"`
Expected: `pass package clean`.

- [ ] **Step 3: Commit the runtime**

```bash
git add src/runtime/render/pass/BlinkPassRuntime.ts src/runtime/render/pass/index.ts
git commit -m "feat: add BlinkPassRuntime compiling and driving the multipass graph"
```

- [ ] **Step 4: Integrate into `RenderService` — imports and field**

In `src/services/RenderService.ts`, add to the ExoJS import (keep `Mesh`/`MeshMaterial` — still used for the field type via runtime) and add the runtime import after the other `../runtime/render/*` imports:

```ts
import { BlinkPassRuntime } from '../runtime/render/pass';
```

Replace the field declaration (`src/services/RenderService.ts:119`):

```ts
    private sceneMesh: Mesh | null = null;
```

with:

```ts
    private readonly passRuntime = new BlinkPassRuntime();
```

- [ ] **Step 5: Rewrite `updateBlinkFxShader` to build the runtime**

Replace the whole body of `updateBlinkFxShader` (`src/services/RenderService.ts:233-302`) — from `this.blinkFxEffect = effect;` through the SSF-script block — with the version below. It resolves every unique shader key, builds the runtime, and keeps the SSF-script compilation unchanged:

```ts
    public async updateBlinkFxShader(effect: BlinkEffectIR): Promise<void> {
        this.blinkFxEffect = effect;
        this.blinkFxControlValues = buildDefaultUniformValues(effect.controls);

        const resolvedShaders = new Map<string, string>();
        for (const pass of effect.passes) {
            if (resolvedShaders.has(pass.shader)) {
                continue;
            }
            const entry: BlinkShaderEntry | undefined = effect.shaders.glsl?.[pass.shader];
            if (entry === undefined) {
                throw new Error(`BlinkFX effect "${effect.metadata.id}" references missing shader "${pass.shader}"`);
            }
            let source: string;
            if (entry.source !== null) {
                source = entry.source;
            } else if (entry.path !== null) {
                const response = await fetch(entry.path);
                if (!response.ok) {
                    throw new Error(`Failed to fetch shader: ${entry.path} (${response.status})`);
                }
                source = await response.text();
            } else {
                throw new Error('Shader entry has neither source nor path');
            }
            resolvedShaders.set(pass.shader, source);
        }

        this.passRuntime.build(effect, { width: this.screenWidth, height: this.screenHeight }, resolvedShaders);

        if (effect.ssfScriptSource) {
            const { context, getUniforms, setInputs } = compileSynSceneScript(effect.ssfScriptSource);
            this.ssfScriptCtx = context;
            this.ssfScriptGetUniforms = getUniforms;
            this.ssfScriptSetInputs = setInputs;
        } else {
            this.ssfScriptCtx = null;
            this.ssfScriptGetUniforms = null;
            this.ssfScriptSetInputs = null;
        }
    }
```

Remove the now-unused `normalizeBlinkFxSource` method (`src/services/RenderService.ts:229-231`) and the `stripGlslPreamble`/`upgradeFragmentShaderToGl300`/`buildBlinkPrelude` imports if no longer referenced elsewhere in the file (the runtime owns them now). Keep `buildDefaultUniformValues`, `buildBlinkFrameValues`, `buildBlinkAudioValues`.

- [ ] **Step 6: Convert `uploadUniforms` into a per-material uploader and wire `BlinkScene`**

Replace `uploadUniforms` (`src/services/RenderService.ts:403-430`) with a material-parameterised version plus `bl_pass`/`PASSINDEX`:

```ts
    private uploadFrameUniforms(material: MeshMaterial, passIndex: number): void {
        for (const name of this.uniformMap.keys()) {
            material.setUniform(name, this.uniformValues[name] as UniformValue);
        }

        material.setUniform('RENDERSIZE', this.uniformValues.RESOLUTION);
        material.setUniform('bl_pass', passIndex);
        material.setUniform('PASSINDEX', passIndex);

        for (const [name, value] of Object.entries(this.blinkFxFrameValues)) {
            material.setUniform(name, value);
        }

        for (const [name, value] of Object.entries(this.blinkFxAudioValues)) {
            material.setUniform(name, value);
        }

        const textureBindings = this.blinkFxAudioTextures.getUniformBindings();
        for (const [name, value] of Object.entries(textureBindings)) {
            material.setUniform(name, value);
        }
    }
```

In `update` (`src/services/RenderService.ts:337-339`), replace:

```ts
        if (this.sceneMesh !== null && this.sceneMesh.material !== null) {
            this.uploadUniforms();
        }
```

with nothing — uniform upload now happens inside the pass loop, driven by `BlinkScene.draw`. (The `update` method keeps its dirty-flag handling and `this.onUpdate.dispatch(delta)`.)

Rewrite `BlinkScene` (`src/services/RenderService.ts:55-87`) to drive the pass loop via a
callback. It holds no runtime reference — `drawPasses` calls `runtime.execute`, which no-ops
when no effect is built, so no `hasPasses` guard is needed here:

```ts
class BlinkScene extends ExoScene {
    private readonly _overlay: Container;
    private readonly _onUpdate: (deltaSeconds: number) => void;
    private readonly _drawPasses: (context: RenderingContext) => void;

    public constructor(
        overlay: Container,
        onUpdate: (deltaSeconds: number) => void,
        drawPasses: (context: RenderingContext) => void,
    ) {
        super();
        this._overlay = overlay;
        this._onUpdate = onUpdate;
        this._drawPasses = drawPasses;
    }

    public addOverlayChild(child: RenderNode): void {
        this._overlay.addChild(child);
    }

    public override update(delta: Time): void {
        this._onUpdate(delta.seconds);
    }

    public override draw(context: RenderingContext): void {
        this._drawPasses(context);
        context.render(this._overlay, { view: context.screenView });
    }
}
```

Update the `BlinkScene` construction (`src/services/RenderService.ts:213-214`):

```ts
        const overlay = new Container();
        this.exoScene = new BlinkScene(
            overlay,
            this.update.bind(this),
            (context) => this.passRuntime.execute(context, this.uploadFrameUniforms.bind(this)),
        );
```

Delete the module-level `fullscreenQuad` / `fullscreenVertexSource` constants (`src/services/RenderService.ts:89-101`) — the runtime owns them now. Delete the `setMesh` references. Update `resize` (`src/services/RenderService.ts:304-308`) to also forward to the runtime:

```ts
    public resize(newWidth: number, newHeight: number): void {
        this.app.resize(newWidth, newHeight);
        this.passRuntime.resize(this.screenWidth, this.screenHeight);
        this.dirtyFlags.push(UniformFlags.resolution);
    }
```

- [ ] **Step 7: Full static verification**

Run: `npm run ts-check && npm run lint && npm test`
Expected: 0 type errors, lint clean, all tests PASS. Fix any dangling references to `sceneMesh`/`setMesh`/removed imports revealed here.

- [ ] **Step 8: Commit the integration**

```bash
git add src/services/RenderService.ts
git commit -m "refactor: render BlinkFX via BlinkPassRuntime multipass loop"
```

---

### Task 6: `SynSceneLoader` unfolds `PASSES` into multipass IR

**Files:**
- Modify: `src/packages/ssf/SynSceneLoader.ts:97-143` (`parsePasses` → unfold), `:182` (`loadSynScene` call)
- Modify: `src/packages/ssf/ssfPrelude.ts:17-19` (remove hard-coded `feedback`/`helper` samplers)
- Test: `src/packages/ssf/__tests__/SynSceneLoader.test.ts` (add cases)

**Interfaces:**
- Produces: `parsePasses(sceneJson)` emitting `n` render-target passes + one screen pass for `n` SSF `PASSES`, each pass listing all buffers as inputs, one persistent `rgba8` target per buffer.
- Note: buffer `sampler2D` declarations are NOT added here — `BlinkPassRuntime` (Task 5) declares the union of target-name samplers for every effect (native + SSF), the single declaration site. `adaptSsfShader` is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `src/packages/ssf/__tests__/SynSceneLoader.test.ts` (import `parsePasses` — export it from the module in Step 3):

```ts
import { parsePasses } from '../SynSceneLoader';

describe('parsePasses multipass unfolding', () => {
  it('emits n render-target passes plus a screen pass for n SSF passes', () => {
    const { passes, renderTargets } = parsePasses({ PASSES: [{ TARGET: 'feedback' }, { TARGET: 'helper' }] });
    expect(passes.map(p => p.name)).toEqual(['feedback', 'helper', 'present']);
    expect(passes[0].target).toEqual({ kind: 'renderTarget', name: 'feedback' });
    expect(passes[1].target).toEqual({ kind: 'renderTarget', name: 'helper' });
    expect(passes[2].target).toEqual({ kind: 'screen' });
    // every pass lists all buffers as inputs (runtime resolves prev/current per pass)
    expect(passes[0].inputs).toEqual(['feedback', 'helper']);
    expect(renderTargets.map(rt => rt.name)).toEqual(['feedback', 'helper']);
    expect(renderTargets.every(rt => rt.persistent)).toBe(true);
    expect(renderTargets.every(rt => rt.format === 'rgba8')).toBe(true);
  });

  it('emits a single screen pass and no targets for a pass-less scene', () => {
    const { passes, renderTargets } = parsePasses({});
    expect(passes).toHaveLength(1);
    expect(passes[0].target).toEqual({ kind: 'screen' });
    expect(renderTargets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/packages/ssf/__tests__/SynSceneLoader.test.ts`
Expected: FAIL — `parsePasses` not exported / still folds to one screen pass.

- [ ] **Step 3: Rewrite `parsePasses` to unfold**

In `src/packages/ssf/SynSceneLoader.ts`, export and replace `parsePasses` (drop the unused `shaderSrc` param):

```ts
export function parsePasses(
  sceneJson: SynSceneSceneJson,
): { renderTargets: BlinkRenderTargetSpec[]; passes: BlinkPassSpec[] } {
  const ssfPasses = sceneJson.PASSES ?? [];

  if (ssfPasses.length === 0) {
    return {
      renderTargets: [],
      passes: [{ name: 'main', shader: 'main', inputs: [], target: { kind: 'screen' }, clear: true }],
    };
  }

  const bufferNames = ssfPasses.map((sp, i) => sp.TARGET ?? `pass${i}`);

  const renderTargets: BlinkRenderTargetSpec[] = bufferNames.map(name => ({
    name,
    width: null,
    height: null,
    scale: 1,
    format: 'rgba8',
    persistent: true,
  }));

  const passes: BlinkPassSpec[] = bufferNames.map(name => ({
    name,
    shader: 'main',
    inputs: bufferNames,
    target: { kind: 'renderTarget', name },
    clear: false,
  }));

  passes.push({
    name: 'present',
    shader: 'main',
    inputs: bufferNames,
    target: { kind: 'screen' },
    clear: true,
  });

  return { renderTargets, passes };
}
```

In `loadSynScene`, update the call site (it currently passes `adaptedShader` as a second arg):

```ts
  const { renderTargets, passes } = parsePasses(sceneJson);
```

`adaptSsfShader(rawShader)` is unchanged — buffer samplers are declared by the runtime.

- [ ] **Step 4: Remove the hard-coded samplers from the SSF prelude**

In `src/packages/ssf/ssfPrelude.ts`, delete the hard-coded pair (`:17-19`):

```glsl
// Render target texture samplers (from SynScene passes)
uniform sampler2D feedback;
uniform sampler2D helper;
```

`BlinkPassRuntime.build` now declares `uniform sampler2D <name>;` for every render target
(including SSF buffers) via `buildPassPrelude`, so a hard-coded pair here would double-declare.
Keep `uniform int PASSINDEX;` and everything else.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/packages/ssf/__tests__/SynSceneLoader.test.ts`
Expected: PASS (existing cases + the new ones). Fix any existing test that asserted the old single-folded-pass shape by updating it to the unfolded shape.

- [ ] **Step 6: Commit**

```bash
git add src/packages/ssf/SynSceneLoader.ts src/packages/ssf/ssfPrelude.ts src/packages/ssf/__tests__/SynSceneLoader.test.ts
git commit -m "feat: unfold SSF PASSES into real multipass IR (runtime declares buffer samplers)"
```

---

### Task 7: Synthetic native multipass fixture + load→plan test

**Files:**
- Create: `public/effects/multipass_probe.blinkfx/manifest.json`
- Create: `public/effects/multipass_probe.blinkfx/shaders/main.frag.glsl`
- Modify: `public/effects/catalog.json`
- Test: `src/runtime/render/pass/__tests__/loadToPlan.test.ts`

**Interfaces:**
- Consumes: `loadBlinkFx` (`src/packages/blinkfx/loader.ts`), `planPasses` (Task 3).

- [ ] **Step 1: Write the load→plan integration guard test**

This is an integration guard over the existing `loadBlinkFx` + `planPasses` (Task 3) chain, not a
fail-first unit test — it is expected to pass once Task 3 is in. Create
`src/runtime/render/pass/__tests__/loadToPlan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { loadBlinkFx } from '../../../../packages/blinkfx/loader';
import type { BlinkFxManifest } from '../../../../packages/blinkfx/manifest';
import { planPasses } from '../planPasses';

const manifest: BlinkFxManifest = {
  format: 'blinkfx/1',
  id: 'com.test.multipass',
  title: 'Multipass Probe',
  shaders: { glsl: 'shaders/main.frag.glsl' },
  passes: [
    { name: 'write', shader: 'main', target: { name: 'buf', persistent: false }, clear: true },
    { name: 'present', shader: 'main', inputs: ['buf'], target: 'screen', clear: true },
  ],
};

describe('loadBlinkFx → planPasses (multipass)', () => {
  it('produces a transient buffer pass then a screen pass reading it', () => {
    const ir = loadBlinkFx(manifest, 'effects/multipass_probe.blinkfx');
    const plan = planPasses(ir);
    expect(plan.renderTargets.map(rt => rt.name)).toEqual(['buf']);
    expect(plan.renderTargets[0].persistent).toBe(false);
    expect(plan.passes.map(p => p.name)).toEqual(['write', 'present']);
    expect(plan.passes[1].inputs).toEqual([{ uniform: 'buf', source: 'buf', readsPrevFrame: false }]);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/runtime/render/pass/__tests__/loadToPlan.test.ts`
Expected: PASS — it guards that `loadBlinkFx` maps a multipass manifest into an IR whose plan has the transient buffer pass and a screen pass reading it. If it fails, the loader→plan wiring is wrong; fix before proceeding.

- [ ] **Step 3: Create the native fixture package**

Create `public/effects/multipass_probe.blinkfx/shaders/main.frag.glsl` (uses only the native prelude + `bl_pass` + the `buf` sampler):

```glsl
void main(void) {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  if (bl_pass == 0) {
    // Pass 0 → buffer: an audio-reactive vertical gradient.
    fragColor = vec4(uv.x, uv.y, 0.5 + 0.5 * au_level, 1.0);
  } else {
    // Pass 1 → screen: read the buffer back, tint by bass.
    vec4 buffered = texture(buf, uv);
    fragColor = vec4(buffered.rgb * (0.6 + 0.8 * au_bass), 1.0);
  }
}
```

Create `public/effects/multipass_probe.blinkfx/manifest.json`:

```json
{
  "format": "blinkfx/1",
  "id": "com.codexo.multipass_probe",
  "title": "Multipass Probe",
  "description": "Two-pass transient-buffer probe: pass 0 writes a gradient buffer, pass 1 composites it.",
  "shaders": { "glsl": "shaders/main.frag.glsl" },
  "passes": [
    { "name": "write", "shader": "main", "target": { "name": "buf", "persistent": false }, "clear": true },
    { "name": "present", "shader": "main", "inputs": ["buf"], "target": "screen", "clear": true }
  ]
}
```

- [ ] **Step 4: Register it in the catalog**

Modify `public/effects/catalog.json` — add the probe entry (order is UI order; append):

```json
{
  "packages": [
    "/effects/audio_debug.blinkfx/manifest.json",
    "/effects/audio_indicators.blinkfx/manifest.json",
    "/effects/audio_indicators.synScene/",
    "/effects/aurora.blinkfx/manifest.json",
    "/effects/full.blinkfx/manifest.json",
    "/effects/minimal.blinkfx/manifest.json",
    "/effects/multipass_probe.blinkfx/manifest.json"
  ]
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/runtime/render/pass/__tests__/loadToPlan.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/effects/multipass_probe.blinkfx public/effects/catalog.json src/runtime/render/pass/__tests__/loadToPlan.test.ts
git commit -m "feat: add multipass_probe.blinkfx fixture and load-to-plan test"
```

---

### Task 8: Live smoke verification + ABI doc + final green

**Files:**
- Modify: `docs/architecture/2026-05-10-blinkfx-concept/12-blinkfx-v1-contract.md` (document `bl_pass`)
- No production code unless a smoke finding requires a fix (then fix + commit).

- [ ] **Step 1: Document `bl_pass` in the frozen ABI**

In `docs/architecture/2026-05-10-blinkfx-concept/12-blinkfx-v1-contract.md`, under "### Frame uniforms" (after `uniform vec2 bl_resolution;`), add:

```glsl
uniform int   bl_pass;       // 0-based index of the current pass in the effect's pass list
```

Add a sentence under the frame-uniforms block: "`bl_pass` is 0 for single-pass effects; multipass effects branch on it. It is an additive v1 uniform and breaks no existing package."

- [ ] **Step 2: Static green bar**

Run: `npm run ts-check && npm run lint && npm test && npm run build`
Expected: all green, build succeeds.

- [ ] **Step 3: Live smoke (`npm run dev`)**

Run: `npm run dev`. In the browser, with no console errors:
1. `multipass_probe.blinkfx` — renders a gradient composited to screen; reacts to audio (load the probe WAV `http://localhost:5173/probes/ssf_audio_probe_master_v1.wav` as source).
2. `audio_indicators.synScene` — loads and renders; with the probe WAV playing, the feedback trail **persists across frames** (smears/decays rather than resetting each frame). This is the key multipass-feedback proof (broken today under the folded path).
3. `minimal.blinkfx` and `aurora.blinkfx` — still render (single-pass regression check).
4. Resize the window — all still render, no console errors.

- [ ] **Step 4: Fix any smoke findings**

For each issue, fix → re-verify → commit individually (`fix: …`). Likely candidates and their levers:
- Feedback doesn't persist → confirm `renderTo` omits `clear` for non-clearing passes and the pool returns distinct textures per parity (Task 1/4).
- Screen shows black / culled → the screen pass renders with `context.screenView`; confirm `BlinkScene.draw` passes it (Task 5 Step 6).
- SSF buffer sampler "redeclared" compile error → an effect declares the buffer itself; guard the injection in `adaptSsfShader` (skip names already present in `source`).

- [ ] **Step 5: Commit the ABI doc (and any fixes)**

```bash
git add docs/architecture/2026-05-10-blinkfx-concept/12-blinkfx-v1-contract.md
git commit -m "docs: document bl_pass uniform in BlinkFX v1 ABI"
```

- [ ] **Step 6: Final green confirmation**

Run: `npm run ts-check && npm run lint && npm test && npm run build`
Expected: all green.

---

## Notes for the implementer

- The `PassDrawContext` interface (Task 4) is a narrow structural subset of ExoJS `RenderingContext`; the real context satisfies it at the `BlinkScene.draw` call site with no cast. If TypeScript complains about `render`'s optional-options variance, widen `PassDrawContext.render` to `render(node: Mesh, options?: { view?: unknown }): void` (already the case) — do not change the ExoJS type.
- `au_level` / `au_bass` used in the probe shader are guaranteed by the native prelude (`BlinkPrelude.ts`); no manifest controls are needed for the fixture.
- If Task 6/Step 5 in the SSF work surfaces an existing `SynSceneLoader` test asserting the old folded shape, update that expectation to the unfolded shape — it is a deliberate behaviour change, not a regression.
