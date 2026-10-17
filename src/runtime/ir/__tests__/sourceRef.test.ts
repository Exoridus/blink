import { describe, expect, it } from 'vitest';

import { formatSourceRef, parseSourceRef, resolveLegacySourceName, sourceRefResourceName } from '../sourceRef';

describe('parseSourceRef', () => {
    it('parses every canonical form', () => {
        expect(parseSourceRef('asset.noise')).toEqual({ kind: 'asset', name: 'noise' });
        expect(parseSourceRef('input.sourceImage')).toEqual({ kind: 'hostInput', name: 'sourceImage' });
        expect(parseSourceRef('target.fb')).toEqual({ kind: 'target', name: 'fb', previous: false });
        expect(parseSourceRef('target.fb.previous')).toEqual({ kind: 'target', name: 'fb', previous: true });
        expect(parseSourceRef('blink.audio.spectrum')).toEqual({ kind: 'blinkAudio', surface: 'spectrum' });
        expect(parseSourceRef('blink.audio.levelTrail')).toEqual({ kind: 'blinkAudio', surface: 'levelTrail' });
    });

    it('rejects unknown prefixes, unknown audio surfaces and empty names', () => {
        expect(parseSourceRef('texture.noise')).toBeNull();
        expect(parseSourceRef('blink.audio.waveform')).toBeNull();
        expect(parseSourceRef('asset.')).toBeNull();
        expect(parseSourceRef('noise')).toBeNull();
    });

    it('round-trips through formatSourceRef', () => {
        for (const raw of ['asset.noise', 'input.cam', 'target.fb', 'target.fb.previous', 'blink.audio.spectrum']) {
            expect(formatSourceRef(parseSourceRef(raw)!)).toBe(raw);
        }
    });
});

describe('resolveLegacySourceName', () => {
    const known = { targets: new Set(['fb']), assets: new Set(['noise']) };

    it('resolves a bare target name and a bare asset name', () => {
        expect(resolveLegacySourceName('fb', known)).toEqual({ kind: 'target', name: 'fb', previous: false });
        expect(resolveLegacySourceName('noise', known)).toEqual({ kind: 'asset', name: 'noise' });
    });

    it('resolves the legacy ".previous" suffix on a target', () => {
        expect(resolveLegacySourceName('fb.previous', known)).toEqual({ kind: 'target', name: 'fb', previous: true });
    });

    it('accepts a canonical form unchanged and rejects an unknown bare name', () => {
        expect(resolveLegacySourceName('blink.audio.spectrum', known)).toEqual({
            kind: 'blinkAudio',
            surface: 'spectrum',
        });
        expect(resolveLegacySourceName('missing', known)).toBeNull();
    });
});

describe('sourceRefResourceName', () => {
    it('names the resource, not the reference form', () => {
        expect(sourceRefResourceName({ kind: 'target', name: 'fb', previous: true })).toBe('fb');
        expect(sourceRefResourceName({ kind: 'asset', name: 'noise' })).toBe('noise');
        expect(sourceRefResourceName({ kind: 'blinkAudio', surface: 'spectrum' })).toBe('spectrum');
    });
});
