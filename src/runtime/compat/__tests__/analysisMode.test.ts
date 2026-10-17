import { describe, expect, it } from 'vitest';

import { isAnalysisMode, isSwitchableProfile, substituteProfile } from '../analysisMode';

describe('analysis mode', () => {
    it('recognizes only the three modes', () => {
        expect(['current', 'enhanced', 'original'].every(isAnalysisMode)).toBe(true);
        expect(isAnalysisMode('legacy')).toBe(false);
        expect(isAnalysisMode(null)).toBe(false);
    });

    it('treats the SSF profile family as switchable and everything else as fixed', () => {
        for (const id of ['ssf/1', 'ssf-original/1', 'ssf-semantic/1', 'ssf-enhanced/1'])
            expect(isSwitchableProfile(id)).toBe(true);
        for (const id of ['isf/1', 'shadertoy/1', null, undefined]) expect(isSwitchableProfile(id)).toBe(false);
    });

    it('substitutes the profile of the mode and leaves foreign profiles alone', () => {
        expect(substituteProfile('current')('ssf/1')).toBe('ssf-semantic/1');
        expect(substituteProfile('enhanced')('ssf-original/1')).toBe('ssf-enhanced/1');
        expect(substituteProfile('original')('ssf-semantic/1')).toBe('ssf-original/1');
        expect(substituteProfile('enhanced')('shadertoy/1')).toBe('shadertoy/1');
    });
});
