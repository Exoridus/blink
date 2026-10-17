// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrameTimeReport, StageTiming } from '../../../runtime/health';
import type { BlinkDiagnosticsSnapshot } from '../../../runtime/render/diagnosticsSnapshot';
import { DebugPanel } from '../DebugPanel';
import type { ShellDiagnosticsEvent, ShellHost } from '../ShellHost';

const SNAPSHOT: BlinkDiagnosticsSnapshot = {
    fps: 59.9999,
    frame: 4200,
    time: 12.3456,
    deltaTime: 0.016137,
    screen: [1920, 1080],
    passes: [
        { name: 'bloom', resolution: [960, 540], format: 'rgba16f' },
        { name: 'composite', resolution: [1920, 1080], format: 'screen' },
    ],
    audio: { au_bass: 0.123456, au_mid: 0.7 },
};

interface FakeHost extends ShellHost {
    pushDiagnostics(event: ShellDiagnosticsEvent): void;
    diagnosticsListenerCount(): number;
}

function createHost(
    overrides: Partial<ShellHost> = {},
    initialEvent: ShellDiagnosticsEvent = { ok: true, snapshot: SNAPSHOT }
): FakeHost {
    const listeners = new Set<(event: ShellDiagnosticsEvent) => void>();
    let event = initialEvent;

    function pushDiagnostics(next: ShellDiagnosticsEvent): void {
        event = next;
        for (const listener of listeners) {
            listener(next);
        }
    }

    const base: FakeHost = {
        listEffects: vi.fn().mockResolvedValue([]),
        subscribeState: vi.fn().mockReturnValue(() => undefined),
        subscribeDiagnostics: vi.fn((listener: (event: ShellDiagnosticsEvent) => void) => {
            listeners.add(listener);
            listener(event);
            return () => listeners.delete(listener);
        }),
        switchEffect: vi.fn().mockResolvedValue(undefined),
        setControl: vi.fn(),
        applyPreset: vi.fn().mockRejectedValue(new Error('unknown preset')),
        fireBang: vi.fn(),
        installPackage: vi.fn(),
        removePackage: vi.fn(),
        pushDiagnostics,
        diagnosticsListenerCount: () => listeners.size,
    };

    return { ...base, ...overrides } as FakeHost;
}

function mount(host: ShellHost): { parent: HTMLElement; panel: DebugPanel; toggle: HTMLButtonElement } {
    const panel = new DebugPanel(host);
    const parent = document.createElement('div');
    panel.mount(parent);
    const toggle = parent.querySelector<HTMLButtonElement>('.shell-overlay__toggle')!;
    return { parent, panel, toggle };
}

function isCollapsed(parent: HTMLElement): boolean {
    return parent.querySelector('.shell-overlay')!.classList.contains('shell-overlay--collapsed');
}

function status(parent: HTMLElement): HTMLElement {
    return parent.querySelector('.debug-panel__status')!;
}

