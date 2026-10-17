// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type { CompatibilityReport } from '../../../runtime/diagnostics/CompatibilityReport';
import { CompatibilityPanel } from '../CompatibilityPanel';
import type { ShellHost, ShellRuntimeState } from '../ShellHost';

function createHost(): {
    host: ShellHost;
    push: (report: CompatibilityReport | null) => void;
    unsubscribed: () => boolean;
} {
    let listener: ((state: ShellRuntimeState) => void) | null = null;
    let unsubscribed = false;
    const host = {
        listEffects: vi.fn().mockResolvedValue([]),
        subscribeState: vi.fn((next: (state: ShellRuntimeState) => void) => {
            listener = next;
            return () => {
                unsubscribed = true;
            };
        }),
        subscribeDiagnostics: vi.fn(() => () => undefined),
        switchEffect: vi.fn(),
        setControl: vi.fn(),
        applyPreset: vi.fn(),
        fireBang: vi.fn(),
    } as unknown as ShellHost;
    return {
        host,
        push: report =>
            listener?.({ activeEffectId: null, controls: [], presets: [], controlValues: {}, compatibility: report }),
        unsubscribed: () => unsubscribed,
    };
}

const CONVERTED: CompatibilityReport = {
    effectId: 'com.test.ssf',
    level: 'degraded',
    source: { format: 'ssf', version: '1' },
    profile: 'ssf/1',
    mode: 'preserve',
    converter: 'blinkfx-ssf-converter/1',
    features: [
        { feature: 'script:ssf/1', status: 'available', declared: true, strategy: null },
        { feature: 'float-targets', status: 'downgraded', declared: false, strategy: 'rgba8' },
    ],
    notes: ['numerical parity is not claimed'],
};

function mounted() {
    const harness = createHost();
    const panel = new CompatibilityPanel(harness.host);
    const parent = document.createElement('div');
    panel.mount(parent);
    const text = (): string => parent.textContent ?? '';
    return { ...harness, panel, parent, text };
}

describe('CompatibilityPanel', () => {
    it('says so when no effect is loaded', () => {
        const { push, text } = mounted();
        push(null);
        expect(text()).toContain('Kein Effekt geladen.');
    });

    it('shows provenance, capability outcomes and notes for a converted effect', () => {
        const { push, parent, text } = mounted();
        push(CONVERTED);

        expect(text()).toContain('Eingeschränkt');
        expect(text()).toContain('ssf 1');
        expect(text()).toContain('ssf/1');
        expect(text()).toContain('blinkfx-ssf-converter/1');
        expect(text()).toContain('numerical parity is not claimed');

        const downgraded = parent.querySelector<HTMLElement>('[data-feature="float-targets"]');
        expect(downgraded?.dataset.status).toBe('downgraded');
        expect(downgraded?.title).toBe('Fallback: rgba8');
        expect(parent.querySelector<HTMLElement>('[data-feature="script:ssf/1"]')?.textContent).toContain('verfügbar');
    });

    it('shows a native effect without provenance rows', () => {
        const { push, text } = mounted();
        push({
            ...CONVERTED,
            level: 'native',
            source: null,
            profile: null,
            mode: null,
            converter: null,
            features: [],
            notes: [],
        });

        expect(text()).toContain('Nativ');
        expect(text()).not.toContain('Konverter');
    });

    it('replaces the previous effect rather than appending to it', () => {
        const { push, text } = mounted();
        push(CONVERTED);
        push({ ...CONVERTED, effectId: 'x', features: [], notes: [] });

        expect(text()).not.toContain('float-targets');
    });

    it('releases its subscription on unmount', () => {
        const { panel, unsubscribed } = mounted();
        panel.unmount();
        expect(unsubscribed()).toBe(true);
    });
});
