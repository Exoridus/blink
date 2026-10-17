import { describe, expect, it } from 'vitest';

import type { BlinkControlSpec } from '../../../../runtime/ir/types';
import type { BlinkScriptControlValue } from '../../../../runtime/script/types';
import type { SsfScriptOptions, SsfUniformValue } from '../SsfScriptRuntime';
import { ssfScriptRealmSource, SsfScriptRuntime } from '../SsfScriptRuntime';

const base = { label: null, description: null };
const controls: BlinkControlSpec[] = [
    { ...base, name: 'rate_in', group: 'timing', type: 'float', default: 1, min: 0, max: 4, step: null },
    { ...base, name: 'offset', group: null, type: 'point2d', default: [0, 0], min: [-1, -1], max: [1, 1] },
    { ...base, name: 'gate', group: 'timing', type: 'float', default: 0, min: 0, max: 1, step: 1 },
];

function setup(source: string, extra: Partial<SsfScriptOptions> = {}) {
    const store = new Map<string, BlinkScriptControlValue>([
        ['rate_in', 1],
        ['offset', new Float32Array([0, 0])],
        ['gate', 0],
    ]);
    const logs: string[] = [];
    let clock = 0;
    const runtime = new SsfScriptRuntime({
        source,
        controls,
        surface: {
            get: name => {
                const value = store.get(name);
                if (value === undefined) throw new Error(`unknown ${name}`);
                return value;
            },
            set: (name, value) => {
                store.set(name, value);
            },
        },
        log: message => logs.push(message),
        now: () => clock,
        ...extra,
    });
    const frame = (values: Record<string, SsfUniformValue> = {}, dt = 0.016) =>
        runtime.step({ dt, values: new Map(Object.entries(values)) });
    return { runtime, store, logs, frame, advance: (ms: number) => (clock += ms) };
}

