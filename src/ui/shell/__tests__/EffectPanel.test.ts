// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlinkFxPackageList } from '../../../services/BlinkFxService';
import { EffectPanel } from '../EffectPanel';
import type { ShellHost, ShellRuntimeState } from '../ShellHost';

const PACKAGES: BlinkFxPackageList = [
    { id: 'alpha', title: 'Alpha', description: 'Alpha effect', basePath: '/effects/alpha/' },
    { id: 'beta', title: 'Beta', description: 'Beta effect', basePath: '/effects/beta/' },
    { id: 'gamma', title: 'Gamma', description: 'Gamma effect', basePath: '/effects/gamma/' },
];

interface FakeHost extends ShellHost {
    pushState(state: ShellRuntimeState): void;
    stateListenerCount(): number;
}

function createHost(
    overrides: Partial<ShellHost> = {},
    initialState: ShellRuntimeState = { activeEffectId: 'alpha', controls: [], presets: [], controlValues: {} }
): FakeHost {
    const listeners = new Set<(state: ShellRuntimeState) => void>();
    let state = initialState;

    function pushState(next: ShellRuntimeState): void {
        state = next;
        for (const listener of listeners) {
            listener(next);
        }
    }

    const base: FakeHost = {
        listEffects: vi.fn().mockResolvedValue(PACKAGES),
        subscribeState: vi.fn((listener: (state: ShellRuntimeState) => void) => {
            listeners.add(listener);
            listener(state);
            return () => listeners.delete(listener);
        }),
        subscribeDiagnostics: vi.fn().mockReturnValue(() => undefined),
        // Mirrors ShellHost's contract: a successful switch pushes the new state to every
        // subscribeState listener before it resolves.
        switchEffect: vi.fn((id: string) => {
            pushState({
                activeEffectId: id,
                controls: state.controls,
                presets: state.presets,
                controlValues: state.controlValues,
            });
            return Promise.resolve();
        }),
        setControl: vi.fn(),
        // Honest fake: resolves for a preset the current state actually ships, rejects
        // for anything else - mirroring the real contract instead of always succeeding.
        applyPreset: vi.fn((name: string) => {
            if (state.presets.some(preset => preset.name === name)) {
                return Promise.resolve();
            }
            return Promise.reject(new Error(`unknown preset "${name}"`));
        }),
        fireBang: vi.fn(),
        installPackage: vi.fn(),
        removePackage: vi.fn(),
        pushState,
        stateListenerCount: () => listeners.size,
    };

    return { ...base, ...overrides } as FakeHost;
}

function mount(host: ShellHost): { parent: HTMLElement; panel: EffectPanel } {
    const panel = new EffectPanel(host);
    const parent = document.createElement('div');
    panel.mount(parent);
    return { parent, panel };
}

function entries(parent: HTMLElement): HTMLButtonElement[] {
    return [...parent.querySelectorAll<HTMLButtonElement>('.effect-panel__entry')];
}