describe('DebugPanel', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts collapsed', () => {
        const { parent } = mount(createHost());
        expect(isCollapsed(parent)).toBe(true);
    });

    it('does not subscribe to diagnostics while collapsed', () => {
        const host = createHost();
        mount(host);

        expect(host.diagnosticsListenerCount()).toBe(0);
    });

    it('subscribes and paints immediately when mounted in an already-expanded, persisted state', () => {
        // Reaching the expanded state through toggle.click() exercises onCollapsedChange(),
        // never the isCollapsed() check renderBody() makes at mount - a panel reloaded with a
        // persisted "expanded" flag never gets a click at all.
        localStorage.setItem('blink.shell.debug-panel.collapsed', 'false');
        const host = createHost();
        const panel = new DebugPanel(host);
        const parent = document.createElement('div');

        panel.mount(parent);

        expect(host.diagnosticsListenerCount()).toBe(1);
        expect(parent.querySelector('[data-field="fps"]')!.textContent).toBe('60.0');
    });

    it('renders every diagnostics event pushed while expanded', () => {
        const host = createHost();
        const { parent, toggle } = mount(host);
        toggle.click();

        host.pushDiagnostics({ ok: true, snapshot: { ...SNAPSHOT, frame: 4201 } });
        expect(parent.querySelector('[data-field="frame"]')!.textContent).toBe('4201');

        host.pushDiagnostics({ ok: true, snapshot: { ...SNAPSHOT, frame: 4202 } });
        expect(parent.querySelector('[data-field="frame"]')!.textContent).toBe('4202');
    });

    it('unsubscribes from diagnostics as soon as the panel is collapsed again', () => {
        const host = createHost();
        const { toggle } = mount(host);

        toggle.click();
        expect(host.diagnosticsListenerCount()).toBe(1);

        toggle.click();
        expect(host.diagnosticsListenerCount()).toBe(0);
    });

    it('resubscribes and paints immediately after being expanded again', () => {
        const host = createHost();
        const { parent, toggle } = mount(host);

        toggle.click();
        toggle.click();
        toggle.click();

        expect(host.diagnosticsListenerCount()).toBe(1);
        expect(parent.querySelector('[data-field="fps"]')!.textContent).toBe('60.0');
    });

    it('unsubscribes from diagnostics on unmount', () => {
        const host = createHost();
        const { panel, toggle } = mount(host);

        toggle.click();
        expect(host.diagnosticsListenerCount()).toBe(1);

        panel.unmount();
        expect(host.diagnosticsListenerCount()).toBe(0);
    });

    it('renders fps, time and audio values at fixed decimal precision', () => {
        const { parent, toggle } = mount(createHost());

        toggle.click();

        expect(parent.querySelector('[data-field="fps"]')!.textContent).toBe('60.0');
        expect(parent.querySelector('[data-field="time"]')!.textContent).toBe('12.35');
        expect(parent.querySelector('[data-audio-key="au_bass"] .debug-panel__audio-value')!.textContent).toBe('0.123');
        expect(parent.querySelector('[data-audio-key="au_mid"] .debug-panel__audio-value')!.textContent).toBe('0.700');
    });

    it('renders the screen size and one row per pass with its resolution and format', () => {
        const { parent, toggle } = mount(createHost());

        toggle.click();

        expect(parent.querySelector('[data-field="screen"]')!.textContent).toBe('1920x1080');

        const bloom = parent.querySelector('[data-pass-name="bloom"] .debug-panel__pass-detail');
        expect(bloom!.textContent).toBe('960x540 - rgba16f');

        const composite = parent.querySelector('[data-pass-name="composite"] .debug-panel__pass-detail');
        expect(composite!.textContent).toBe('1920x1080 - screen');
    });

    it('paints immediately on expand instead of leaving a placeholder until the first push', () => {
        const { parent, toggle } = mount(createHost());

        toggle.click();

        expect(parent.querySelector('[data-field="fps"]')!.textContent).toBe('60.0');
    });

    it('renders an { ok: false } event as an inline status message', () => {
        const host = createHost();
        const { parent, toggle } = mount(host);
        toggle.click();

        host.pushDiagnostics({ ok: false, message: 'unknown render target "bloom"' });

        expect(status(parent).textContent).toBe('unknown render target "bloom"');
        expect(status(parent).classList.contains('debug-panel__status--error')).toBe(true);
    });

    it('does not rewrite the status line when the same failure event repeats', () => {
        const host = createHost();
        const { parent, toggle } = mount(host);
        toggle.click();

        host.pushDiagnostics({ ok: false, message: 'unknown render target "bloom"' });

        const statusElement = status(parent);
        statusElement.textContent = 'sentinel';

        // still repeating the exact same failure: nothing should have touched the status
        // element again, or a screen reader / DOM observer would see churn on every push for
        // information that has not actually changed.
        host.pushDiagnostics({ ok: false, message: 'unknown render target "bloom"' });

        expect(statusElement.textContent).toBe('sentinel');
    });

    it('clears the error and resumes rendering on the next ok event', () => {
        const host = createHost();
        const { parent, toggle } = mount(host);
        toggle.click();

        host.pushDiagnostics({ ok: false, message: 'unknown render target "bloom"' });
        expect(status(parent).textContent).toBe('unknown render target "bloom"');

        host.pushDiagnostics({ ok: true, snapshot: SNAPSHOT });

        expect(status(parent).textContent).toBe('');
        expect(status(parent).classList.contains('debug-panel__status--error')).toBe(false);
        expect(parent.querySelector('[data-field="fps"]')!.textContent).toBe('60.0');
    });

    it('falls back to a German placeholder message when a render failure carries no message', () => {
        const host = createHost();
        const { parent, toggle } = mount(host);
        toggle.click();

        const badSnapshot: BlinkDiagnosticsSnapshot = {
            ...SNAPSHOT,
            passes: {
                [Symbol.iterator]() {
                    // Deliberately not an Error: the fallback must trigger for a throw shaped like
                    // this, which is exactly what a plain thrown string looks like - the render()
                    // guard has to cover this, not just an Error with an empty message.

                    throw 'not an Error instance';
                },
            } as unknown as BlinkDiagnosticsSnapshot['passes'],
        };

        expect(() => host.pushDiagnostics({ ok: true, snapshot: badSnapshot })).not.toThrow();

        expect(status(parent).textContent).toBe('Diagnose konnte nicht dargestellt werden.');
    });

    describe('frame time and faults', () => {
        const stage = (meanMs: number, p95Ms: number, maxMs: number, budgetMs: number): StageTiming => ({
            meanMs,
            p95Ms,
            maxMs,
            budgetMs,
            overBudgetFrames: 0,
        });
        const frameTimes: FrameTimeReport = {
            frames: 120,
            frame: stage(4, 6, 9, 12),
            stages: {
                update: stage(1, 1.5, 2, 3),
                script: stage(0.5, 1, 2, 4),
                passes: stage(2.5, 7.25, 8, 6),
                audioOutput: stage(0, 0, 0, 2),
            },
            gpu: stage(5, 9, 14, 12),
        };

        function expanded(snapshot: BlinkDiagnosticsSnapshot): HTMLElement {
            localStorage.setItem('blink.shell.debug-panel.collapsed', 'false');
            const parent = document.createElement('div');
            new DebugPanel(createHost({}, { ok: true, snapshot })).mount(parent);
            return parent;
        }

        it('shows mean, p95 and worst case per stage against its budget, and marks a stage over budget', () => {
            const parent = expanded({ ...SNAPSHOT, frameTimes });

            const passes = parent.querySelector('[data-stage="Passes"]')!;
            expect(passes.textContent).toBe('Passes2.50 / 7.25 / 8.00 ms (Budget 6.00)');
            expect(passes.classList.contains('debug-panel__timing-row--over')).toBe(true);
            expect(
                parent.querySelector('[data-stage="Update"]')!.classList.contains('debug-panel__timing-row--over')
            ).toBe(false);
        });

        it('shows the GPU time like a stage, or says it is unavailable', () => {
            const measured = expanded({ ...SNAPSHOT, frameTimes });
            expect(measured.querySelector('[data-stage="GPU"]')!.textContent).toBe(
                'GPU5.00 / 9.00 / 14.00 ms (Budget 12.00)'
            );
            expect(
                measured.querySelector('[data-stage="GPU"]')!.classList.contains('debug-panel__timing-row--over')
            ).toBe(false);

            const unavailable = expanded({ ...SNAPSHOT, frameTimes: { ...frameTimes, gpu: null } });
            expect(unavailable.querySelector('[data-stage="GPU"]')!.textContent).toBe('GPUnicht verfügbar');
        });

        it('shows the engine estimate of GPU memory, or a placeholder without one', () => {
            expect(
                expanded({ ...SNAPSHOT, gpuMemoryBytes: 150 * 1024 * 1024 }).querySelector('[data-field="gpuMemory"]')!
                    .textContent
            ).toBe('150.0 MiB');
            expect(expanded(SNAPSHOT).querySelector('[data-field="gpuMemory"]')!.textContent).toBe('-');
        });

        it('shows no timing rows before the first frame was measured', () => {
            const parent = expanded({ ...SNAPSHOT, frameTimes: { ...frameTimes, frames: 0 } });

            expect(parent.querySelectorAll('.debug-panel__timing-row')).toHaveLength(0);
        });

        it('hides the fault section while nothing failed and lists each fault otherwise', () => {
            const healthy = expanded({ ...SNAPSHOT, faults: [] });
            expect(healthy.querySelector<HTMLElement>('.debug-panel__faults')!.parentElement!.hidden).toBe(true);

            const failing = expanded({
                ...SNAPSHOT,
                faults: [{ source: 'ssfScript', kind: 'error', message: 'script bug', occurrences: 3, disabled: true }],
            });
            expect(failing.querySelector<HTMLElement>('.debug-panel__faults')!.parentElement!.hidden).toBe(false);
            const row = failing.querySelector('[data-fault-source="ssfScript"]')!;
            expect(row.textContent).toBe('SSF-Skript abgeschaltet: script bug');
            expect(row.classList.contains('debug-panel__fault--disabled')).toBe(true);
        });
    });
});
