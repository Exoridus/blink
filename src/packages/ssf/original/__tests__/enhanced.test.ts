import { describe, expect, it } from 'vitest';

import { ExoEnhancedProvider } from '../enhanced';
import { SsfOriginalProvider } from '../provider';

describe('coherent enhanced tempo experiment', () => {
    it('retains native spectrum/time/beat gates and maps the entire tempo family', () => {
        const a = new SsfOriginalProvider();
        const b = new ExoEnhancedProvider('0.19.1');
        const block = { samples: new Float32Array(512).fill(0.1), sampleRate: 44100, firstSample: 0, sourceEpoch: 0 };
        a.process(block);
        b.process(block);
        b.publishTempo({ bpm: 150, confidence: 0.8, sampleIndex: 512, sourceEpoch: 0 });
        const original = a.snapshot(1 / 60);
        const enhanced = b.snapshot(1 / 60);
        expect(enhanced.spectrum).toEqual(original.spectrum);
        expect(enhanced.levelTrail).toEqual(original.levelTrail);
        for (const name of ['syn_Time', 'syn_OnBeat', 'syn_BeatTime', 'syn_RandomOnBeat'])
            expect(enhanced.signals.get(name)).toEqual(original.signals.get(name));
        for (const [name, signal] of enhanced.signals) {
            if (name.startsWith('syn_BPM')) expect(signal.origin).toBe('enhanced-adapter');
        }
        expect(enhanced.signals.get('syn_BPM')?.value).toBe(150);
        expect(enhanced.diagnostics.exoVersion).toBe('0.19.1');
    });
    it('reports fallback for missing, future, stale and wrong-epoch evidence', () => {
        const provider = new ExoEnhancedProvider('0.19.1');
        expect(provider.snapshot(0).signals.get('syn_BPM')?.origin).toBe('ssf-original-fallback');
        provider.publishTempo({ bpm: 120, confidence: 1, sampleIndex: 512, sourceEpoch: 0 });
        expect(provider.snapshot(0).signals.get('syn_BPM')?.origin).toBe('ssf-original-fallback');
        provider.publishTempo({ bpm: 120, confidence: 1, sampleIndex: 0, sourceEpoch: 1 });
        expect(provider.snapshot(0).signals.get('syn_BPM')?.origin).toBe('ssf-original-fallback');
    });
});