function findEntry(parent: HTMLElement, title: string): HTMLButtonElement {
    const button = entries(parent).find(candidate => candidate.textContent === title);
    if (button === undefined) {
        throw new Error(`no entry titled "${title}"`);
    }
    return button;
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('EffectPanel', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts expanded on first mount', () => {
        const { parent } = mount(createHost());
        const root = parent.querySelector('.shell-overlay');
        expect(root?.classList.contains('shell-overlay--collapsed')).toBe(false);
    });

    it('lists every package returned by host.listEffects()', async () => {
        const { parent } = mount(createHost());
        await flush();

        const titles = entries(parent).map(button => button.textContent);
        expect(titles).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('marks the entry matching the activeEffectId from a pushed state as active', async () => {
        const host = createHost({}, { activeEffectId: 'beta', controls: [], presets: [], controlValues: {} });
        const { parent } = mount(host);
        await flush();

        expect(findEntry(parent, 'Alpha').classList.contains('effect-panel__entry--active')).toBe(false);
        expect(findEntry(parent, 'Beta').classList.contains('effect-panel__entry--active')).toBe(true);
        expect(findEntry(parent, 'Gamma').classList.contains('effect-panel__entry--active')).toBe(false);
    });

    it('calls host.switchEffect with the clicked package id, and the pushed state moves the active marking', async () => {
        const switchEffect = vi.fn((id: string) => {
            host.pushState({ activeEffectId: id, controls: [], presets: [], controlValues: {} });
            return Promise.resolve();
        });
        const host = createHost({ switchEffect });
        const { parent } = mount(host);
        await flush();

        findEntry(parent, 'Beta').click();
        await flush();

        expect(switchEffect).toHaveBeenCalledWith('beta');
        expect(findEntry(parent, 'Alpha').classList.contains('effect-panel__entry--active')).toBe(false);
        expect(findEntry(parent, 'Beta').classList.contains('effect-panel__entry--active')).toBe(true);
    });

    it('marks the newly active effect purely from a pushed state, not from a re-read', async () => {
        const host = createHost();
        const { parent } = mount(host);
        await flush();

        // Pushed directly, bypassing this panel's own switchEffect() entirely - proving the
        // marking comes from the subscription, not from anything this panel itself triggered.
        host.pushState({ activeEffectId: 'gamma', controls: [], presets: [], controlValues: {} });

        expect(findEntry(parent, 'Alpha').classList.contains('effect-panel__entry--active')).toBe(false);
        expect(findEntry(parent, 'Gamma').classList.contains('effect-panel__entry--active')).toBe(true);
    });

    it('unsubscribes from state on unmount', async () => {
        const host = createHost();
        const { panel } = mount(host);
        await flush();
        expect(host.stateListenerCount()).toBe(1);

        panel.unmount();

        expect(host.stateListenerCount()).toBe(0);
    });

    it('on a rejecting switch, shows the failure inline and keeps the previous entry active and the panel usable', async () => {
        const switchEffect = vi.fn((id: string) => {
            if (id === 'gamma') {
                return Promise.reject(new Error('package failed validation'));
            }
            host.pushState({ activeEffectId: id, controls: [], presets: [], controlValues: {} });
            return Promise.resolve();
        });
        const host = createHost({ switchEffect });
        const { parent } = mount(host);
        await flush();

        findEntry(parent, 'Gamma').click();
        await flush();

        expect(switchEffect).toHaveBeenCalledWith('gamma');

        // the running effect was never switched away from
        expect(findEntry(parent, 'Alpha').classList.contains('effect-panel__entry--active')).toBe(true);
        expect(findEntry(parent, 'Gamma').classList.contains('effect-panel__entry--active')).toBe(false);

        // the failure is visible, not swallowed
        const status = parent.querySelector('.effect-panel__status');
        expect(status?.textContent).toContain('package failed validation');

        // the panel is not torn down or stuck: every entry is still clickable
        for (const button of entries(parent)) {
            expect(button.disabled).toBe(false);
        }

        // and a later switch still works, proving the panel did not lock up
        findEntry(parent, 'Beta').click();
        await flush();

        expect(switchEffect).toHaveBeenCalledWith('beta');
        expect(findEntry(parent, 'Beta').classList.contains('effect-panel__entry--active')).toBe(true);
    });

    it('ignores a second click while a switch is still in flight', async () => {
        let resolveSwitch: (() => void) | undefined;
        const switchEffect = vi.fn(
            () =>
                new Promise<void>(resolve => {
                    resolveSwitch = resolve;
                })
        );
        const host = createHost({ switchEffect });
        const { parent } = mount(host);
        await flush();

        const betaButton = findEntry(parent, 'Beta');
        betaButton.click();
        betaButton.click();

        expect(switchEffect).toHaveBeenCalledTimes(1);

        resolveSwitch?.();
        await flush();
    });

    it('shows a failure inline when listing effects itself rejects, without throwing', async () => {
        const host = createHost({ listEffects: vi.fn().mockRejectedValue(new Error('catalog unreachable')) });
        const { parent } = mount(host);
        await flush();

        const status = parent.querySelector('.effect-panel__status');
        expect(status?.textContent).toContain('catalog unreachable');
        expect(entries(parent).length).toBe(0);
    });

    it('does not write into the detached status element when listEffects resolves after unmount', async () => {
        let resolveList: ((packages: BlinkFxPackageList) => void) | undefined;
        const host = createHost({
            listEffects: vi.fn(() => new Promise<BlinkFxPackageList>(resolve => (resolveList = resolve))),
        });
        const { parent, panel } = mount(host);
        const status = parent.querySelector('.effect-panel__status');
        const textBeforeResolve = status?.textContent;

        panel.unmount();
        resolveList?.(PACKAGES);
        await flush();

        expect(status?.textContent).toBe(textBeforeResolve);
        expect(entries(parent).length).toBe(0);
    });

    it('does not write into the detached status element when switchEffect resolves after unmount', async () => {
        let resolveSwitch: (() => void) | undefined;
        const switchEffect = vi.fn(() => new Promise<void>(resolve => (resolveSwitch = resolve)));
        const host = createHost({ switchEffect });
        const { parent, panel } = mount(host);
        await flush();

        const betaButton = findEntry(parent, 'Beta');
        betaButton.click();
        const status = parent.querySelector('.effect-panel__status');
        const textDuringSwitch = status?.textContent;

        panel.unmount();
        resolveSwitch?.();
        await flush();

        expect(status?.textContent).toBe(textDuringSwitch);
    });

    describe('faults', () => {
        const faults = (parent: HTMLElement): string[] =>
            [...parent.querySelectorAll('.effect-panel__fault')].map(line => line.textContent ?? '');

        it('shows nothing while the running effect is healthy', () => {
            const { parent } = mount(createHost());

            expect(faults(parent)).toEqual([]);
        });

        it('shows a part that failed, and that a switched-off part stays off, as soon as the state says so', () => {
            const host = createHost();
            const { parent } = mount(host);

            host.pushState({
                activeEffectId: 'alpha',
                controls: [],
                presets: [],
                controlValues: {},
                faults: [
                    { source: 'render', kind: 'error', message: 'shader exploded', occurrences: 3, disabled: true },
                    { source: 'script', kind: 'error', message: 'script bug', occurrences: 1, disabled: false },
                ],
            });

            expect(faults(parent)).toEqual(['Rendering abgeschaltet: shader exploded', 'Skript: script bug (1x)']);
            expect(parent.querySelectorAll('.effect-panel__fault--disabled')).toHaveLength(1);
        });

        it('clears them when the next state carries none', () => {
            const host = createHost();
            const { parent } = mount(host);
            const base = { activeEffectId: 'alpha', controls: [], presets: [], controlValues: {} };
            host.pushState({
                ...base,
                faults: [{ source: 'render', kind: 'error', message: 'x', occurrences: 1, disabled: false }],
            });

            host.pushState({ ...base, faults: [] });

            expect(faults(parent)).toEqual([]);
        });
    });

    describe('installing packages', () => {
        const INSTALLED = {
            id: 'mine',
            title: 'Mine',
            description: 'Mine effect',
            basePath: 'blinkfx-installed/mine',
            installed: true,
        };

        const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

        async function choose(parent: HTMLElement, file: File): Promise<void> {
            const input = parent.querySelector<HTMLInputElement>('input[type="file"]')!;
            Object.defineProperty(input, 'files', { value: [file], configurable: true });
            input.dispatchEvent(new Event('change'));
            await flush();
            await flush();
        }

        const status = (parent: HTMLElement): HTMLElement => parent.querySelector('.effect-panel__status')!;

        it('offers a file picker for .blinkfx archives', async () => {
            const { parent } = mount(createHost());
            await flush();

            const input = parent.querySelector<HTMLInputElement>('input[type="file"]')!;
            expect(input.accept).toContain('.blinkfx');
            expect(parent.querySelector('.effect-panel__install')).not.toBeNull();
        });

        it('installs the chosen archive, lists the new package and says so', async () => {
            let installedNow = false;
            const host = createHost({
                listEffects: vi.fn(() => Promise.resolve(installedNow ? [...PACKAGES, INSTALLED] : PACKAGES)),
                installPackage: vi.fn(() => {
                    installedNow = true;
                    return Promise.resolve(INSTALLED);
                }),
            });
            const { parent } = mount(host);
            await flush();

            await choose(parent, new File([new Uint8Array([1, 2, 3])], 'mine.blinkfx'));

            expect(host.installPackage).toHaveBeenCalledOnce();
            expect([...vi.mocked(host.installPackage).mock.calls[0][0]]).toEqual([1, 2, 3]);
            expect(entries(parent).map(entry => entry.textContent)).toEqual(['Alpha', 'Beta', 'Gamma', 'Mine']);
            expect(status(parent).textContent).toBe('"Mine" installiert.');
        });

        it('shows why an archive was refused and leaves the list as it was', async () => {
            const host = createHost({
                installPackage: vi.fn(() => Promise.reject(new Error('The package is not valid: shader missing'))),
            });
            const { parent } = mount(host);
            await flush();

            await choose(parent, new File([new Uint8Array([1])], 'bad.blinkfx'));

            expect(status(parent).textContent).toBe('The package is not valid: shader missing');
            expect(status(parent).classList.contains('effect-panel__status--error')).toBe(true);
            expect(entries(parent)).toHaveLength(3);
            expect(entries(parent).every(entry => !entry.disabled)).toBe(true);
        });

        it('gives only installed packages a remove button, and removes the one clicked', async () => {
            let removed = false;
            const host = createHost({
                listEffects: vi.fn(() => Promise.resolve(removed ? PACKAGES : [...PACKAGES, INSTALLED])),
                removePackage: vi.fn(() => {
                    removed = true;
                    return Promise.resolve();
                }),
            });
            const { parent } = mount(host);
            await flush();
            const buttons = parent.querySelectorAll<HTMLButtonElement>('.effect-panel__remove');
            expect(buttons).toHaveLength(1);

            buttons[0].click();
            await flush();
            await flush();

            expect(host.removePackage).toHaveBeenCalledWith('mine');
            expect(entries(parent)).toHaveLength(3);
            expect(parent.querySelectorAll('.effect-panel__remove')).toHaveLength(0);
            expect(status(parent).textContent).toBe('"Mine" entfernt.');
        });

        it('shows the reason when a package cannot be removed', async () => {
            const host = createHost({
                listEffects: vi.fn().mockResolvedValue([...PACKAGES, INSTALLED]),
                removePackage: vi.fn().mockRejectedValue(new Error('The running effect cannot be removed')),
            });
            const { parent } = mount(host);
            await flush();

            parent.querySelector<HTMLButtonElement>('.effect-panel__remove')!.click();
            await flush();

            expect(status(parent).textContent).toBe('The running effect cannot be removed');
            expect(entries(parent)).toHaveLength(4);
        });

        it('keeps a second install from starting while one is running', async () => {
            let finish!: (value: typeof INSTALLED) => void;
            const host = createHost({
                installPackage: vi.fn(
                    () =>
                        new Promise<typeof INSTALLED>(resolve => {
                            finish = resolve;
                        })
                ),
            });
            const { parent } = mount(host);
            await flush();

            await choose(parent, new File([new Uint8Array([1])], 'a.blinkfx'));
            await choose(parent, new File([new Uint8Array([2])], 'b.blinkfx'));

            expect(host.installPackage).toHaveBeenCalledOnce();
            expect(parent.querySelector<HTMLButtonElement>('.effect-panel__install')!.disabled).toBe(true);
            finish(INSTALLED);
            await flush();
            expect(parent.querySelector<HTMLButtonElement>('.effect-panel__install')!.disabled).toBe(false);
        });
    });
});

