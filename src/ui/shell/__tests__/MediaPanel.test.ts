// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { MediaPanel } from '../MediaPanel';
import type { ShellHost, ShellRuntimeState } from '../ShellHost';

function createHost(useMediaCamera = vi.fn().mockResolvedValue(undefined)): {
    host: ShellHost;
    push: (media: ShellRuntimeState['media']) => void;
    useMediaCamera: ReturnType<typeof vi.fn>;
    clearMedia: ReturnType<typeof vi.fn>;
} {
    let listener: ((state: ShellRuntimeState) => void) | null = null;
    const clearMedia = vi.fn();
    const host = {
        subscribeState: vi.fn((next: (state: ShellRuntimeState) => void) => {
            listener = next;
            return () => undefined;
        }),
        useMediaCamera,
        useMediaFile: vi.fn().mockResolvedValue(undefined),
        clearMedia,
    } as unknown as ShellHost;
    return {
        host,
        push: media =>
            listener?.({
                activeEffectId: 'x',
                controls: [],
                presets: [],
                controlValues: {},
                ...(media ? { media } : {}),
            }),
        useMediaCamera,
        clearMedia,
    };
}

function mount(host: ShellHost): HTMLElement {
    const parent = document.createElement('div');
    new MediaPanel(host).mount(parent);
    return parent;
}

describe('MediaPanel', () => {
    it('disables its actions while the effect declares no image input', () => {
        const { host, push } = createHost();
        const parent = mount(host);
        push({ inputs: [], kind: 'none', label: '' });

        expect([...parent.querySelectorAll('button')].filter(b => b.className === '').every(b => b.disabled)).toBe(
            true
        );
        expect(parent.querySelector('.media-panel__status')?.textContent).toContain('keine Medienquelle');
    });

    it('starts the camera and shows the active source', async () => {
        const { host, push, useMediaCamera } = createHost();
        const parent = mount(host);
        push({ inputs: ['syn_Media'], kind: 'none', label: '' });

        const camera = [...parent.querySelectorAll('button')].find(b => b.textContent === 'Kamera')!;
        expect(camera.disabled).toBe(false);
        camera.click();
        expect(useMediaCamera).toHaveBeenCalledOnce();

        push({ inputs: ['syn_Media'], kind: 'camera', label: 'Kamera' });
        expect(parent.querySelector('.media-panel__status')?.textContent).toBe('Quelle: Kamera');
    });

    it('reports a rejected source instead of throwing', async () => {
        const { host, push } = createHost(vi.fn().mockRejectedValue(new Error('Zugriff verweigert')));
        const parent = mount(host);
        push({ inputs: ['syn_Media'], kind: 'none', label: '' });

        [...parent.querySelectorAll('button')].find(b => b.textContent === 'Kamera')!.click();
        await vi.waitFor(() =>
            expect(parent.querySelector('.media-panel__status')?.textContent).toBe('Zugriff verweigert')
        );
    });

    it('clears the source', () => {
        const { host, push, clearMedia } = createHost();
        const parent = mount(host);
        push({ inputs: ['syn_Media'], kind: 'camera', label: 'Kamera' });

        [...parent.querySelectorAll('button')].find(b => b.textContent === 'Aus')!.click();
        expect(clearMedia).toHaveBeenCalledOnce();
    });
});
