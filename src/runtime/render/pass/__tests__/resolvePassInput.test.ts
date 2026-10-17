import { describe, expect, it } from 'vitest';

import type { PassResourceStore } from '../resolvePassInput';
import { resolvePassInput } from '../resolvePassInput';

const FALLBACK = 'dummy' as unknown as never;

function pool(): { read: (name: string, previous: boolean, parity: number) => unknown } {
    return { read: (name, previous, parity) => `${name}:${previous ? 'prev' : 'cur'}:${parity}` };
}

function store(overrides: Partial<PassResourceStore> = {}): PassResourceStore {
    return {
        asset: () => undefined,
        hostInput: () => undefined,
        blinkAudio: () => undefined,
        ...overrides,
    } as PassResourceStore;
}

describe('resolvePassInput', () => {
    it('reads a current and a previous target from the pool', () => {
        const p = pool() as never;
        expect(resolvePassInput({ kind: 'target', name: 'fb', previous: false }, p, 1, store(), FALLBACK)).toBe(
            'fb:cur:1'
        );
        expect(resolvePassInput({ kind: 'target', name: 'fb', previous: true }, p, 1, store(), FALLBACK)).toBe(
            'fb:prev:1'
        );
    });

    it('reads assets and audio surfaces from the store', () => {
        const s = store({
            asset: name => `asset:${name}` as never,
            blinkAudio: surface => `audio:${surface}` as never,
        });
        expect(resolvePassInput({ kind: 'asset', name: 'noise' }, pool() as never, 0, s, FALLBACK)).toBe('asset:noise');
        expect(resolvePassInput({ kind: 'blinkAudio', surface: 'spectrum' }, pool() as never, 0, s, FALLBACK)).toBe(
            'audio:spectrum'
        );
    });

    it('falls back to the dummy texture for a resource that is not ready', () => {
        expect(resolvePassInput({ kind: 'asset', name: 'missing' }, pool() as never, 0, store(), FALLBACK)).toBe(
            FALLBACK
        );
        expect(resolvePassInput({ kind: 'hostInput', name: 'cam' }, pool() as never, 0, store(), FALLBACK)).toBe(
            FALLBACK
        );
    });
});
