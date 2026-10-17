// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShellOverlay } from '../ShellOverlay';

class TestOverlay extends ShellOverlay {
    public renderCalls = 0;
    public lastBody: HTMLElement | null = null;

    protected renderBody(body: HTMLElement): void {
        this.renderCalls += 1;
        this.lastBody = body;
        body.textContent = 'test-body';
    }
}

function mountFresh(
    id: string,
    title = 'Panel',
    options?: { startCollapsed?: boolean }
): { overlay: TestOverlay; parent: HTMLElement; root: HTMLElement; toggle: HTMLButtonElement } {
    const overlay = new TestOverlay(id, title, options);
    const parent = document.createElement('div');
    overlay.mount(parent);
    const root = parent.querySelector<HTMLElement>('.shell-overlay')!;
    const toggle = parent.querySelector<HTMLButtonElement>('.shell-overlay__toggle')!;
    return { overlay, parent, root, toggle };
}

describe('ShellOverlay', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts collapsed by default', () => {
        const { root } = mountFresh('panel-default');
        expect(root.classList.contains('shell-overlay--collapsed')).toBe(true);
    });

    it('honours startCollapsed: false when nothing is persisted yet', () => {
        const { root } = mountFresh('panel-expanded', 'Panel', { startCollapsed: false });
        expect(root.classList.contains('shell-overlay--collapsed')).toBe(false);
    });

    it('toggles collapse state on click', () => {
        const { root, toggle } = mountFresh('panel-toggle');
        expect(root.classList.contains('shell-overlay--collapsed')).toBe(true);

        toggle.click();
        expect(root.classList.contains('shell-overlay--collapsed')).toBe(false);

        toggle.click();
        expect(root.classList.contains('shell-overlay--collapsed')).toBe(true);
    });

    it('persists collapse state across instances under the same id', () => {
        const first = mountFresh('panel-persist');
        first.toggle.click();
        first.overlay.unmount();

        const second = mountFresh('panel-persist');
        expect(second.root.classList.contains('shell-overlay--collapsed')).toBe(false);
    });

    it('falls back to the default when the persisted value is corrupted', () => {
        localStorage.setItem('blink.shell.panel-corrupt.collapsed', 'not-a-boolean');
        const { root } = mountFresh('panel-corrupt');
        expect(root.classList.contains('shell-overlay--collapsed')).toBe(true);
    });

    it('falls back to the default when localStorage.getItem throws', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        try {
            const { root } = mountFresh('panel-read-throws');
            expect(root.classList.contains('shell-overlay--collapsed')).toBe(true);
        } finally {
            spy.mockRestore();
        }
    });

    it('does not throw and does not break the toggle when localStorage.setItem throws', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        try {
            const { root, toggle } = mountFresh('panel-write-throws');
            expect(() => toggle.click()).not.toThrow();
            expect(root.classList.contains('shell-overlay--collapsed')).toBe(false);
        } finally {
            spy.mockRestore();
        }
    });

    it('unmount removes the element from its parent', () => {
        const { overlay, parent } = mountFresh('panel-unmount-dom');
        expect(parent.children.length).toBe(1);

        overlay.unmount();
        expect(parent.children.length).toBe(0);
    });

    it('unmount detaches the toggle click listener', () => {
        const { overlay, toggle } = mountFresh('panel-unmount-listener');
        const removeSpy = vi.spyOn(toggle, 'removeEventListener');

        overlay.unmount();

        expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('calls renderBody exactly once, with the body element, at mount', () => {
        const overlay = new TestOverlay('panel-render-body', 'Panel');
        expect(overlay.renderCalls).toBe(0);

        const parent = document.createElement('div');
        overlay.mount(parent);

        expect(overlay.renderCalls).toBe(1);
        expect(overlay.lastBody?.textContent).toBe('test-body');
    });
});
