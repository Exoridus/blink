import { describe, expect, it } from 'vitest';

import { silentBlinkAudioFrame } from '../../audio/BlinkAudioFrame';
import { BlinkScriptRuntime } from '../BlinkScriptRuntime';
import type { BlinkScriptContext, BlinkScriptModule, ScriptControlSurface } from '../types';

describe('native script frame control context', () => {
    it('retains a supplied transient control snapshot across event and update awaits', async () => {
        let live = 0;
        const controls: ScriptControlSurface = {
            get: () => live,
            set: (_name, value) => {
                live = value as number;
            },
        };
        const snapshots: number[] = [];
        const runtime = new BlinkScriptRuntime({
            abi: 'blink/1',
            events: [{ input: 'trigger', on: 'offToOn', handler: 'hit' }],
            module: (): BlinkScriptModule => ({
                hit: async (ctx: BlinkScriptContext, value: number): Promise<void> => {
                    await Promise.resolve();
                    snapshots.push(value, ctx.controls.get('trigger') as number);
                },
                update: async (ctx: BlinkScriptContext): Promise<void> => {
                    await Promise.resolve();
                    snapshots.push(ctx.controls.get('trigger') as number);
                },
            }),
        });
        await runtime.init({ controls, audio: silentBlinkAudioFrame() });
        const result = runtime.runFrame({
            frame: 1,
            elapsed: 1 / 60,
            dt: 1 / 60,
            audio: silentBlinkAudioFrame(),
            controls: { get: () => 1, set: (name, value) => controls.set(name, value) },
        });
        live = 0;
        expect((await result).ok).toBe(true);
        expect(snapshots).toEqual([1, 1, 1]);
        await runtime.dispose();
    });
});
