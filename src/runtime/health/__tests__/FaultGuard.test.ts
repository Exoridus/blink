import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FAULT_POLICIES, FaultGuard } from '../FaultGuard';

function clock(): { now: () => number; advance: (ms: number) => void } {
    let time = 0;
    return {
        now: (): number => time,
        advance: (ms: number): void => {
            time += ms;
        },
    };
}

const boom = (): void => {
    throw new Error('boom');
};

describe('FaultGuard', () => {
    it('runs work and reports no fault when it succeeds', () => {
        const guard = new FaultGuard();
        const work = vi.fn();

        expect(guard.run('render', work)).toBe(true);

        expect(work).toHaveBeenCalledOnce();
        expect(guard.faults()).toEqual([]);
    });

    it('retries a source that failed fewer times in a row than the policy allows', () => {
        const guard = new FaultGuard();

        expect(guard.run('render', boom)).toBe(false);
        expect(guard.run('render', boom)).toBe(false);

        expect(guard.isDisabled('render')).toBe(false);
        expect(guard.faults()).toEqual([
            { source: 'render', kind: 'error', message: 'boom', occurrences: 2, disabled: false },
        ]);
    });

    it('switches a source off after enough consecutive failures and stops running it', () => {
        const guard = new FaultGuard();
        const work = vi.fn(boom);

        for (let i = 0; i < DEFAULT_FAULT_POLICIES.render.maxConsecutiveFailures; i++) guard.run('render', work);
        const calls = work.mock.calls.length;

        expect(guard.isDisabled('render')).toBe(true);
        expect(guard.run('render', work)).toBe(false);
        expect(work).toHaveBeenCalledTimes(calls);
    });

    it('lets a success end a run of failures but keeps the record', () => {
        const guard = new FaultGuard();

        guard.run('render', boom);
        guard.run('render', boom);
        guard.run('render', () => undefined);
        guard.run('render', boom);
        guard.run('render', boom);

        expect(guard.isDisabled('render')).toBe(false);
        expect(guard.faults()[0].occurrences).toBe(4);
    });

    it('does not let one source fault another', () => {
        const guard = new FaultGuard();

        for (let i = 0; i < 3; i++) guard.run('ssfScript', boom);

        expect(guard.isDisabled('ssfScript')).toBe(true);
        expect(guard.isDisabled('render')).toBe(false);
        expect(guard.run('render', () => undefined)).toBe(true);
    });

    it('treats a run over the stall limit as a stall and switches the source off after repeated ones', () => {
        const { now, advance } = clock();
        const guard = new FaultGuard({ now });
        const slow = (): void => advance(DEFAULT_FAULT_POLICIES['ssfScript'].stallMs! + 10);

        guard.run('ssfScript', slow);
        guard.run('ssfScript', slow);
        expect(guard.isDisabled('ssfScript')).toBe(false);
        guard.run('ssfScript', slow);

        expect(guard.isDisabled('ssfScript')).toBe(true);
        expect(guard.faults()[0]).toMatchObject({ kind: 'stall', disabled: true });
        expect(guard.faults()[0].message).toContain('limit');
    });

    it('resets the stall count when a run is fast again', () => {
        const { now, advance } = clock();
        const guard = new FaultGuard({ now });

        guard.run('ssfScript', () => advance(100));
        guard.run('ssfScript', () => advance(100));
        guard.run('ssfScript', () => advance(1));
        guard.run('ssfScript', () => advance(100));

        expect(guard.isDisabled('ssfScript')).toBe(false);
    });

    it('does not time a source whose policy has no stall limit', () => {
        const { now, advance } = clock();
        const guard = new FaultGuard({ now });

        expect(guard.run('render', () => advance(10_000))).toBe(true);
        expect(guard.faults()).toEqual([]);
    });

    it('switches a source off at once for a hang', () => {
        const guard = new FaultGuard();

        guard.report('script', 'hang', 'update did not settle');

        expect(guard.isDisabled('script')).toBe(true);
        expect(guard.faults()).toEqual([
            { source: 'script', kind: 'hang', message: 'update did not settle', occurrences: 1, disabled: true },
        ]);
    });

    it('counts failures reported from outside like failures it saw itself', () => {
        const guard = new FaultGuard();

        guard.report('script', 'error', 'rejected');
        guard.report('script', 'error', 'rejected');
        guard.succeed('script');
        guard.report('script', 'error', 'rejected');

        expect(guard.isDisabled('script')).toBe(false);
        guard.report('script', 'error', 'rejected');
        guard.report('script', 'error', 'rejected');
        expect(guard.isDisabled('script')).toBe(true);
    });

    it('notifies on the first fault, on switching off and on a reset that clears something', () => {
        const onChange = vi.fn();
        const guard = new FaultGuard({ onChange });

        guard.run('render', boom);
        expect(onChange).toHaveBeenCalledTimes(1);
        guard.run('render', boom);
        expect(onChange).toHaveBeenCalledTimes(1);
        guard.run('render', boom);
        expect(onChange).toHaveBeenCalledTimes(2);

        guard.reset();
        expect(onChange).toHaveBeenCalledTimes(3);
        guard.reset();
        expect(onChange).toHaveBeenCalledTimes(3);
    });

    it('runs a switched-off source again after a reset', () => {
        const guard = new FaultGuard();
        for (let i = 0; i < 3; i++) guard.run('render', boom);

        guard.reset();

        expect(guard.isDisabled('render')).toBe(false);
        expect(guard.faults()).toEqual([]);
        expect(guard.run('render', () => undefined)).toBe(true);
    });

    it('describes a thrown non-error', () => {
        const guard = new FaultGuard();

        guard.run('render', () => {
            throw 'plain';
        });

        expect(guard.faults()[0].message).toBe('plain');
    });
});
