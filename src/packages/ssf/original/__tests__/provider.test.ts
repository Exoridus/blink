import { describe, expect, it } from 'vitest';

import { SsfOriginalProvider } from '../provider';

describe('timestamped original PCM provider', () => {
    it('produces identical isolated snapshots with shared PCM and render clock', () => {
        const a = new SsfOriginalProvider();
        const b = new SsfOriginalProvider();
        const block = { samples: new Float32Array(512).fill(0.25), sampleRate: 44100, firstSample: 0, sourceEpoch: 0 };
        a.process(block);
        b.process(block);
        const first = a.snapshot(1 / 60);
        expect(first).toEqual(b.snapshot(1 / 60));
        expect(first.signals.size).toBe(51);
        expect(first.spectrum).toHaveLength(4096);
        expect(first.levelTrail).toHaveLength(1600);
        const retained = first.levelTrail.slice();
        a.snapshot(1 / 60);
        expect(first.levelTrail).toEqual(retained);
        expect(a.snapshot(1 / 60)).not.toEqual(b.snapshot(1 / 60));
    });
    it('accumulates arbitrary transport chunks into native 512-sample hops', () => {
        const provider = new SsfOriginalProvider();
        provider.process({ samples: new Float32Array(511), sampleRate: 44100, firstSample: 0, sourceEpoch: 0 });
        expect(provider.snapshot(0).instant.analysisSequence).toBe(0);
        provider.process({ samples: new Float32Array(1), sampleRate: 44100, firstSample: 511, sourceEpoch: 0 });
        expect(provider.snapshot(0).instant.analysisSequence).toBe(1);
    });
    it('rejects clock gaps and wrong rates before mutating analysis', () => {
        const provider = new SsfOriginalProvider();
        expect(() =>
            provider.process({ samples: new Float32Array(512), sampleRate: 48000, firstSample: 0, sourceEpoch: 0 })
        ).toThrow(/44100/);
        expect(() =>
            provider.process({ samples: new Float32Array(512), sampleRate: 44100, firstSample: 512, sourceEpoch: 0 })
        ).toThrow(/contiguous/);
        expect(provider.snapshot(0).instant.sampleIndex).toBe(0);
    });
    it('resets state and clocks explicitly for a deterministic new epoch', () => {
        const provider = new SsfOriginalProvider();
        provider.process({ samples: new Float32Array(512).fill(1), sampleRate: 44100, firstSample: 0, sourceEpoch: 0 });
        provider.snapshot(1);
        provider.reset(1);
        provider.process({ samples: new Float32Array(512), sampleRate: 44100, firstSample: 0, sourceEpoch: 1 });
        const snapshot = provider.snapshot(0);
        expect(snapshot.instant.sourceEpoch).toBe(1);
        expect(snapshot.signals.get('syn_InputLevel')?.value).toBe(0);
    });
});
