import { describe, expect, it } from 'vitest';

import { buildDiagnosticsSnapshot } from '../diagnosticsSnapshot';
import type { PassDiagnostics } from '../pass';

const PASSES: readonly PassDiagnostics[] = [{ name: 'main', resolution: [64, 32], format: 'rgba8' }];
const AUDIO = { au_level: 0.5 };

describe('buildDiagnosticsSnapshot', () => {
    it("places each argument under its own field, not a neighbor's", () => {
        // Every numeric argument and both screen dimensions are pairwise distinct so a swap
        // between any two fields (e.g. time/deltaTime, or the two screen components) fails.
        const snapshot = buildDiagnosticsSnapshot(11, 22, 33, 44, [55, 66], PASSES, AUDIO);

        expect(snapshot.fps).toBe(11);
        expect(snapshot.frame).toBe(22);
        expect(snapshot.time).toBe(33);
        expect(snapshot.deltaTime).toBe(44);
        expect(snapshot.screen).toEqual([55, 66]);
        expect(snapshot.passes).toBe(PASSES);
        expect(snapshot.audio).toBe(AUDIO);
    });
});
