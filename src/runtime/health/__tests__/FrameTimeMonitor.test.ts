import { describe, expect, it } from 'vitest';

import { type FrameBudget, FrameTimeMonitor } from '../FrameTimeMonitor';

const BUDGET: FrameBudget = { frame: 10, stages: { update: 2, script: 3, passes: 5, audioOutput: 1 }, gpu: 8 };

/** A clock the test advances by hand, so a stage's measured time is exactly what the test says. */
function clock(): { now: () => number; advance: (ms: number) => void } {
    let time = 0;
    return {
        now: (): number => time,
        advance: (ms: number): void => {
            time += ms;
        },
    };
}

describe('FrameTimeMonitor', () => {
    it('charges a stage the time its work took', () => {
        const { now, advance } = clock();
        const monitor = new FrameTimeMonitor({ now, budget: BUDGET });

        monitor.measure('passes', () => advance(4));
        monitor.endFrame();

        const report = monitor.report();
        expect(report.frames).toBe(1);
        expect(report.stages.passes.meanMs).toBe(4);
        expect(report.stages.update.meanMs).toBe(0);
        expect(report.frame.meanMs).toBe(4);
    });

    it('takes an inner stage out of the outer one so nothing is counted twice', () => {
        const { now, advance } = clock();
        const monitor = new FrameTimeMonitor({ now, budget: BUDGET });

        monitor.measure('update', () => {
            advance(1);
            monitor.measure('script', () => advance(2));
            advance(1);
        });
        monitor.endFrame();

        const report = monitor.report();
        expect(report.stages.update.meanMs).toBe(2);
        expect(report.stages.script.meanMs).toBe(2);
        expect(report.frame.meanMs).toBe(4);
    });

    it('still charges the stage when the work throws', () => {
        const { now, advance } = clock();
        const monitor = new FrameTimeMonitor({ now, budget: BUDGET });

        expect(() =>
            monitor.measure('script', () => {
                advance(3);
                throw new Error('boom');
            })
        ).toThrow('boom');
        monitor.endFrame();

        expect(monitor.report().stages.script.meanMs).toBe(3);
    });

    it('sums repeated measurements of one stage within a frame', () => {
        const { now, advance } = clock();
        const monitor = new FrameTimeMonitor({ now, budget: BUDGET });

        monitor.measure('script', () => advance(1));
        monitor.measure('script', () => advance(2));
        monitor.endFrame();

        expect(monitor.report().stages.script.maxMs).toBe(3);
    });

    it('reports mean, p95, max and the frames over budget across the window', () => {
        const { now, advance } = clock();
        const monitor = new FrameTimeMonitor({ now, budget: BUDGET });

        for (let frame = 1; frame <= 20; frame++) {
            monitor.measure('passes', () => advance(frame));
            monitor.endFrame();
        }

        const passes = monitor.report().stages.passes;
        expect(passes.meanMs).toBe(10.5);
        expect(passes.p95Ms).toBe(19);
        expect(passes.maxMs).toBe(20);
        expect(passes.budgetMs).toBe(5);
        expect(passes.overBudgetFrames).toBe(15);
        expect(monitor.report().frame.overBudgetFrames).toBe(10);
    });

    it('forgets frames that left the window', () => {
        const { now, advance } = clock();
        const monitor = new FrameTimeMonitor({ now, budget: BUDGET, windowFrames: 3 });

        for (const ms of [50, 1, 1, 1]) {
            monitor.measure('passes', () => advance(ms));
            monitor.endFrame();
        }

        const report = monitor.report();
        expect(report.frames).toBe(3);
        expect(report.stages.passes.maxMs).toBe(1);
    });

    it('starts empty and after a reset', () => {
        const { now, advance } = clock();
        const monitor = new FrameTimeMonitor({ now, budget: BUDGET });
        expect(monitor.report().frames).toBe(0);
        expect(monitor.report().frame.p95Ms).toBe(0);

        monitor.measure('passes', () => advance(9));
        monitor.endFrame();
        monitor.measure('passes', () => advance(9));
        monitor.reset();
        monitor.endFrame();

        expect(monitor.report().frame.maxMs).toBe(0);
    });

    describe('GPU time', () => {
        it('is unavailable until the device delivers a measurement', () => {
            const monitor = new FrameTimeMonitor({ budget: BUDGET });

            monitor.recordGpu(null);
            monitor.endFrame();

            expect(monitor.report().gpu).toBeNull();
        });

        it('reports the measurements against the GPU budget', () => {
            const monitor = new FrameTimeMonitor({ budget: BUDGET });

            for (const ms of [4, 6, 10]) monitor.recordGpu(ms);

            expect(monitor.report().gpu).toEqual({
                meanMs: 20 / 3,
                p95Ms: 10,
                maxMs: 10,
                budgetMs: 8,
                overBudgetFrames: 1,
            });
        });

        it('counts a result the device offers again as one measurement, not one per frame', () => {
            const monitor = new FrameTimeMonitor({ budget: BUDGET });

            for (const ms of [4, 4, 4, 6, 6]) monitor.recordGpu(ms);

            expect(monitor.report().gpu?.meanMs).toBe(5);
        });

        it("starts over after a reset without counting the old effect's last result again", () => {
            const monitor = new FrameTimeMonitor({ budget: BUDGET });
            monitor.recordGpu(4);

            monitor.reset();
            expect(monitor.report().gpu).toBeNull();
            monitor.recordGpu(4);
            expect(monitor.report().gpu).toBeNull();
            monitor.recordGpu(6);

            expect(monitor.report().gpu?.meanMs).toBe(6);
        });
    });
});
