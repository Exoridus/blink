// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlinkBoolControl, BlinkControlSpec } from '../../../runtime/ir/types';
import type { BlinkDiagnosticsSnapshot } from '../../../runtime/render/diagnosticsSnapshot';
import type { BlinkFxPackageList } from '../../../services/BlinkFxService';
import { Shell } from '../Shell';
import type { ShellDiagnosticsEvent, ShellHost, ShellRuntimeState } from '../ShellHost';

const PACKAGES: BlinkFxPackageList = [
    { id: 'alpha', title: 'Alpha', description: 'Alpha effect', basePath: '/effects/alpha/' },
    { id: 'beta', title: 'Beta', description: 'Beta effect', basePath: '/effects/beta/' },
];

const ZERO_SNAPSHOT: BlinkDiagnosticsSnapshot = {
    fps: 0,
    frame: 0,
    time: 0,
    deltaTime: 0,
    screen: [0, 0],
    passes: [],
    audio: {},
};

const ALPHA_CONTROL: BlinkBoolControl = {
    name: 'alphaOnly',
    label: null,
    description: null,
    group: null,
    type: 'bool',
    default: true,
};

const BETA_CONTROL: BlinkBoolControl = {
    name: 'betaOnly',
    label: null,
    description: null,
    group: null,
    type: 'bool',
    default: true,
};

interface FakeHost extends ShellHost {
    pushState(state: ShellRuntimeState): void;
    pushDiagnostics(event: ShellDiagnosticsEvent): void;
    diagnosticsListenerCount(): number;
    stateListenerCount(): number;
}

