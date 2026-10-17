// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_MUSIC } from '../../data/demoMusic';
import { assetUrl } from '../../utils/base-url';
import type { StartConfig } from '../StartScreen';
import { StartScreen } from '../StartScreen';

const packages = [{ id: 'one', title: 'One', description: '', basePath: '/one' }];

function mount(): { parent: HTMLElement; screen: StartScreen; submissions: StartConfig[] } {
    const screen = new StartScreen(packages);
    const parent = document.createElement('div');
    const submissions: StartConfig[] = [];
    screen.onSubmit.add(config => submissions.push(config));
    screen.mount(parent);
    return { parent, screen, submissions };
}

const select = (parent: HTMLElement): HTMLSelectElement =>
    parent.querySelector<HTMLSelectElement>('[data-demo-music]')!;
const input = (parent: HTMLElement): HTMLInputElement => parent.querySelector<HTMLInputElement>('input[type="url"]')!;
const card = (parent: HTMLElement): HTMLButtonElement =>
    parent.querySelector<HTMLButtonElement>('[data-effect-id="one"]')!;
const trackUrl = (index: number): string => new URL(assetUrl(DEMO_MUSIC[index].path), document.baseURI).href;

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllEnvs());

describe('StartScreen demo music', () => {
    it('groups each recording by its catalog category without hiding the custom URL choice', () => {
        const { parent } = mount();
        const groups = [...select(parent).querySelectorAll('optgroup')];
        expect(groups.map(group => group.label)).toEqual([...new Set(DEMO_MUSIC.map(track => track.category))]);
        for (const track of DEMO_MUSIC) {
            const option = select(parent).querySelector<HTMLOptionElement>(`option[value="${track.id}"]`)!;
            expect((option.parentElement as HTMLOptGroupElement).label).toBe(track.category);
        }
        expect(select(parent).querySelector('option[value=""]')).not.toBeNull();
    });
    it.each(['mic', 'screen', 'upload'])(
        'clears the demo picker for %s and lets the same demo be selected again',
        source => {
            const { parent, submissions } = mount();
            parent.querySelector<HTMLButtonElement>(`[data-source-tile="${source}"] button`)!.click();
            expect(select(parent).value).toBe('');
            expect(parent.querySelector<HTMLElement>('[data-demo-credit]')!.hidden).toBe(true);
            select(parent).value = DEMO_MUSIC[0].id;
            select(parent).dispatchEvent(new Event('change'));
            card(parent).click();
            expect(submissions).toEqual([{ packageId: 'one', sourceType: 'url', url: trackUrl(0) }]);
        }
    );
    it('resolves demo URLs under a Pages deployment base', () => {
        vi.stubEnv('BASE_URL', '/blink/');
        const { parent, submissions } = mount();
        expect(new URL(input(parent).value).pathname).toBe(`/blink/${DEMO_MUSIC[0].path}`);
        card(parent).click();
        expect(submissions[0].url).toBe(trackUrl(0));
    });

    it('defaults to a labeled local demo without creating playback or starting an effect', () => {
        const { parent, submissions } = mount();
        expect(select(parent)).not.toBeNull();
        expect(select(parent).labels?.[0]?.textContent).toContain('Demo-Musik');
        expect(select(parent).value).toBe(DEMO_MUSIC[0].id);
        expect(input(parent).value).toBe(trackUrl(0));
        expect(card(parent).disabled).toBe(false);
        expect(parent.querySelector('audio')).toBeNull();
        expect(submissions).toEqual([]);
        card(parent).click();
        expect(submissions).toEqual([{ packageId: 'one', sourceType: 'url', url: trackUrl(0) }]);
    });

    it('changes the URL source and credits when choosing another demo, then starts only on a card click', () => {
        const { parent, submissions } = mount();
        parent.querySelector<HTMLButtonElement>('[data-source-tile="mic"] button')!.click();
        select(parent).value = DEMO_MUSIC[1].id;
        select(parent).dispatchEvent(new Event('change'));
        expect(input(parent).value).toBe(trackUrl(1));
        expect(parent.querySelector('.source-tile--selected')?.getAttribute('data-source-tile')).toBe('url');
        const credit = parent.querySelector<HTMLAnchorElement>('[data-demo-credit]')!;
        expect(credit.textContent).toContain(DEMO_MUSIC[1].title);
        expect(credit.textContent).toContain(DEMO_MUSIC[1].author);
        expect(credit.textContent).toContain('CC0');
        expect(credit.href).toBe(DEMO_MUSIC[1].sourceUrl);
        expect(submissions).toEqual([]);
        card(parent).click();
        expect(submissions[0].url).toBe(trackUrl(1));
    });

    it('preserves a remembered custom URL and clears the demo selection for edited and prefilled URLs', () => {
        const customUrl = 'https://example.com/remembered.ogg';
        localStorage.setItem('blink.start-selection', JSON.stringify({ sourceType: 'url', url: customUrl }));
        const { parent, screen } = mount();
        expect(input(parent).value).toBe(customUrl);
        expect(select(parent).value).toBe('');
        expect(parent.querySelector<HTMLElement>('[data-demo-credit]')!.hidden).toBe(true);
        select(parent).value = DEMO_MUSIC[0].id;
        select(parent).dispatchEvent(new Event('change'));
        input(parent).value = 'https://example.com/edited.ogg';
        input(parent).dispatchEvent(new Event('input'));
        expect(select(parent).value).toBe('');
        screen.prefill({ sourceType: 'url', url: trackUrl(1) });
        expect(select(parent).value).toBe(DEMO_MUSIC[1].id);
        screen.prefill({ sourceType: 'url', url: customUrl });
        expect(select(parent).value).toBe('');
    });

    it('locks the native select during loading and ignores dispatched changes until unlocked', () => {
        const { parent, screen } = mount();
        screen.setLoading(true);
        expect(select(parent).disabled).toBe(true);
        select(parent).value = DEMO_MUSIC[1].id;
        select(parent).dispatchEvent(new Event('change'));
        expect(input(parent).value).toBe(trackUrl(0));
        screen.setLoading(false);
        expect(select(parent).disabled).toBe(false);
        expect(select(parent).value).toBe(DEMO_MUSIC[0].id);
    });
});
