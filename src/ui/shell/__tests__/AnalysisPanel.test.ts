// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { AnalysisPanel } from '../AnalysisPanel';
import type { ShellHost, ShellRuntimeState } from '../ShellHost';

function setup(setAnalysisMode = vi.fn().mockResolvedValue(undefined)) {
    let listener: ((state: ShellRuntimeState) => void) | null = null;
    const host = {
        subscribeState: vi.fn((next: (state: ShellRuntimeState) => void) => {
            listener = next;
            return () => undefined;
        }),
        setAnalysisMode,
    } as unknown as ShellHost;
    const parent = document.createElement('div');
    document.body.append(parent);
    new AnalysisPanel(host).mount(parent);
    const push = (analysis: ShellRuntimeState['analysis']): void =>
        listener?.({ activeEffectId: 'x', controls: [], presets: [], controlValues: {}, analysis });
    const radio = (mode: string): HTMLInputElement => parent.querySelector<HTMLInputElement>(`input[value="${mode}"]`)!;
    return { parent, push, radio, setAnalysisMode };
}

describe('AnalysisPanel', () => {
    it('marks the active mode and explains when the effect ignores it', () => {
        const { parent, push, radio } = setup();
        push({ mode: 'enhanced', applicable: false });

        expect(radio('enhanced').checked).toBe(true);
        expect(radio('original').checked).toBe(false);
        expect(parent.querySelector('.analysis-panel__status')?.textContent).toContain(
            'nur für konvertierte SSF-Effekte'
        );
    });

    it('asks the host to switch when another mode is chosen', () => {
        const { push, radio, setAnalysisMode } = setup();
        push({ mode: 'original', applicable: true });

        radio('current').click();
        expect(setAnalysisMode).toHaveBeenCalledWith('current');
    });

    it('shows the reason when the switch is rejected', async () => {
        const { parent, push, radio } = setup(vi.fn().mockRejectedValue(new Error('Wechsel fehlgeschlagen')));
        push({ mode: 'original', applicable: true });

        radio('enhanced').click();
        await vi.waitFor(() =>
            expect(parent.querySelector('.analysis-panel__status')?.textContent).toBe('Wechsel fehlgeschlagen')
        );
    });
});