describe('SsfScriptRuntime', () => {
    describe('lifecycle', () => {
        it('evaluates once and keeps top-level state across frames', () => {
            const { runtime, frame } = setup(`
        var total = 0;
        function setup() { uniforms.ready = 1; }
        function update(dt) { total += dt; uniforms.total = total; }
      `);
            runtime.init();
            expect(runtime.uniforms().ready).toBe(1);

            frame({}, 0.5);
            frame({}, 0.25);

            expect(runtime.uniforms().total).toBeCloseTo(0.75);
        });

        it('accepts a script with setup only, or with neither hook', () => {
            const setupOnly = setup('function setup() { setUniform("a", 2); }');
            setupOnly.runtime.init();
            expect(setupOnly.frame().ok).toBe(true);
            expect(setupOnly.runtime.uniforms().a).toBe(2);

            const empty = setup('var x = 1;');
            empty.runtime.init();
            expect(empty.frame().ok).toBe(true);
        });

        it('fails init when setup throws, so a broken script fails the load', () => {
            const { runtime } = setup('function setup() { throw new Error("boom"); }');
            expect(() => runtime.init()).toThrow('boom');
        });

        it('refuses to step before init', () => {
            const { runtime } = setup('');
            expect(() => runtime.step({ dt: 0, values: new Map() })).toThrow(/before init/);
        });
    });

    describe('frame values', () => {
        it('exposes them as bare globals and through the legacy inputs object, which agree', () => {
            const { runtime, frame } = setup(`
        function update(dt) {
          setUniform('direct', syn_BassLevel);
          setUniform('legacy', inputs.syn_BassLevel);
          setUniform('vec', offset[1], offset.x);
        }
      `);
            runtime.init();

            frame({ syn_BassLevel: 0.6, offset: new Float32Array([0.25, 0.5]) });

            expect(runtime.uniforms()).toMatchObject({ direct: 0.6, legacy: 0.6 });
            expect([...(runtime.uniforms().vec as Float32Array)]).toEqual([0.5, 0.25]);
        });

        it('lets a script variable shadow a frame value of the same name', () => {
            const { runtime, frame } = setup(`
        var TIME = 100;
        function update(dt) { setUniform('seen', TIME); }
      `);
            runtime.init();
            frame({ TIME: 3 });
            expect(runtime.uniforms().seen).toBe(100);
        });

        it('keeps the page globals out of reach of a bare identifier', () => {
            const { runtime, frame } = setup(`
        function update(dt) { setUniform('kind', typeof window === 'undefined' ? 0 : 1); }
      `);
            runtime.init();
            frame();
            expect(runtime.uniforms().kind).toBe(0);
        });
    });

    describe('uniform outputs', () => {
        it('supports setUniform arities and the legacy uniforms object', () => {
            const { runtime, frame } = setup(`
        function update(dt) {
          setUniform('f', 1.5);
          setUniform('v2', 1, 2);
          setUniform('v3', [1, 2, 3]);
          uniforms.legacy = 7;
        }
      `);
            runtime.init();
            frame();

            const out = runtime.uniforms();
            expect(out.f).toBe(1.5);
            expect([...(out.v2 as Float32Array)]).toEqual([1, 2]);
            expect([...(out.v3 as Float32Array)]).toEqual([1, 2, 3]);
            expect(out.legacy).toBe(7);
        });

        it('persists a uniform that is not rewritten and shapes values to the declared type', () => {
            const { runtime, frame } = setup(
                `var first = true; function update(dt) { if (first) { setUniform('pos', 1, 2, 3); first = false; } }`,
                { declaredUniforms: { pos: 'vec2' } }
            );
            runtime.init();
            frame();
            frame();

            expect([...(runtime.uniforms().pos as Float32Array)]).toEqual([1, 2]);
        });
    });

    describe('controls', () => {
        it('matches names tolerantly and writes raw values', () => {
            const { runtime, store, frame } = setup(
                `function update(dt) { setControl('rate in', 3); setControl('OFFSET', [0.5, -0.5]); }`
            );
            runtime.init();
            frame();

            expect(store.get('rate_in')).toBe(3);
            expect([...(store.get('offset') as Float32Array)]).toEqual([0.5, -0.5]);
        });

        it('maps a normalized value onto the control range', () => {
            const { runtime, store, frame } = setup(
                `function update(dt) { setControlNormalized('rate_in', 0.5); setControlNormalized('offset', 1, 0); }`
            );
            runtime.init();
            frame();

            expect(store.get('rate_in')).toBe(2);
            expect([...(store.get('offset') as Float32Array)]).toEqual([1, -1]);
        });

        it('randomizes and resets a control and a whole group', () => {
            const { runtime, store, frame } = setup(`
        function update(dt) {
          if (inputs.mode === 1) randomizeGroup('timing');
          if (inputs.mode === 2) defaultGroup('timing');
        }
      `);
            runtime.init();

            frame({ mode: 1 });
            const randomized = store.get('rate_in') as number;
            expect(randomized).toBeGreaterThanOrEqual(0);
            expect(randomized).toBeLessThanOrEqual(4);

            store.set('rate_in', 3);
            store.set('gate', 1);
            frame({ mode: 2 });
            expect(store.get('rate_in')).toBe(1);
            expect(store.get('gate')).toBe(0);
        });

        it('ignores an unknown control with a log line instead of throwing', () => {
            const { runtime, logs, frame } = setup(`function update(dt) { setControl('nothing', 1); }`);
            runtime.init();

            expect(frame().ok).toBe(true);
            expect(logs.join('\n')).toContain('no control named "nothing"');
        });
    });

    describe('events', () => {
        const source = `
      var seen = [];
      onChange('rate_in', function (cur, prev) { seen.push('change:' + prev + '>' + cur); });
      onOffToOn('gate', function () { seen.push('on'); });
      onOnToOff('gate', function () { seen.push('off'); });
      whileOn('gate', function () { seen.push('while-on'); });
      whileOff('gate', function () { seen.push('while-off'); });
      function update(dt) { setUniform('count', seen.length); uniforms.log = 0; }
      function getSeen() { return seen; }
    `;

        it('fires each family on its threshold with the current and previous value', () => {
            const trace: string[] = [];
            const { runtime, frame } = setup(
                source.replace('seen.push(', 'trace.push(').replace(/seen\.push\(/g, 'trace.push(')
            );
            (globalThis as Record<string, unknown>).trace = trace;
            runtime.init();

            frame({ rate_in: 1, gate: 0 });
            frame({ rate_in: 2, gate: 1 });
            frame({ rate_in: 2, gate: 1 });
            frame({ rate_in: 2, gate: 0.2 });
            delete (globalThis as Record<string, unknown>).trace;

            expect(trace).toEqual(['while-off', 'change:1>2', 'on', 'while-on', 'while-on', 'off', 'while-off']);
        });

        it('treats exactly 0.5 as on', () => {
            const seen: string[] = [];
            (globalThis as Record<string, unknown>).seen2 = seen;
            const { runtime, frame } = setup(`onOffToOn('gate', function () { seen2.push('on'); });`);
            runtime.init();
            frame({ gate: 0 });
            frame({ gate: 0.5 });
            delete (globalThis as Record<string, unknown>).seen2;

            expect(seen).toEqual(['on']);
        });
    });

    describe('failures and logging', () => {
        it('keeps running after an update error and disables the script after repeated ones', () => {
            const { runtime, logs, frame } = setup(`function update(dt) { throw new Error('bad frame'); }`);
            runtime.init();

            const results = Array.from({ length: 12 }, () => frame());

            expect(results.every(result => !result.ok)).toBe(true);
            expect(logs.some(line => line.includes('disabled after 10'))).toBe(true);
        });

        it('recovers when a failing frame is followed by good ones', () => {
            const { runtime, frame } = setup(`
        var n = 0;
        function update(dt) { n++; if (n === 1) throw new Error('once'); setUniform('n', n); }
      `);
            runtime.init();

            expect(frame().ok).toBe(false);
            expect(frame().ok).toBe(true);
            expect(runtime.uniforms().n).toBe(2);
        });

        it('rate limits log output', () => {
            const { runtime, logs, frame, advance } = setup(
                `function update(dt) { for (var i = 0; i < 500; i++) print('spam ' + i); }`
            );
            runtime.init();

            frame();
            expect(logs.length).toBeLessThan(60);

            advance(2000);
            frame();
            expect(logs.some(line => line.includes('dropped'))).toBe(true);
        });

        it('forwards console.log and printGlobalKeys', () => {
            const { runtime, logs, frame } = setup(`function update(dt) { console.log('a', 1); printGlobalKeys(); }`);
            runtime.init();
            frame({ syn_Level: 1 });

            expect(logs[0]).toBe('a 1');
            expect(logs[1]).toContain('syn_Level');
        });
    });
});

describe('portable native SSF lifecycle', () => {
    it('publishes startup inputs, clears top-level outputs and primes after setup errors', () => {
        const { runtime, logs } = setup(
            `
      setUniform('discard', 9);
      uniforms.kept = 4;
      function setup() { setUniform('initial', inputs.level); throw new Error('setup error'); }
      function update(dt) { setUniform('dt', dt); }
    `,
            { nativeLifecycle: true }
        );
        runtime.init(new Map([['level', 0.25]]));
        expect(runtime.uniforms()).toMatchObject({ initial: 0.25, kept: 4, dt: Math.fround(0.017) });
        expect(runtime.uniforms().discard).toBeUndefined();
        expect(logs.join(' ')).toContain('setup error');
    });

    it('requires update and aborts on the first update error', () => {
        const missing = setup('function setup() {}', { nativeLifecycle: true });
        missing.runtime.init();
        expect(missing.frame().ok).toBe(false);
        const active = setup(`var n = 0; function update() { if (++n > 1) throw new Error('stop'); }`, {
            nativeLifecycle: true,
        });
        active.runtime.init();
        expect(active.frame().ok).toBe(false);
        expect(active.frame().ok).toBe(false);
        expect(active.logs.join(' ')).toContain('Aborting script');
    });

    it('resolves named callbacks dynamically, uses native thresholds and removes only failing handlers', () => {
        const { runtime, frame, logs } = setup(
            `
      var changes = 0; var edges = 0; var runs = 0;
      function changed(v, p) { changes++; }
      function edge() { edges++; }
      function broken() { throw new Error('event error'); }
      onChange('gate', 'changed'); onChange('gate', 'broken'); onChange('gate', 'missing');
      onOffToOn('gate', 'edge'); whileOn('gate', function() { edges += 100; });
      function update() { runs++; setUniform('changes', changes); setUniform('edges', edges); setUniform('runs', runs); }
    `,
            { nativeLifecycle: true }
        );
        runtime.init(new Map([['gate', 0]]));
        expect(frame({ gate: 0.0005 }).ok).toBe(true);
        expect(frame({ gate: 0.001 }).ok).toBe(true);
        expect(runtime.uniforms().changes).toBe(0);
        expect(frame({ gate: 0.5 }).ok).toBe(true);
        expect(runtime.uniforms().edges).toBe(0);
        expect(frame({ gate: 0.6 }).ok).toBe(true);
        expect(runtime.uniforms()).toMatchObject({ changes: 2, edges: 1, runs: 5 });
        expect(logs.filter(line => line.includes('event error'))).toHaveLength(1);
    });

    it('publishes and dispatches inputs individually and replaces callback functions', () => {
        const { runtime, frame } = setup(
            `
      var seen = 0; var runs = 0;
      function changed() { seen = inputs.second; }
      onChange('first', 'changed');
      function update() { setUniform('seen', seen); if (++runs === 2) changed = function() { seen = 7; }; }
    `,
            { nativeLifecycle: true }
        );
        runtime.init(new Map([['second', 3]]));
        frame({ first: 1, second: 4 });
        expect(runtime.uniforms().seen).toBe(3);
        frame({ first: 2 });
        expect(runtime.uniforms().seen).toBe(7);
    });

    it('forwards float32 readback coordinates and rejects a missing callback', () => {
        const coords: number[] = [];
        const good = setup(`function update() { setUniform('rgb', textureFinalPass(0.1, -3)); }`, {
            nativeLifecycle: true,
            readFinalPass: (x, y) => {
                coords.push(x, y);
                return [0.25, 0.5, 1];
            },
        });
        good.runtime.init();
        expect(coords).toEqual([Math.fround(0.1), -3]);
        expect([...(good.runtime.uniforms().rgb as Float32Array)]).toEqual([0.25, 0.5, 1]);
        const missing = setup(`function update() { textureFinalPass(0, 0); }`, { nativeLifecycle: true });
        missing.runtime.init();
        expect(missing.logs.join(' ')).toContain('textureFinalPass callback not set');
        expect(missing.frame().ok).toBe(false);
    });
});

describe('native event exceptional values', () => {
    it('fires change on NaN but neither ordered while event at NaN or 0.5', () => {
        const { runtime, frame } = setup(
            `
      var count = 0; var ordered = 0;
      function change() { count++; }
      function whileEvent() { ordered++; }
      onChange('gate', 'change'); whileOn('gate', 'whileEvent'); whileOff('gate', 'whileEvent');
      function update() { setUniform('count', count); setUniform('ordered', ordered); }
    `,
            { nativeLifecycle: true }
        );
        runtime.init(new Map([['gate', 0.5]]));
        expect(runtime.uniforms()).toMatchObject({ count: 1, ordered: 0 });
        frame({ gate: NaN });
        expect(runtime.uniforms()).toMatchObject({ count: 2, ordered: 0 });
        frame({ gate: 0.5 });
        expect(runtime.uniforms()).toMatchObject({ count: 3, ordered: 0 });
    });
});

describe('portable native uniform conversion', () => {
    it('converts only number-tagged separate components and truncates at the first NaN', () => {
        const { runtime } = setup(
            `function update() {
      setUniform('rounding', 0.1); setUniform('negativeZero', -0);
      setUniform('overflow', 1e40); setUniform('underflow', 1e-46);
      setUniform('prefix', 1, NaN, 3); setUniform('four', 1, 2, 3, 4, 5);
      setUniform('string', '0.5'); setUniform('bool', true); setUniform('null', null);
    }`,
            { nativeLifecycle: true }
        );
        runtime.init();
        expect(runtime.uniforms()).toMatchObject({
            rounding: Math.fround(0.1),
            overflow: Infinity,
            underflow: 0,
            prefix: 1,
        });
        expect(Object.is(runtime.uniforms().negativeZero, -0)).toBe(true);
        expect([...(runtime.uniforms().four as Float32Array)]).toEqual([1, 2, 3, 4]);
        expect(runtime.uniforms().string).toBeUndefined();
        expect(runtime.uniforms().bool).toBeUndefined();
        expect(runtime.uniforms().null).toBeUndefined();
    });

    it('coerces arrays and coordinate/color objects while retaining remaining padded numeric arguments', () => {
        const { runtime } = setup(
            `function update() {
      setUniform('array', ['2', true, null]); setUniform('extra', [5], 2, 3);
      setUniform('mixed', { x: '2', r: 8, g: 3, b: null });
      setUniform('invalid', { y: 4 }); setUniform('empty', []);
    }`,
            { nativeLifecycle: true }
        );
        runtime.init();
        expect([...(runtime.uniforms().array as Float32Array)]).toEqual([2, 1, 0]);
        expect([...(runtime.uniforms().extra as Float32Array)]).toEqual([5, 2, 3]);
        expect([...(runtime.uniforms().mixed as Float32Array)]).toEqual([2, 3, 0]);
        expect(runtime.uniforms().invalid).toBeUndefined();
        expect(runtime.uniforms().empty).toBeUndefined();
    });

    it('preserves previous output on invalid calls and returns the last fixed-arity argument', () => {
        const { runtime } = setup(
            `function update() {
      setUniform('old', 3); var result = setUniform('old', NaN, 2, 3, 9, 10); setUniform('returned', result);
    }`,
            { nativeLifecycle: true }
        );
        runtime.init();
        expect(runtime.uniforms()).toMatchObject({ old: 3, returned: 9 });
    });

    it('throws RangeError for an overlong array and aborts native update', () => {
        const { runtime, logs, frame } = setup(
            `function update() {
      try { setUniform('long', [1,2,3,4,5]); } catch (e) { setUniform('range', e instanceof RangeError ? 1 : 0); throw e; }
    }`,
            { nativeLifecycle: true }
        );
        runtime.init();
        expect(runtime.uniforms().range).toBe(1);
        expect(logs.join(' ')).toContain('invalid vector subscript');
        expect(frame().ok).toBe(false);
    });

    it('flushes legacy arrays as zero, objects as vectors, other primitives as NaN and preserves deleted output', () => {
        const { runtime, frame } = setup(
            `var n = 0; function update() {
      if (++n === 1) {
        uniforms.arr = [1,2]; uniforms.obj = { r: '0.1', y: 2 }; uniforms.str = '3'; uniforms.bool = true;
        uniforms.deleted = 7; setUniform('arr', 8);
      } else { delete uniforms.deleted; }
    }`,
            { nativeLifecycle: true }
        );
        runtime.init();
        expect(runtime.uniforms().arr).toBe(0);
        expect([...(runtime.uniforms().obj as Float32Array)]).toEqual([Math.fround(0.1), 2]);
        expect(Number.isNaN(runtime.uniforms().str)).toBe(true);
        expect(Number.isNaN(runtime.uniforms().bool)).toBe(true);
        frame();
        expect(runtime.uniforms().deleted).toBe(7);
    });

    it('retains native outputs after replacing the legacy uniforms object', () => {
        const { runtime, frame } = setup(
            `var n = 0; function update() {
      if (++n === 1) uniforms.keep = 5;
      else uniforms = { fresh: 0.1 };
    }`,
            { nativeLifecycle: true }
        );
        runtime.init();
        frame();
        expect(runtime.uniforms()).toMatchObject({ keep: 5, fresh: Math.fround(0.1) });
    });

    it('publishes vectors as objects and overwrites declared mutable globals on each publication', () => {
        const { runtime, frame } = setup(
            `var level = 99; function update() {
      setUniform('levelSeen', level); setUniform('vectorIsArray', Array.isArray(inputs.offset) ? 1 : 0);
      setUniform('x', offset.x); level = 9; inputs.level = 9;
    }`,
            { nativeLifecycle: true }
        );
        runtime.init(
            new Map<string, SsfUniformValue>([
                ['level', 0.1],
                ['offset', new Float32Array([0.25, 0.5])],
            ])
        );
        expect(runtime.uniforms()).toMatchObject({ levelSeen: Math.fround(0.1), vectorIsArray: 0, x: 0.25 });
        frame({ level: 0.2 });
        expect(runtime.uniforms().levelSeen).toBe(Math.fround(0.2));
    });
});

describe('standalone SSF script realm', () => {
    it('recreates native priming, named events and outputs without module closures', () => {
        const source = `
      var changes = 0;
      function changed(v, p) { changes++; setUniform('event', v, p); }
      onChange('level', 'changed');
      function update(dt) { setUniform('dt', dt); setUniform('changes', changes); setUniform('level', inputs.level); }
    `;

        const realmRuntimeClass = new Function(
            `${ssfScriptRealmSource()}; return SsfScriptRuntime;`
        )() as typeof SsfScriptRuntime;
        const regular = setup(source, { nativeLifecycle: true });
        const realm = new realmRuntimeClass({
            source,
            nativeLifecycle: true,
            controls: [],
            surface: { get: () => 0, set: () => undefined },
            log: () => undefined,
        });
        const initial = new Map<string, SsfUniformValue>([['level', 0.25]]);
        regular.runtime.init(initial);
        realm.init(initial);
        expect(realm.uniforms()).toEqual(regular.runtime.uniforms());
        const frame = { dt: 0.02, values: new Map<string, SsfUniformValue>([['level', 0.75]]) };
        expect(realm.step(frame)).toEqual(regular.runtime.step(frame));
        expect(realm.uniforms()).toEqual(regular.runtime.uniforms());
        expect(realm.uniforms()).toMatchObject({ changes: 2, level: 0.75 });
    });
});

describe('native script output ownership', () => {
    it('preserves object state and prototype methods when shaped script uniforms return in a frame', () => {
        const { runtime, frame } = setup(
            `
      function Camera() { this.x = 1; this.y = 2; this.z = 3; }
      Camera.prototype.tick = function() { this.x++; };
      var camera = new Camera();
      uniforms.camera = camera;
      function update() {
        camera.tick();
        setUniform('seenLevel', inputs.level);
        setUniform('outputRepublished', typeof inputs.camera === 'undefined' ? 0 : 1);
      }
    `,
            { nativeLifecycle: true, declaredUniforms: { camera: 'vec3' } }
        );
        runtime.init(new Map([['level', 0.25]]));
        expect([...(runtime.uniforms().camera as Float32Array)]).toEqual([2, 2, 3]);
        const result = frame({ camera: new Float32Array([99, 98, 97]), level: 0.5 });
        expect(result).toEqual({ ok: true, error: null });
        expect([...(runtime.uniforms().camera as Float32Array)]).toEqual([3, 2, 3]);
        expect(runtime.uniforms()).toMatchObject({ seenLevel: 0.5, outputRepublished: 0 });
    });

    it('preserves legacy uniform objects that have no shader declaration or vector components', () => {
        const { runtime, frame } = setup(
            `
      function Freezes() { this.hits = []; }
      Freezes.prototype.addHit = function() { this.hits.push(1); };
      var freezes = new Freezes();
      uniforms.freezes = freezes;
      function update() { freezes.addHit(); setUniform('hitCount', freezes.hits.length); }
    `,
            { nativeLifecycle: true }
        );
        runtime.init();
        expect(runtime.uniforms().hitCount).toBe(1);
        expect(frame({ freezes: NaN })).toEqual({ ok: true, error: null });
        expect(runtime.uniforms().hitCount).toBe(2);
    });

    it('retains the failed priming update cause on every disabled frame', () => {
        const { runtime, frame } = setup(`function update() { throw new Error('missing startup pointer'); }`, {
            nativeLifecycle: true,
        });
        runtime.init();
        const first = frame();
        const later = frame();
        expect(first.ok).toBe(false);
        expect(first.error).toBeInstanceOf(Error);
        expect((first.error as Error).message).toBe('missing startup pointer');
        expect(later.error).toBe(first.error);
    });
});
