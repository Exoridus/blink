// @vitest-environment jsdom
import { BrowserPlatform } from '@codexo/exojs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CappedBrowserPlatform } from '../CappedBrowserPlatform';

afterEach(() => vi.restoreAllMocks());

describe('capped complete browser frames', () => {
    it('retains the cadence remainder at a non-divisible display refresh rate', () => {
        let pending: ((time: number) => void) | null = null;
        vi.spyOn(BrowserPlatform.prototype, 'requestFrame').mockImplementation(callback => {
            pending = callback;
            return 1;
        });
        vi.spyOn(BrowserPlatform.prototype, 'cancelFrame').mockImplementation(() => undefined);
        const platform = new CappedBrowserPlatform(document.createElement('canvas'));
        platform.fpsCap = 144;
        let frames = 0;
        const next = (): void => {
            frames++;
            platform.requestFrame(next);
        };
        platform.requestFrame(next);
        for (let tick = 0; tick < 165; tick++) {
            const callback = pending as ((time: number) => void) | null;
            callback?.((tick * 1000) / 165);
        }
        expect(frames).toBeGreaterThanOrEqual(143);
        expect(frames).toBeLessThanOrEqual(145);
        platform.destroy();
    });

    it('filters RAF callbacks and cancels the currently rescheduled handle', () => {
        const queue = new Map<number, (time: number) => void>();
        let sequence = 0;
        vi.spyOn(BrowserPlatform.prototype, 'requestFrame').mockImplementation(callback => {
            queue.set(++sequence, callback);
            return sequence;
        });
        const cancel = vi.spyOn(BrowserPlatform.prototype, 'cancelFrame').mockImplementation(handle => {
            queue.delete(handle);
        });
        const platform = new CappedBrowserPlatform(document.createElement('canvas'));
        platform.fpsCap = 60;
        const callback = vi.fn();
        platform.requestFrame(callback);
        queue.get(1)!(0);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(0);
        const handle = platform.requestFrame(callback);
        queue.get(2)!(5);
        expect(callback).toHaveBeenCalledTimes(1);
        queue.get(3)!(16.667);
        expect(callback).toHaveBeenCalledTimes(2);
        const pending = platform.requestFrame(callback);
        queue.get(4)!(20);
        platform.cancelFrame(pending);
        expect(cancel).toHaveBeenCalledWith(5);
        queue.get(5)?.(40);
        expect(callback).toHaveBeenCalledTimes(2);
        platform.cancelFrame(handle);
        platform.destroy();
    });
});
