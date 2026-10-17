import { describe, expect, it } from 'vitest';

import type { BlinkControlSpec } from '../../../../runtime/ir/types';
import type { BlinkScriptControlValue } from '../../../../runtime/script/types';
import type { SsfUniformValue } from '../SsfScriptRuntime';
import { SsfScriptRuntime } from '../SsfScriptRuntime';

const controls: BlinkControlSpec[] = [
    {
        name: 'amount',
        type: 'float',
        label: null,
        description: null,
        group: 'Main Group',
        default: 2,
        min: 0,
        max: 4,
        step: null,
    },
    {
        name: 'point',
        type: 'point2d',
        label: null,
        description: null,
        group: 'Main Group',
        default: [-0.5, 12],
        min: [-2, 10],
        max: [2, 20],
    },
];

function host(source: string): {
    runtime: SsfScriptRuntime;
    store: Map<string, BlinkScriptControlValue>;
    logs: string[];
} {
    const store = new Map<string, BlinkScriptControlValue>([
        ['amount', 2],
        ['point', new Float32Array([-0.5, 12])],
    ]);
    const logs: string[] = [];
    const runtime = new SsfScriptRuntime({
        source,
        nativeLifecycle: true,
        controls,
        surface: {
            get: (name): BlinkScriptControlValue => store.get(name)!,
            set: (name, value): void => {
                store.set(name, value);
            },
        },
        log: (message): void => {
            logs.push(message);
        },
        now: (): number => 0,
    });
    return { runtime, store, logs };
}

describe('official SSF script API coverage', () => {
    it('writes one raw control dimension without replacing the other', () => {
        const { runtime, store } = host(
            'function update() { setControl("point", 0.75, {dimension: 1, bank: "scene"}); }'
        );
        try {
            runtime.init();
            expect([...(store.get('point') as Float32Array)]).toEqual([-0.5, 0.75]);
        } finally {
            runtime.dispose();
        }
    });

    it('normalizes against the selected dimension range', () => {
        const { runtime, store } = host('function update() { setControlNormalized("point", [0.25], {dimension: 1}); }');
        try {
            runtime.init();
            expect([...(store.get('point') as Float32Array)]).toEqual([-0.5, 12.5]);
        } finally {
            runtime.dispose();
        }
    });

    it('refuses an unavailable bank without mutating a scene control', () => {
        const { runtime, store, logs } = host('function update() { setControl("amount", 4, {bank: "meta"}); }');
        try {
            runtime.init();
            expect(store.get('amount')).toBe(2);
            expect(logs.join(' ')).toContain('control bank "meta" is unavailable');
        } finally {
            runtime.dispose();
        }
    });

    it('lists available script, API and input keys', () => {
        const { runtime, logs } = host(
            'var position = 0; function helper() {} function update() { printGlobalKeys(); }'
        );
        try {
            runtime.init(new Map([['syn_Level', 0.2]]));
            const keys = logs.join(' ').split(/[, :]+/);
            expect(keys).toEqual(
                expect.arrayContaining([
                    'position',
                    'helper',
                    'update',
                    'setUniform',
                    'setControl',
                    'syn_Level',
                    'printGlobalKeys',
                ])
            );
        } finally {
            runtime.dispose();
        }
    });

    it('forwards print from native update to the host log', () => {
        const { runtime, logs } = host('function update() { print("value", 0.25); }');
        try {
            runtime.init();
            expect(logs).toEqual(['value 0.25']);
        } finally {
            runtime.dispose();
        }
    });

    it.each([
        ['onChange', 2, 0, 1],
        ['onOffToOn', 1, 1, 0],
        ['onOnToOff', 1, 0, 1],
        ['whileOn', 1, 1, 0],
        ['whileOff', 1, 0, 1],
    ])('calls %s through the existing native named-handler contract', (api, count, current, previous) => {
        const { runtime } = host(`var calls = 0; var current = -1; var previous = -1;
      function callback(v, p) { calls++; current = v; previous = p; }
      function setup() { ${api}('G-A T_E', 'callback'); }
      function update() { setUniform('calls', calls); setUniform('values', current, previous); }`);
        try {
            runtime.init(new Map([['gate', 0]]));
            expect(runtime.step({ dt: 0.016, values: new Map([['gate', 1]]) }).ok).toBe(true);
            expect(runtime.step({ dt: 0.016, values: new Map([['gate', 0]]) }).ok).toBe(true);
            expect(runtime.uniforms().calls).toBe(count);
            expect([...(runtime.uniforms().values as Float32Array)]).toEqual([current, previous]);
        } finally {
            runtime.dispose();
        }
    });

    it('keeps all three injected mouse button components visible', () => {
        const { runtime } = host(
            'function update() { setUniform("buttons", _click); setUniform("mouse", inputs._mouse); }'
        );
        const values = new Map<string, SsfUniformValue>([
            ['_click', new Float32Array([1, 0.5, 0.25])],
            ['_mouse', new Float32Array([2, 3, 4, 5])],
        ]);
        try {
            runtime.init(values);
            expect([...(runtime.uniforms().buttons as Float32Array)]).toEqual([1, 0.5, 0.25]);
            expect([...(runtime.uniforms().mouse as Float32Array)]).toEqual([2, 3, 4, 5]);
        } finally {
            runtime.dispose();
        }
    });

    it('randomizes and restores a single control through native callable APIs', () => {
        const { runtime, store } = host(
            'function update() { if (mode === 1) randomizeControl("A M O U N T"); if (mode === 2) defaultControl("amount"); }'
        );
        try {
            runtime.init(new Map([['mode', 1]]));
            expect(store.get('amount')).toBeGreaterThanOrEqual(0);
            expect(store.get('amount')).toBeLessThanOrEqual(4);
            expect(runtime.step({ dt: 0.016, values: new Map([['mode', 2]]) }).ok).toBe(true);
            expect(store.get('amount')).toBe(2);
        } finally {
            runtime.dispose();
        }
    });

    it('randomizes and restores a group through native callable APIs', () => {
        const { runtime, store } = host(
            'function update() { if (mode === 1) randomizeGroup("MAIN GROUP"); if (mode === 2) defaultGroup("main group"); }'
        );
        try {
            runtime.init(new Map([['mode', 1]]));
            const point = [...(store.get('point') as Float32Array)];
            expect(point[0]).toBeGreaterThanOrEqual(-2);
            expect(point[0]).toBeLessThanOrEqual(2);
            expect(point[1]).toBeGreaterThanOrEqual(10);
            expect(point[1]).toBeLessThanOrEqual(20);
            expect(runtime.step({ dt: 0.016, values: new Map([['mode', 2]]) }).ok).toBe(true);
            expect([...(store.get('point') as Float32Array)]).toEqual([-0.5, 12]);
            expect(store.get('amount')).toBe(2);
        } finally {
            runtime.dispose();
        }
    });
});
