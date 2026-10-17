// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readStartSelection, rememberEffect, rememberSource } from '../startSelection';

beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('persistent playback choices', () => {
    it('keeps the source preference when the running effect changes', () => {
        rememberSource('url', 'https://example.com/stream');
        rememberEffect('first');
        rememberEffect('last');
        expect(readStartSelection()).toEqual({
            packageId: 'last',
            sourceType: 'url',
            url: 'https://example.com/stream',
        });
    });

    it.each(['mic', 'screen', 'upload'] as const)('clears the resumable source when %s is chosen', type => {
        rememberEffect('last');
        rememberSource('url', 'https://example.com/stream');
        rememberSource(type);
        expect(readStartSelection()).toEqual({
            packageId: 'last',
            sourceType: undefined,
            url: 'https://example.com/stream',
        });
    });

    it('keeps playback usable when writing storage is blocked', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(() => rememberEffect('last')).not.toThrow();
        expect(() => rememberSource('url', 'https://example.com/stream')).not.toThrow();
    });
});
