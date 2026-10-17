// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { DEMO_MUSIC } from '../../data/demoMusic';
import { assetUrl } from '../../utils/base-url';
import type { BlinkFxPackageList } from '../../services/BlinkFxService';
import type { StartConfig } from '../StartScreen';
import { StartScreen } from '../StartScreen';

const PACKAGES: BlinkFxPackageList = [
    { id: 'alpha', title: 'Alpha', description: 'Alpha effect', basePath: '/effects/alpha/' },
    { id: 'beta', title: 'Beta', description: 'Beta effect', basePath: '/effects/beta/' },
];

function mount(packages: BlinkFxPackageList = PACKAGES): {
    parent: HTMLElement;
    screen: StartScreen;
    submissions: StartConfig[];
} {
    const screen = new StartScreen(packages);
    const parent = document.createElement('div');
    const submissions: StartConfig[] = [];
    screen.onSubmit.add(config => submissions.push(config));
    screen.mount(parent);
    return { parent, screen, submissions };
}

function card(parent: HTMLElement, id = 'alpha'): HTMLButtonElement {
    return parent.querySelector<HTMLButtonElement>(`[data-effect-id="${id}"]`)!;
}

function source(parent: HTMLElement, type: string): HTMLButtonElement {
    return parent.querySelector<HTMLButtonElement>(`[data-source-tile="${type}"] .source-tile__select`)!;
}

function urlInput(parent: HTMLElement): HTMLInputElement {
    return parent.querySelector<HTMLInputElement>('input[type="url"]')!;
}

function chooseFile(parent: HTMLElement, file = new File(['data'], 'clip.mp3', { type: 'audio/mpeg' })): File {
    const input = parent.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    return file;
}

beforeEach(() => localStorage.clear());