describe('EffectPanel groups, reload and error cards', () => {
    beforeEach(() => localStorage.clear());

    it('groups native packages before shipped and community scenes', async () => {
        const { parent } = mount(
            createHost({
                listEffects: () =>
                    Promise.resolve([
                        {
                            id: 'community',
                            title: 'Community',
                            description: '',
                            basePath: '/effects/owner/scene.synScene',
                            sourceFiles: [],
                        },
                        {
                            id: 'builtin',
                            title: 'Builtin',
                            description: '',
                            basePath: '/effects/scene.synScene',
                            sourceFiles: [],
                        },
                        PACKAGES[0],
                    ]),
            })
        );
        await flush();
        expect([...parent.querySelectorAll('.effect-panel__group-title')].map(title => title.textContent)).toEqual([
            'BlinkFX (.blinkfx)',
            'Synesthesia (.synScene)',
            'Community (.synScene)',
        ]);
        expect(entries(parent).map(button => button.textContent)).toEqual(['Alpha', 'Builtin', 'Community']);
    });

    it('reloads from the fresh catalog without switching and guards duplicate clicks', async () => {
        let finish: ((list: BlinkFxPackageList) => void) | undefined;
        let switches = 0;
        const host = createHost({
            reloadEffects: () =>
                new Promise(resolve => {
                    finish = resolve;
                }),
            switchEffect: (): Promise<void> => {
                switches++;
                return Promise.resolve();
            },
        });
        const { parent } = mount(host);
        await flush();
        const reload = parent.querySelector<HTMLButtonElement>('.effect-panel__reload')!;
        expect(reload).not.toBeNull();
        expect(reload.getAttribute('aria-label')).toBe('Effektliste neu laden');
        expect(reload.title).toBe('Effektliste neu laden');
        reload.click();
        expect(reload.disabled).toBe(true);
        reload.click();
        finish?.([PACKAGES[0], { id: 'new', title: 'New effect', description: '', basePath: '/effects/new' }]);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(entries(parent).map(button => button.textContent)).toEqual(['Alpha', 'New effect']);
        expect(findEntry(parent, 'Alpha').classList.contains('effect-panel__entry--active')).toBe(true);
        expect(switches).toBe(0);
        expect(reload.disabled).toBe(false);
    });

    it('keeps the previous list usable after reload fails and shows the exact error safely', async () => {
        const message = '<img src=x> catalog unavailable';
        const { parent, panel } = mount(createHost({ reloadEffects: () => Promise.reject(new Error(message)) }));
        await flush();
        parent.querySelector<HTMLButtonElement>('.effect-panel__reload')!.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        const card = parent.querySelector<HTMLElement>('.error-card')!;
        expect(card.hidden).toBe(false);
        expect(card.querySelector('.error-card__title')?.textContent).toBe('Error');
        expect(card.querySelector('.error-card__message')?.textContent).toBe(message);
        expect(card.querySelector('img')).toBeNull();
        expect(entries(parent)).toHaveLength(3);
        expect(entries(parent).every(button => !button.disabled)).toBe(true);
        panel.unmount();
        expect(parent.querySelector('.error-card')).toBeNull();
    });

    it('shows failed switches centrally and clears the card for a later successful switch', async () => {
        const host = createHost();
        host.switchEffect = (id): Promise<void> => {
            if (id === 'beta') return Promise.reject(new Error('shader compile failed'));
            host.pushState({ activeEffectId: id, controls: [], presets: [], controlValues: {} });
            return Promise.resolve();
        };
        const { parent } = mount(host);
        await flush();
        findEntry(parent, 'Beta').click();
        await flush();
        const card = parent.querySelector<HTMLElement>('.error-card')!;
        expect(card.hidden).toBe(false);
        expect(card.querySelector('.error-card__message')?.textContent).toBe('shader compile failed');
        expect(findEntry(parent, 'Alpha').classList.contains('effect-panel__entry--active')).toBe(true);
        findEntry(parent, 'Gamma').click();
        await flush();
        expect(card.hidden).toBe(true);
    });

    it('shows runtime faults outside a collapsed panel, does not reopen dismissed repeats, and clears on recovery', async () => {
        const host = createHost();
        const { parent } = mount(host);
        await flush();
        parent.querySelector<HTMLButtonElement>('.shell-overlay__toggle')!.click();
        const base = { activeEffectId: 'alpha', controls: [], presets: [], controlValues: {} };
        const fault = {
            source: 'render' as const,
            kind: 'error' as const,
            message: 'GPU draw failed',
            occurrences: 1,
            disabled: false,
        };
        host.pushState({ ...base, faults: [fault] });
        const card = parent.querySelector<HTMLElement>('.error-card')!;
        expect(card.hidden).toBe(false);
        expect(card.closest('.shell-overlay')).toBeNull();
        expect(card.textContent).toContain('GPU draw failed');
        card.querySelector<HTMLButtonElement>('.error-card__dismiss')!.click();
        host.pushState({ ...base, faults: [{ ...fault, occurrences: 2 }] });
        expect(card.hidden).toBe(true);
        host.pushState({ ...base, faults: [{ ...fault, disabled: true }] });
        expect(card.hidden).toBe(false);
        host.pushState({ ...base, faults: [] });
        expect(card.hidden).toBe(true);
    });
});

