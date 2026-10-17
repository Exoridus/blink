import { ANALYSIS_MODES, type AnalysisMode } from '../../runtime/compat/analysisMode';
import type { ShellHost, ShellRuntimeState, Unsubscribe } from './ShellHost';
import { ShellOverlay } from './ShellOverlay';

const MODE_LABELS: Readonly<Record<AnalysisMode, { readonly title: string; readonly detail: string }>> = {
    current: { title: 'Aktuell', detail: 'Blink-Analyse, auf die syn_*-Werte abgebildet' },
    enhanced: { title: 'Neu', detail: 'SSF-Rekonstruktion mit ExoJS-Tempo' },
    original: { title: 'SSF Original', detail: 'Rekonstruktion der Synesthesia-Analyse' },
};

const NOT_APPLICABLE = 'Der laufende Effekt nutzt die Analyse nicht; sie gilt nur für konvertierte SSF-Effekte.';

/** Switches the audio analysis that feeds the `syn_*` values of converted SSF effects. */
export class AnalysisPanel extends ShellOverlay {
    private readonly host: ShellHost;
    private unsubscribe: Unsubscribe | null = null;
    private readonly inputs = new Map<AnalysisMode, HTMLInputElement>();
    private status!: HTMLElement;
    private busy = false;

    public constructor(host: ShellHost) {
        super('analysis-panel', 'Audio-Analyse', { startCollapsed: true });
        this.host = host;
    }

    protected renderBody(body: HTMLElement): void {
        const group = document.createElement('div');
        group.className = 'analysis-panel';
        group.setAttribute('role', 'radiogroup');
        for (const mode of ANALYSIS_MODES) {
            const label = document.createElement('label');
            label.className = 'analysis-panel__option';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'analysis-mode';
            input.value = mode;
            input.addEventListener('change', () => void this.select(mode));
            const text = document.createElement('span');
            text.textContent = `${MODE_LABELS[mode].title} - ${MODE_LABELS[mode].detail}`;
            label.append(input, text);
            group.append(label);
            this.inputs.set(mode, input);
        }
        this.status = document.createElement('p');
        this.status.className = 'analysis-panel__status';
        this.status.setAttribute('role', 'status');
        body.append(group, this.status);
        this.unsubscribe = this.host.subscribeState(this.handleState);
    }

    public unmount(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        super.unmount();
    }

    private async select(mode: AnalysisMode): Promise<void> {
        this.busy = true;
        this.status.textContent = 'Wechsle Analyse...';
        try {
            await this.host.setAnalysisMode?.(mode);
            this.status.textContent = '';
        } catch (error) {
            this.status.textContent =
                error instanceof Error ? error.message : 'Analyse konnte nicht gewechselt werden.';
        } finally {
            this.busy = false;
        }
    }

    private readonly handleState = (state: ShellRuntimeState): void => {
        const analysis = state.analysis;
        for (const [mode, input] of this.inputs) {
            input.checked = analysis?.mode === mode;
            input.disabled = analysis === undefined;
        }
        if (!this.busy) this.status.textContent = analysis?.applicable === false ? NOT_APPLICABLE : '';
    };
}
