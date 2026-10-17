import { describe, expect, it, vi } from 'vitest';

import { silentBlinkAudioFrame } from '../../audio/BlinkAudioFrame';
import type { BlinkScriptEventBinding } from '../../ir/types';
import { BlinkScriptRuntime } from '../BlinkScriptRuntime';
import type { BlinkScriptControlValue, BlinkScriptModule, ScriptControlSurface, ScriptFrameInput } from '../types';

function createControls(initial: Record<string, BlinkScriptControlValue> = {}): ScriptControlSurface {
    const values: Record<string, BlinkScriptControlValue> = { ...initial };
    return {
        get(name): BlinkScriptControlValue {
            const value = values[name];
            if (value === undefined) {
                throw new Error(`unknown control "${name}"`);
            }
            return value;
        },
        set(name, value): void {
            values[name] = value;
        },
    };
}

function frame(overrides: Partial<ScriptFrameInput> = {}): ScriptFrameInput {
    return {
        dt: 1 / 60,
        elapsed: 0,
        frame: 0,
        audio: silentBlinkAudioFrame(),
        ...overrides,
    };
}

describe('BlinkScriptRuntime', () => {
    it('runs setup exactly once, at init', async () => {
        const setup = vi.fn();
        const runtime = new BlinkScriptRuntime({
            abi: 'blink/1',
            events: [],
            module: (): BlinkScriptModule => ({ setup }),
        });
        const controls = createControls();

        await runtime.init({ controls, audio: silentBlinkAudioFrame() });
        await runtime.runFrame(frame());
        await runtime.runFrame(frame({ frame: 1 }));

        expect(setup).toHaveBeenCalledTimes(1);
    });

    it('awaits an async setup before init resolves', async () => {
        let resolved = false;
        const module: BlinkScriptModule = {
            setup: async () => {
                await Promise.resolve();
                resolved = true;
            },
        };
        const runtime = new BlinkScriptRuntime({ abi: 'blink/1', events: [], module: (): BlinkScriptModule => module });

        await runtime.init({ controls: createControls(), audio: silentBlinkAudioFrame() });

        expect(resolved).toBe(true);
    });

    it('runs update once per frame with the frame delta, and lets it write a control', async () => {
        const update = vi.fn((ctx: Parameters<NonNullable<BlinkScriptModule['update']>>[0], dt: number) => {
            ctx.controls.set('seed', dt);
        });
        const runtime = new BlinkScriptRuntime({
            abi: 'blink/1',
            events: [],
            module: (): BlinkScriptModule => ({ update }),
        });
        const controls = createControls({ seed: 0 });

        await runtime.init({ controls, audio: silentBlinkAudioFrame() });
        await runtime.runFrame(frame({ dt: 0.5 }));

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toBe(0.5);
        expect(controls.get('seed')).toBe(0.5);
    });

    it('runs dispose exactly once, at teardown', async () => {
        const dispose = vi.fn();
        const runtime = new BlinkScriptRuntime({
            abi: 'blink/1',
            events: [],
            module: (): BlinkScriptModule => ({ dispose }),
        });

        await runtime.init({ controls: createControls(), audio: silentBlinkAudioFrame() });
        await runtime.runFrame(frame());
        await runtime.dispose();

        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('rejects init for an unrecognized ABI before the module factory ever runs', async () => {
        const moduleFactory = vi.fn(() => ({}));
        const runtime = new BlinkScriptRuntime({ abi: 'ssf/1', events: [], module: moduleFactory });

        await expect(runtime.init({ controls: createControls(), audio: silentBlinkAudioFrame() })).rejects.toThrow(
            /ssf\/1/
        );
        expect(moduleFactory).not.toHaveBeenCalled();
    });

    it('rejects init when setup throws, and the runtime never becomes usable', async () => {
        const runtime = new BlinkScriptRuntime({
            abi: 'blink/1',
            events: [],
            module: (): BlinkScriptModule => ({
                setup: (): void => {
                    throw new Error('boom');
                },
            }),
        });

        await expect(runtime.init({ controls: createControls(), audio: silentBlinkAudioFrame() })).rejects.toThrow(
            'boom'
        );
        await expect(runtime.runFrame(frame())).rejects.toThrow();
    });

    it('reports a throwing update on the frame result instead of rejecting, and keeps running later frames', async () => {
        let calls = 0;
        const update = vi.fn(() => {
            calls += 1;
            if (calls === 1) {
                throw new Error('bad frame');
            }
        });
        const runtime = new BlinkScriptRuntime({
            abi: 'blink/1',
            events: [],
            module: (): BlinkScriptModule => ({ update }),
        });
        await runtime.init({ controls: createControls(), audio: silentBlinkAudioFrame() });

        const first = await runtime.runFrame(frame());
        const second = await runtime.runFrame(frame({ frame: 1 }));

        expect(first.ok).toBe(false);
        expect(first.error).toBeInstanceOf(Error);
        expect(second.ok).toBe(true);
        expect(update).toHaveBeenCalledTimes(2);
    });

    describe('event bindings', () => {
        function bindingFor(on: BlinkScriptEventBinding['on'], handler: string): BlinkScriptEventBinding {
            return { input: 'gate', on, handler };
        }

        it('change: fires the handler when the input differs from the previous frame', async () => {
            const onChange = vi.fn();
            const runtime = new BlinkScriptRuntime({
                abi: 'blink/1',
                events: [bindingFor('change', 'onChange')],
                module: (): BlinkScriptModule => ({ onChange }),
            });
            const controls = createControls({ gate: 0 });
            await runtime.init({ controls, audio: silentBlinkAudioFrame() });

            await runtime.runFrame(frame());
            expect(onChange).not.toHaveBeenCalled();

            controls.set('gate', 1);
            await runtime.runFrame(frame({ frame: 1 }));
            expect(onChange).toHaveBeenCalledTimes(1);
            expect(onChange.mock.calls[0][1]).toBe(1);
            expect(onChange.mock.calls[0][2]).toBe(0);

            await runtime.runFrame(frame({ frame: 2 }));
            expect(onChange).toHaveBeenCalledTimes(1);
        });

        it('offToOn: fires only on the rising edge', async () => {
            const onRise = vi.fn();
            const runtime = new BlinkScriptRuntime({
                abi: 'blink/1',
                events: [bindingFor('offToOn', 'onRise')],
                module: (): BlinkScriptModule => ({ onRise }),
            });
            const controls = createControls({ gate: 0 });
            await runtime.init({ controls, audio: silentBlinkAudioFrame() });

            controls.set('gate', 1);
            await runtime.runFrame(frame());
            expect(onRise).toHaveBeenCalledTimes(1);

            await runtime.runFrame(frame({ frame: 1 }));
            expect(onRise).toHaveBeenCalledTimes(1);

            controls.set('gate', 0);
            await runtime.runFrame(frame({ frame: 2 }));
            expect(onRise).toHaveBeenCalledTimes(1);
        });

        it('onToOff: fires only on the falling edge', async () => {
            const onFall = vi.fn();
            const runtime = new BlinkScriptRuntime({
                abi: 'blink/1',
                events: [bindingFor('onToOff', 'onFall')],
                module: (): BlinkScriptModule => ({ onFall }),
            });
            const controls = createControls({ gate: 1 });
            await runtime.init({ controls, audio: silentBlinkAudioFrame() });

            controls.set('gate', 0);
            await runtime.runFrame(frame());
            expect(onFall).toHaveBeenCalledTimes(1);

            await runtime.runFrame(frame({ frame: 1 }));
            expect(onFall).toHaveBeenCalledTimes(1);
        });

        it('whileOn: fires every frame the input is on', async () => {
            const onHeld = vi.fn();
            const runtime = new BlinkScriptRuntime({
                abi: 'blink/1',
                events: [bindingFor('whileOn', 'onHeld')],
                module: (): BlinkScriptModule => ({ onHeld }),
            });
            const controls = createControls({ gate: 1 });
            await runtime.init({ controls, audio: silentBlinkAudioFrame() });

            await runtime.runFrame(frame());
            await runtime.runFrame(frame({ frame: 1 }));
            expect(onHeld).toHaveBeenCalledTimes(2);

            controls.set('gate', 0);
            await runtime.runFrame(frame({ frame: 2 }));
            expect(onHeld).toHaveBeenCalledTimes(2);
        });

        it('whileOff: fires every frame the input is off', async () => {
            const onIdle = vi.fn();
            const runtime = new BlinkScriptRuntime({
                abi: 'blink/1',
                events: [bindingFor('whileOff', 'onIdle')],
                module: (): BlinkScriptModule => ({ onIdle }),
            });
            const controls = createControls({ gate: 0 });
            await runtime.init({ controls, audio: silentBlinkAudioFrame() });

            await runtime.runFrame(frame());
            await runtime.runFrame(frame({ frame: 1 }));
            expect(onIdle).toHaveBeenCalledTimes(2);

            controls.set('gate', 1);
            await runtime.runFrame(frame({ frame: 2 }));
            expect(onIdle).toHaveBeenCalledTimes(2);
        });

        it('reports a missing handler export as a frame failure rather than throwing past the runtime', async () => {
            const runtime = new BlinkScriptRuntime({
                abi: 'blink/1',
                events: [bindingFor('whileOn', 'missingHandler')],
                module: (): BlinkScriptModule => ({}),
            });
            const controls = createControls({ gate: 1 });
            await runtime.init({ controls, audio: silentBlinkAudioFrame() });

            const result = await runtime.runFrame(frame());

            expect(result.ok).toBe(false);
            expect(result.error).toBeInstanceOf(Error);
        });
    });
});
