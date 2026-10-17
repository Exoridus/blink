// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_MUSIC } from '../../data/demoMusic';
import { assetUrl } from '../../utils/base-url';
import { StartScreen } from '../StartScreen';

const key = 'blink.start-selection';
const packages = [
    { id: 'one', title: 'One', description: '', basePath: '/one' },
    { id: 'two', title: 'Two', description: '', basePath: '/two' },
];
const mount = (): HTMLElement => {
    const parent = document.createElement('div');
    new StartScreen(packages).mount(parent);
    return parent;
};
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('start selection', () => {
    it('prefills the first local demo for a new session', () => {
        expect(mount().querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe(
            new URL(assetUrl(DEMO_MUSIC[0].path), document.baseURI).href
        );
    });

    it('restores the last effect and URL source without starting playback', () => {
        localStorage.setItem(
            key,
            JSON.stringify({ packageId: 'two', sourceType: 'url', url: 'https://example.com/live' })
        );
        const screen = new StartScreen(packages);
        const submit = vi.fn();
        screen.onSubmit.add(submit);
        const parent = document.createElement('div');
        screen.mount(parent);
        expect(parent.querySelector<HTMLButtonElement>('.effect-gallery__card--selected')?.dataset.effectId).toBe(
            'two'
        );
        expect(parent.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe('https://example.com/live');
        expect(parent.querySelector('.source-tile--selected')?.getAttribute('data-source-tile')).toBe('url');
        expect(submit).not.toHaveBeenCalled();
    });

    it.each(['mic', 'screen', 'upload'])('does not restore %s acquisition', sourceType => {
        localStorage.setItem(key, JSON.stringify({ packageId: 'two', sourceType }));
        const parent = mount();
        expect(parent.querySelector<HTMLButtonElement>('.effect-gallery__card--selected')?.dataset.effectId).toBe(
            'two'
        );
        expect(parent.querySelector('.source-tile--selected')?.getAttribute('data-source-tile')).toBe('url');
        expect(parent.querySelector<HTMLInputElement>('input[type="file"]')?.files?.length).toBe(0);
    });

    it('keeps a usable effect selected when the saved one was removed', () => {
        localStorage.setItem(key, JSON.stringify({ packageId: 'removed' }));
        expect(mount().querySelector<HTMLButtonElement>('.effect-gallery__card--selected')?.dataset.effectId).toBe(
            'one'
        );
    });

    it('remembers the clicked gallery effect', () => {
        const effect = mount().querySelector<HTMLButtonElement>('[data-effect-id="two"]')!;
        effect.click();
        expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ packageId: 'two' });
    });

    it('tolerates corrupt or blocked browser storage', () => {
        localStorage.setItem(key, 'broken');
        expect(() => mount()).not.toThrow();
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(() => mount()).not.toThrow();
    });
});