describe('EffectPanel pending catalog lifecycle', () => {
    beforeEach(() => localStorage.clear());

    it('disables refresh until the initial catalog has settled', async () => {
        let finish: ((list: BlinkFxPackageList) => void) | undefined;
        const { parent } = mount(
            createHost({
                listEffects: () =>
                    new Promise(resolve => {
                        finish = resolve;
                    }),
                reloadEffects: () => Promise.resolve(PACKAGES),
            })
        );
        const reload = parent.querySelector<HTMLButtonElement>('.effect-panel__reload')!;
        expect(reload.disabled).toBe(true);
        finish?.(PACKAGES);
        await flush();
        expect(reload.disabled).toBe(false);
        expect(entries(parent).every(button => !button.disabled)).toBe(true);
    });

    it('shows initial catalog failures centrally', async () => {
        const { parent } = mount(createHost({ listEffects: () => Promise.reject(new Error('catalog unavailable')) }));
        await flush();
        const card = parent.querySelector<HTMLElement>('.error-card')!;
        expect(card.hidden).toBe(false);
        expect(card.querySelector('.error-card__message')?.textContent).toBe('catalog unavailable');
    });

    it('does not recreate an error card for a reload rejected after unmount', async () => {
        let reject: ((reason: Error) => void) | undefined;
        const { parent, panel } = mount(
            createHost({
                reloadEffects: () =>
                    new Promise((_, fail) => {
                        reject = fail;
                    }),
            })
        );
        await flush();
        parent.querySelector<HTMLButtonElement>('.effect-panel__reload')!.click();
        panel.unmount();
        reject?.(new Error('late failure'));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(parent.querySelector('.error-card')).toBeNull();
    });
});
