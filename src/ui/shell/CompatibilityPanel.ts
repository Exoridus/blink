import type {
    CompatibilityFeatureLine,
    CompatibilityLevel,
    CompatibilityReport,
} from '../../runtime/diagnostics/CompatibilityReport';
import type { ShellHost, ShellRuntimeState, Unsubscribe } from './ShellHost';
import { ShellOverlay } from './ShellOverlay';

const PANEL_ID = 'compatibility-panel';
const PANEL_TITLE = 'Kompatibilität';

const LEVEL_LABELS: Readonly<Record<CompatibilityLevel, string>> = {
    native: 'Nativ',
    compatible: 'Konvertiert',
    degraded: 'Eingeschränkt',
};

const STATUS_LABELS: Readonly<Record<CompatibilityFeatureLine['status'], string>> = {
    available: 'verfügbar',
    disabled: 'abgeschaltet',
    downgraded: 'herabgestuft',
    failed: 'fehlgeschlagen',
};

const NO_EFFECT = 'Kein Effekt geladen.';
const NATIVE_NOTE = 'Für Blink geschrieben, keine Quellformat-Anpassung.';

/**
 * Where the running effect came from and how faithfully it runs: source format, profile, the
 * converter, how each capability it needs was resolved, and the profile's standing caveats.
 *
 * Renders the compatibility report the host pushes with the runtime state. There is no polling:
 * the report only changes when the effect does.
 */
export class CompatibilityPanel extends ShellOverlay {
    private readonly host: ShellHost;
    private contentElement!: HTMLElement;
    private unsubscribe: Unsubscribe | null = null;

    public constructor(host: ShellHost) {
        super(PANEL_ID, PANEL_TITLE, { startCollapsed: true });
        this.host = host;
    }

    protected renderBody(body: HTMLElement): void {
        this.contentElement = document.createElement('div');
        this.contentElement.className = 'compatibility-panel';
        this.contentElement.textContent = NO_EFFECT;
        body.appendChild(this.contentElement);
        this.unsubscribe = this.host.subscribeState(this.handleState);
    }

    public unmount(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        super.unmount();
    }

    private readonly handleState = (state: ShellRuntimeState): void => {
        this.render(state.compatibility ?? null);
    };

    private render(report: CompatibilityReport | null): void {
        this.contentElement.replaceChildren();
        if (report === null) {
            this.contentElement.textContent = NO_EFFECT;
            return;
        }

        const level = document.createElement('div');
        level.className = `compatibility-panel__level compatibility-panel__level--${report.level}`;
        level.textContent = LEVEL_LABELS[report.level];
        this.contentElement.appendChild(level);

        if (report.level === 'native') {
            this.contentElement.appendChild(this.line(NATIVE_NOTE, 'note'));
        } else {
            this.contentElement.append(
                this.row(
                    'Quelle',
                    report.source === null ? '-' : `${report.source.format} ${report.source.version ?? ''}`.trim()
                ),
                this.row('Profil', report.profile ?? '-'),
                this.row('Modus', report.mode ?? '-'),
                this.row('Konverter', report.converter ?? '-')
            );
        }

        if (report.features.length > 0) {
            this.contentElement.appendChild(this.heading('Fähigkeiten'));
            for (const feature of report.features) {
                this.contentElement.appendChild(this.featureRow(feature));
            }
        }
        if (report.notes.length > 0) {
            this.contentElement.appendChild(this.heading('Hinweise'));
            for (const note of report.notes) {
                this.contentElement.appendChild(this.line(note, 'note'));
            }
        }
    }

    private heading(text: string): HTMLElement {
        const element = document.createElement('h3');
        element.className = 'compatibility-panel__heading';
        element.textContent = text;
        return element;
    }

    private line(text: string, kind: string): HTMLElement {
        const element = document.createElement('div');
        element.className = `compatibility-panel__${kind}`;
        element.textContent = text;
        return element;
    }

    private row(label: string, value: string): HTMLElement {
        const row = document.createElement('div');
        row.className = 'compatibility-panel__row';
        const labelElement = document.createElement('span');
        labelElement.className = 'compatibility-panel__label';
        labelElement.textContent = label;
        const valueElement = document.createElement('span');
        valueElement.className = 'compatibility-panel__value';
        valueElement.textContent = value;
        row.append(labelElement, valueElement);
        return row;
    }

    private featureRow(feature: CompatibilityFeatureLine): HTMLElement {
        const row = this.row(feature.feature, STATUS_LABELS[feature.status]);
        row.dataset.feature = feature.feature;
        row.dataset.status = feature.status;
        if (feature.strategy !== null) {
            row.title = `Fallback: ${feature.strategy}`;
        }
        return row;
    }
}