describe('StartScreen gallery', () => {
    it('shows real effect buttons and source choices without an effect dropdown or source submit buttons', () => {
        const { parent, submissions } = mount();
        expect(parent.querySelector('select:not([data-demo-music])')).toBeNull();
        expect(parent.querySelector('.source-tile__submit')).toBeNull();
        expect(
            [...parent.querySelectorAll<HTMLButtonElement>('.effect-gallery__card')].map(
                button => button.dataset.effectId
            )
        ).toEqual(['alpha', 'beta']);
        expect(parent.querySelectorAll('.source-tile__select')).toHaveLength(4);
        expect(card(parent).type).toBe('button');
        expect(card(parent).getAttribute('aria-label')).toBe('Alpha starten');
        expect(submissions).toEqual([]);
    });

    it('starts the clicked effect immediately with the default URL source', () => {
        const { parent, submissions } = mount();
        card(parent, 'beta').click();
        expect(submissions).toEqual([
            { packageId: 'beta', sourceType: 'url', url: new URL(assetUrl(DEMO_MUSIC[0].path), document.baseURI).href },
        ]);
    });

    it.each(['mic', 'screen'] as const)(
        'selects %s without acquisition and starts it only when an effect is chosen',
        type => {
            const { parent, submissions } = mount();
            source(parent, type).click();
            expect(submissions).toEqual([]);
            expect(source(parent, type).getAttribute('aria-pressed')).toBe('true');
            expect(source(parent, 'url').getAttribute('aria-pressed')).toBe('false');
            card(parent, 'beta').click();
            expect(submissions).toEqual([{ packageId: 'beta', sourceType: type }]);
        }
    );

    it('gates every effect on the selected URL readiness and uses the edited trimmed URL', () => {
        const { parent, submissions } = mount();
        urlInput(parent).value = 'invalid';
        urlInput(parent).dispatchEvent(new Event('input'));
        expect(card(parent).disabled).toBe(true);
        card(parent).dispatchEvent(new MouseEvent('click'));
        expect(submissions).toEqual([]);
        urlInput(parent).value = '  https://example.com/live  ';
        urlInput(parent).dispatchEvent(new Event('input'));
        expect(card(parent).disabled).toBe(false);
        card(parent).click();
        expect(submissions[0]).toEqual({ packageId: 'alpha', sourceType: 'url', url: 'https://example.com/live' });
    });

    it('requires a freshly chosen file for upload, then starts with that file', () => {
        const { parent, submissions } = mount();
        source(parent, 'upload').click();
        expect(card(parent).disabled).toBe(true);
        const file = chooseFile(parent);
        expect(card(parent).disabled).toBe(false);
        card(parent).click();
        expect(submissions).toEqual([{ packageId: 'alpha', sourceType: 'upload', file }]);
    });

    it('uses a dropped file and selects upload without another action', () => {
        const { parent, submissions } = mount();
        source(parent, 'upload').click();
        const file = new File(['audio'], 'drop.wav');
        const event = new Event('drop', { cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
        parent.querySelector('[data-source-tile="upload"] .source-tile__field')!.dispatchEvent(event);
        card(parent).click();
        expect(submissions[0]).toEqual({ packageId: 'alpha', sourceType: 'upload', file });
    });

    it('prefills deep links by marking a card and selecting the requested source', () => {
        const { parent, screen, submissions } = mount();
        screen.prefill({ packageId: 'beta', sourceType: 'url', url: 'https://example.com/probe.wav' });
        expect(card(parent, 'beta').classList.contains('effect-gallery__card--selected')).toBe(true);
        expect(source(parent, 'url').getAttribute('aria-pressed')).toBe('true');
        expect(submissions).toEqual([]);
        card(parent, 'beta').click();
        expect(submissions[0]).toEqual({ packageId: 'beta', sourceType: 'url', url: 'https://example.com/probe.wav' });
    });

    it('locks all sources, fields and effect cards immediately to prevent duplicate starts', () => {
        const { parent, screen, submissions } = mount();
        card(parent).click();
        card(parent, 'beta').dispatchEvent(new MouseEvent('click'));
        expect(submissions).toHaveLength(1);
        expect(
            [...parent.querySelectorAll<HTMLButtonElement>('button:not(.error-card__dismiss)')].every(
                button => button.disabled
            )
        ).toBe(true);
        expect(urlInput(parent).disabled).toBe(true);
        expect(parent.querySelector<HTMLInputElement>('input[type="file"]')!.disabled).toBe(true);
        screen.setLoading(false);
        card(parent, 'beta').click();
        expect(submissions).toHaveLength(2);
    });

    it('restores readiness after loading without enabling an invalid source', () => {
        const { parent, screen } = mount();
        source(parent, 'upload').click();
        screen.setLoading(true);
        screen.setLoading(false);
        expect(source(parent, 'upload').disabled).toBe(false);
        expect(card(parent).disabled).toBe(true);
    });

    it('orders grouped gallery sections native, shipped Synesthesia, then community', () => {
        const { parent } = mount([
            {
                id: 'community',
                title: 'Community',
                description: '',
                basePath: '/effects/owner/a.synScene',
                sourceFiles: [],
            },
            { id: 'builtin', title: 'Builtin', description: '', basePath: '/effects/a.synScene', sourceFiles: [] },
            PACKAGES[0],
        ]);
        expect([...parent.querySelectorAll('.effect-gallery__heading')].map(title => title.textContent)).toEqual([
            'BlinkFX (.blinkfx)',
            'Synesthesia (.synScene)',
            'Community (.synScene)',
        ]);
        expect(
            [...parent.querySelectorAll<HTMLButtonElement>('.effect-gallery__card')].map(
                button => button.dataset.effectId
            )
        ).toEqual(['alpha', 'builtin', 'community']);
    });

    it('uses lazy static previews and leaves a usable fallback when an image fails', () => {
        const { parent, submissions } = mount([{ ...PACKAGES[0], previewUrl: '/effects/previews/alpha.webp' }]);
        const image = card(parent).querySelector<HTMLImageElement>('img')!;
        expect(image.getAttribute('src')).toBe('/effects/previews/alpha.webp');
        expect(image.loading).toBe('lazy');
        expect(image.alt).toBe('');
        image.dispatchEvent(new Event('error'));
        expect(image.hidden).toBe(true);
        expect(card(parent).disabled).toBe(false);
        card(parent).click();
        expect(submissions).toHaveLength(1);
    });

    it('shows package titles safely and handles an empty catalog', () => {
        const { parent } = mount([{ ...PACKAGES[0], title: '<img src=x>' }]);
        expect(card(parent).textContent).toContain('<img src=x>');
        expect(card(parent).querySelector('img')).toBeNull();
        const empty = mount([]);
        expect(empty.parent.querySelector('.effect-gallery__empty')?.textContent).toContain('Keine Effekte');
    });

    it('retains the centered escaped error lifecycle and clears errors on a gallery retry', () => {
        const { parent, screen } = mount();
        const message = '<img src=x onerror=alert(1)> shader failed';
        screen.setStatus(message, true);
        const error = parent.querySelector<HTMLElement>('.error-card')!;
        expect(error.hidden).toBe(false);
        expect(error.querySelector('.error-card__title')?.textContent).toBe('Error');
        expect(error.querySelector('.error-card__message')?.textContent).toBe(message);
        expect(error.querySelector('img')).toBeNull();
        error.querySelector<HTMLButtonElement>('.error-card__dismiss')!.click();
        expect(error.hidden).toBe(true);
        screen.setStatus('again', true);
        card(parent).click();
        expect(error.hidden).toBe(true);
        expect(parent.querySelector('.start-screen__status')?.textContent).toBe('');
        screen.unmount();
        expect(parent.querySelector('.start-screen')).toBeNull();
    });
});