function createHost(
    overrides: Partial<ShellHost> = {},
    controlsById: Record<string, readonly BlinkControlSpec[]> = {}
): FakeHost {
    const stateListeners = new Set<(state: ShellRuntimeState) => void>();
    const diagnosticsListeners = new Set<(event: ShellDiagnosticsEvent) => void>();
    let state: ShellRuntimeState = {
        activeEffectId: 'alpha',
        controls: controlsById.alpha ?? [],
        presets: [],
        controlValues: {},
    };
    let diagnosticsEvent: ShellDiagnosticsEvent = { ok: true, snapshot: ZERO_SNAPSHOT };

    function pushState(next: ShellRuntimeState): void {
        state = next;
        for (const listener of stateListeners) {
            listener(next);
        }
    }

    function pushDiagnostics(next: ShellDiagnosticsEvent): void {
        diagnosticsEvent = next;
        for (const listener of diagnosticsListeners) {
            listener(next);
        }
    }

    const base: FakeHost = {
        listEffects: vi.fn().mockResolvedValue(PACKAGES),
        subscribeState: vi.fn((listener: (state: ShellRuntimeState) => void) => {
            stateListeners.add(listener);
            listener(state);
            return () => stateListeners.delete(listener);
        }),
        subscribeDiagnostics: vi.fn((listener: (event: ShellDiagnosticsEvent) => void) => {
            diagnosticsListeners.add(listener);
            listener(diagnosticsEvent);
            return () => diagnosticsListeners.delete(listener);
        }),
        // Mirrors ShellHost's contract: a successful switch pushes the new state to every
        // subscribeState listener before it resolves.
        switchEffect: vi.fn((id: string) => {
            pushState({
                activeEffectId: id,
                controls: controlsById[id] ?? [],
                presets: [],
                controlValues: {},
                compatibility: null,
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
        pushDiagnostics,
        diagnosticsListenerCount: () => diagnosticsListeners.size,
        stateListenerCount: () => stateListeners.size,
    };

    return { ...base, ...overrides } as FakeHost;
}

// Every mounted Shell attaches a document-level keydown listener; tracking instances here
// lets afterEach unmount them so one test's shortcuts cannot leak into the next test's.
const mountedShells: Shell[] = [];

function mount(host: ShellHost): { parent: HTMLElement; shell: Shell } {
    const shell = new Shell(host);
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    shell.mount(parent);
    mountedShells.push(shell);
    return { parent, shell };
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function isCollapsed(root: ParentNode, panelId: string): boolean {
    const section = root.querySelector(`[data-shell-id="${panelId}"]`);
    if (section === null) {
        throw new Error(`no panel with data-shell-id="${panelId}"`);
    }
    return section.classList.contains('shell-overlay--collapsed');
}

function findEntry(parent: HTMLElement, title: string): HTMLButtonElement | undefined {
    return [...parent.querySelectorAll<HTMLButtonElement>('.effect-panel__entry')].find(
        button => button.textContent === title
    );
}

function pressAlt(key: string, target: EventTarget = document): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
}

describe('Shell', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    // Keeps each test's shortcuts from leaking into the next test: an unmounted Shell removed
    // its own listener already, so calling unmount() a second time here must be harmless.
    afterEach(() => {
        for (const shell of mountedShells.splice(0)) {
            shell.unmount();
        }
        document.body.replaceChildren();
    });

    it('rebuilds the control panel from the pushed state after switchEffect resolves', async () => {
        const controlsById: Record<string, readonly BlinkControlSpec[]> = {
            alpha: [ALPHA_CONTROL],
            beta: [BETA_CONTROL],
        };
        const switchEffect = vi.fn((id: string) => {
            host.pushState({
                activeEffectId: id,
                controls: controlsById[id] ?? [],
                presets: [],
                controlValues: {},
                compatibility: null,
            });
            return Promise.resolve();
        });
        const host = createHost({ switchEffect }, controlsById);
        const { parent } = mount(host);
        await flush();

        expect(parent.querySelector('[data-control-name="alphaOnly"]')).not.toBeNull();

        findEntry(parent, 'Beta')?.click();
        await flush();

        expect(switchEffect).toHaveBeenCalledWith('beta');
        expect(parent.querySelector('[data-control-name="alphaOnly"]')).toBeNull();
        expect(parent.querySelector('[data-control-name="betaOnly"]')).not.toBeNull();
    });

    it('leaves the control panel unchanged when switchEffect rejects', async () => {
        const controlsById: Record<string, readonly BlinkControlSpec[]> = { alpha: [ALPHA_CONTROL] };
        const switchEffect = vi.fn().mockRejectedValue(new Error('nope'));
        const host = createHost({ switchEffect }, controlsById);
        const { parent } = mount(host);
        await flush();

        expect(parent.querySelector('[data-control-name="alphaOnly"]')).not.toBeNull();

        findEntry(parent, 'Beta')?.click();
        await flush();

        expect(switchEffect).toHaveBeenCalledWith('beta');
        expect(parent.querySelector('[data-control-name="alphaOnly"]')).not.toBeNull();
    });

    it('does not touch the control panel when a switch resolves after the shell has been unmounted', async () => {
        const controlsById: Record<string, readonly BlinkControlSpec[]> = {
            alpha: [ALPHA_CONTROL],
            beta: [BETA_CONTROL],
        };
        let resolveSwitch: (() => void) | undefined;
        const switchEffect = vi.fn(
            (id: string) =>
                new Promise<void>(resolve => {
                    resolveSwitch = (): void => {
                        host.pushState({
                            activeEffectId: id,
                            controls: controlsById[id] ?? [],
                            presets: [],
                            controlValues: {},
                        });
                        resolve();
                    };
                })
        );
        const host = createHost({ switchEffect }, controlsById);
        const { parent, shell } = mount(host);
        await flush();

        findEntry(parent, 'Beta')?.click();

        shell.unmount();
        resolveSwitch?.();
        await flush();

        // the in-flight switch's state push arrives only after every panel already unsubscribed;
        // it must not resurrect any control DOM under the torn-down container
        expect(parent.querySelector('[data-control-name="betaOnly"]')).toBeNull();
        expect(parent.querySelectorAll('.shell-overlay').length).toBe(0);
    });

    it('Alt+1/2/3 toggle the effect, control and debug panels respectively', () => {
        const { parent } = mount(createHost());

        expect(isCollapsed(parent, 'effect-panel')).toBe(false);
        pressAlt('1');
        expect(isCollapsed(parent, 'effect-panel')).toBe(true);
        pressAlt('1');
        expect(isCollapsed(parent, 'effect-panel')).toBe(false);

        expect(isCollapsed(parent, 'control-panel')).toBe(true);
        pressAlt('2');
        expect(isCollapsed(parent, 'control-panel')).toBe(false);

        expect(isCollapsed(parent, 'debug-panel')).toBe(true);
        pressAlt('3');
        expect(isCollapsed(parent, 'debug-panel')).toBe(false);
    });

    it('Alt+0 collapses every panel', () => {
        const { parent } = mount(createHost());

        // control-panel and debug-panel start collapsed; expand them so collapse-all has
        // something to prove.
        pressAlt('2');
        pressAlt('3');
        expect(isCollapsed(parent, 'effect-panel')).toBe(false);
        expect(isCollapsed(parent, 'control-panel')).toBe(false);
        expect(isCollapsed(parent, 'debug-panel')).toBe(false);

        pressAlt('0');

        expect(isCollapsed(parent, 'effect-panel')).toBe(true);
        expect(isCollapsed(parent, 'control-panel')).toBe(true);
        expect(isCollapsed(parent, 'debug-panel')).toBe(true);
    });

    it('does not toggle a panel while a text input inside the shell has focus', () => {
        const { parent } = mount(createHost());

        const input = document.createElement('input');
        input.type = 'text';
        parent.appendChild(input);
        input.focus();

        expect(isCollapsed(parent, 'effect-panel')).toBe(false);
        pressAlt('1', input);
        expect(isCollapsed(parent, 'effect-panel')).toBe(false);
    });

    it('unmount tears down all four panels, not just the container', () => {
        const host = createHost();
        const { parent, shell } = mount(host);

        expect(parent.querySelectorAll('.shell-overlay').length).toBe(4);

        // Expand the debug panel so it actually holds a live diagnostics subscription - proving
        // the container alone was removed would not be enough: DebugPanel.unmount() must
        // unsubscribe, or a late push would try to write into a detached DOM tree.
        pressAlt('3');
        expect(host.diagnosticsListenerCount()).toBe(1);

        // Three: the control, effect and compatibility panels all subscribe to runtime state.
        expect(host.stateListenerCount()).toBe(3);

        shell.unmount();

        expect(parent.querySelectorAll('.shell-overlay').length).toBe(0);
        expect(parent.querySelector('.shell')).toBeNull();
        expect(host.diagnosticsListenerCount()).toBe(0);
        expect(host.stateListenerCount()).toBe(0);

        // a late push and a shortcut fired after unmount must not throw and must not resurrect
        // any panel
        expect(() => host.pushDiagnostics({ ok: true, snapshot: ZERO_SNAPSHOT })).not.toThrow();
        expect(() => pressAlt('1')).not.toThrow();
        expect(parent.querySelectorAll('.shell-overlay').length).toBe(0);
    });

    it('ignores a second mount() call instead of re-attaching over permanently torn-down panels', () => {
        const host = createHost();
        const { parent, shell } = mount(host);

        expect(parent.querySelectorAll('.shell-overlay').length).toBe(4);
        const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

        shell.mount(parent);

        // a second mount() must not duplicate the panels or re-attach the keydown listener -
        // ShellOverlay.rendered and EffectPanel.destroyed are one-way, so a second real mount
        // pass would leave the effect panel permanently inert underneath a shell that reports
        // itself mounted.
        expect(parent.querySelectorAll('.shell-overlay').length).toBe(4);
        expect(addEventListenerSpy).not.toHaveBeenCalledWith('keydown', expect.anything());

        addEventListenerSpy.mockRestore();
    });
});
