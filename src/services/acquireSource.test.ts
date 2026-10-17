import { describe, expect, it, vi } from 'vitest';

vi.mock('@codexo/exojs', () => ({
    getAudioContext: () => ({
        state: 'running' as const,
        resume: async (): Promise<void> => {},
    }),
}));

const { acquireSource } = await import('./acquireSource');

describe('acquireSource validation', () => {
    it('rejects type=url without url', async () => {
        await expect(acquireSource({ type: 'url' })).rejects.toThrow('URL fehlt.');
    });

    it('rejects type=url with empty url', async () => {
        await expect(acquireSource({ type: 'url', url: '' })).rejects.toThrow('URL fehlt.');
    });

    it('rejects type=upload without file', async () => {
        await expect(acquireSource({ type: 'upload' })).rejects.toThrow('Datei fehlt.');
    });
});
