import type { FaultRecord, FrameTimeReport, StageTiming } from '../../runtime/health';
import type { BlinkDiagnosticsSnapshot } from '../../runtime/render/diagnosticsSnapshot';
import type { PassDiagnostics } from '../../runtime/render/pass';
import { describeFault } from './faultText';
import type { ShellDiagnosticsEvent, ShellHost, Unsubscribe } from './ShellHost';
import { ShellOverlay } from './ShellOverlay';

const PANEL_ID = 'debug-panel';
const PANEL_TITLE = 'Diagnose';

const FPS_LABEL = 'FPS';
const FRAME_LABEL = 'Frame';
const TIME_LABEL = 'Zeit';
const SCREEN_LABEL = 'Auflösung';
const PASSES_TITLE = 'Passes';
const AUDIO_TITLE = 'Audio';
const TIMING_TITLE = 'Frame-Zeit (CPU)';
const FAULTS_TITLE = 'Störungen';
const TIMING_ROWS: ReadonlyArray<readonly [label: string, pick: (report: FrameTimeReport) => StageTiming]> = [
    ['Frame', report => report.frame],
    ['Update', report => report.stages.update],
    ['Skript', report => report.stages.script],
    ['Passes', report => report.stages.passes],
    ['Audioausgabe', report => report.stages.audioOutput],
];
const TIMING_DECIMALS = 2;
const GPU_LABEL = 'GPU';
const GPU_UNAVAILABLE = 'nicht verfügbar';
const GPU_MEMORY_LABEL = 'GPU-Speicher';
const BYTES_PER_MIB = 1024 * 1024;
const GPU_MEMORY_DECIMALS = 1;
const PLACEHOLDER = '-';

const FPS_DECIMALS = 1;
const TIME_DECIMALS = 2;
const AUDIO_DECIMALS = 3;

function formatFixed(value: number, decimals: number): string {
    return value.toFixed(decimals);
}

function formatSize([width, height]: readonly [number, number]): string {
    return `${Math.round(width)}x${Math.round(height)}`;
}

/**
 * Read-only view onto the render path's diagnostics snapshot: fps, frame counter, elapsed time,
 * screen size, one row per compiled pass, and the au_* audio block. Every value renders at a
 * fixed decimal precision so the panel does not jitter into unreadability as numbers wobble
 * frame to frame.
 *
 * Renders what the host pushes, and only while the body is visible:
 * `ShellOverlay.onCollapsedChange` subscribes and unsubscribes, so a collapsed panel costs
 * nothing beyond the header it always shows. The push rate belongs to the host - a panel that
 * throttled on its own would still be paying for snapshots it discards.
 */
export class DebugPanel extends ShellOverlay {
    private readonly host: ShellHost;

    private statusElement!: HTMLElement;
    private fpsElement!: HTMLElement;
    private frameElement!: HTMLElement;
    private timeElement!: HTMLElement;
    private screenElement!: HTMLElement;
    private gpuMemoryElement!: HTMLElement;
    private passesElement!: HTMLElement;
    private audioElement!: HTMLElement;
    private timingElement!: HTMLElement;
    private faultsSection!: HTMLElement;
    private faultsElement!: HTMLElement;

    private unsubscribe: Unsubscribe | null = null;

    // Tracks the last error shown so a repeating failure (the same undeclared render target,
    // the same non-numeric audio value) does not rewrite the status line at the host's push
    // rate - the message would be identical on every event, so there is nothing new to show and
    // no reason to keep re-triggering the DOM write.
    private lastErrorMessage: string | null = null;

    public constructor(host: ShellHost) {
        super(PANEL_ID, PANEL_TITLE, { startCollapsed: true });
        this.host = host;
    }

    protected renderBody(body: HTMLElement): void {
        this.statusElement = document.createElement('div');
        this.statusElement.className = 'debug-panel__status';

        const fps = this.buildMetric(FPS_LABEL, 'fps');
        const frame = this.buildMetric(FRAME_LABEL, 'frame');
        const time = this.buildMetric(TIME_LABEL, 'time');
        const screen = this.buildMetric(SCREEN_LABEL, 'screen');
        this.fpsElement = fps.value;
        this.frameElement = frame.value;
        this.timeElement = time.value;
        this.screenElement = screen.value;
        const gpuMemory = this.buildMetric(GPU_MEMORY_LABEL, 'gpuMemory');
        this.gpuMemoryElement = gpuMemory.value;

        const metrics = document.createElement('div');
        metrics.className = 'debug-panel__metrics';
        metrics.append(fps.row, frame.row, time.row, screen.row, gpuMemory.row);

        this.passesElement = document.createElement('div');
        this.passesElement.className = 'debug-panel__passes';

        this.audioElement = document.createElement('div');
        this.audioElement.className = 'debug-panel__audio';

        this.timingElement = document.createElement('div');
        this.timingElement.className = 'debug-panel__timing';

        this.faultsElement = document.createElement('div');
        this.faultsElement.className = 'debug-panel__faults';
        this.faultsSection = this.buildSection(FAULTS_TITLE, this.faultsElement);
        this.faultsSection.hidden = true;

        body.append(
            this.statusElement,
            metrics,
            this.faultsSection,
            this.buildSection(TIMING_TITLE, this.timingElement),
            this.buildSection(PASSES_TITLE, this.passesElement),
            this.buildSection(AUDIO_TITLE, this.audioElement)
        );

        if (!this.isCollapsed()) {
            this.startListening();
        }
    }

    public unmount(): void {
        this.stopListening();
        super.unmount();
    }

    /**
     * Ties the subscription to the collapse state ShellOverlay owns: a hidden body would
     * otherwise keep the host pushing snapshots nothing renders.
     */
    protected onCollapsedChange(collapsed: boolean): void {
        if (collapsed) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }

    private buildMetric(label: string, field: string): { row: HTMLElement; value: HTMLElement } {
        const row = document.createElement('div');
        row.className = 'debug-panel__metric';

        const labelElement = document.createElement('span');
        labelElement.className = 'debug-panel__metric-label';
        labelElement.textContent = label;

        const valueElement = document.createElement('span');
        valueElement.className = 'debug-panel__metric-value';
        valueElement.dataset.field = field;
        valueElement.textContent = PLACEHOLDER;

        row.append(labelElement, valueElement);
        return { row, value: valueElement };
    }

    private buildSection(title: string, content: HTMLElement): HTMLElement {
        const section = document.createElement('div');
        section.className = 'debug-panel__section';

        const heading = document.createElement('h3');
        heading.className = 'debug-panel__section-title';
        heading.textContent = title;

        section.append(heading, content);
        return section;
    }

    // Idempotent: renderBody() and onCollapsedChange() can both call this on the same expanded
    // state (a persisted expanded panel starts already expanded), and a second subscription on
    // top of a live one would render every push twice and leak the first unsubscribe.
    private startListening(): void {
        if (this.unsubscribe !== null) {
            return;
        }
        this.unsubscribe = this.host.subscribeDiagnostics(this.handleEvent);
    }

    private stopListening(): void {
        if (this.unsubscribe === null) {
            return;
        }
        this.unsubscribe();
        this.unsubscribe = null;
    }

    // A throwing listener would propagate into the host's push loop and take the other
    // subscribers down with it, so every failure stops here and becomes a status line.
    private readonly handleEvent = (event: ShellDiagnosticsEvent): void => {
        if (!event.ok) {
            this.reportError(event.message);
            return;
        }
        try {
            this.render(event.snapshot);
            this.clearStatus();
        } catch (error) {
            this.reportError(
                error instanceof Error && error.message.length > 0
                    ? error.message
                    : 'Diagnose konnte nicht dargestellt werden.'
            );
        }
    };

    private clearStatus(): void {
        if (this.lastErrorMessage === null) {
            return;
        }
        this.lastErrorMessage = null;
        this.setStatus('');
    }

    private reportError(message: string): void {
        if (message === this.lastErrorMessage) {
            return;
        }
        this.lastErrorMessage = message;
        this.setStatus(message, true);
    }

    private setStatus(message: string, isError = false): void {
        this.statusElement.textContent = message;
        this.statusElement.classList.toggle('debug-panel__status--error', isError);
    }

    private render(snapshot: BlinkDiagnosticsSnapshot): void {
        this.fpsElement.textContent = formatFixed(snapshot.fps, FPS_DECIMALS);
        this.frameElement.textContent = String(snapshot.frame);
        this.timeElement.textContent = formatFixed(snapshot.time, TIME_DECIMALS);
        this.screenElement.textContent = formatSize(snapshot.screen);
        this.gpuMemoryElement.textContent =
            snapshot.gpuMemoryBytes === undefined
                ? PLACEHOLDER
                : `${formatFixed(snapshot.gpuMemoryBytes / BYTES_PER_MIB, GPU_MEMORY_DECIMALS)} MiB`;
        this.renderFaults(snapshot.faults ?? []);
        this.renderTiming(snapshot.frameTimes);
        this.renderPasses(snapshot.passes);
        this.renderAudio(snapshot.audio);
    }

    private renderFaults(faults: readonly FaultRecord[]): void {
        this.faultsSection.hidden = faults.length === 0;
        this.faultsElement.replaceChildren(
            ...faults.map(fault => {
                const row = document.createElement('div');
                row.className = 'debug-panel__fault';
                row.dataset.faultSource = fault.source;
                row.classList.toggle('debug-panel__fault--disabled', fault.disabled);
                row.textContent = describeFault(fault);
                return row;
            })
        );
    }

    // Mean, 95th percentile and worst case over the host's recent frames, against the stage budget.
    private renderTiming(report: FrameTimeReport | undefined): void {
        this.timingElement.replaceChildren();
        if (report === undefined || report.frames === 0) {
            return;
        }
        for (const [label, pick] of TIMING_ROWS) {
            this.appendTimingRow(label, pick(report));
        }
        this.appendTimingRow(GPU_LABEL, report.gpu);
    }

    private appendTimingRow(label: string, timing: StageTiming | null): void {
        const row = document.createElement('div');
        row.className = 'debug-panel__timing-row';
        row.dataset.stage = label;

        const name = document.createElement('span');
        name.className = 'debug-panel__timing-label';
        name.textContent = label;

        const value = document.createElement('span');
        value.className = 'debug-panel__timing-value';
        if (timing === null) {
            value.textContent = GPU_UNAVAILABLE;
        } else {
            row.classList.toggle('debug-panel__timing-row--over', timing.p95Ms > timing.budgetMs);
            const [mean, p95, max, budget] = [timing.meanMs, timing.p95Ms, timing.maxMs, timing.budgetMs].map(ms =>
                formatFixed(ms, TIMING_DECIMALS)
            );
            value.textContent = `${mean} / ${p95} / ${max} ms (Budget ${budget})`;
        }

        row.append(name, value);
        this.timingElement.appendChild(row);
    }

    private renderPasses(passes: readonly PassDiagnostics[]): void {
        this.passesElement.replaceChildren();
        for (const pass of passes) {
            const row = document.createElement('div');
            row.className = 'debug-panel__pass';
            row.dataset.passName = pass.name;

            const name = document.createElement('span');
            name.className = 'debug-panel__pass-name';
            name.textContent = pass.name;

            const detail = document.createElement('span');
            detail.className = 'debug-panel__pass-detail';
            detail.textContent = `${formatSize(pass.resolution)} - ${pass.format}`;

            row.append(name, detail);
            this.passesElement.appendChild(row);
        }
    }

    private renderAudio(audio: Readonly<Record<string, number>>): void {
        this.audioElement.replaceChildren();
        for (const [key, value] of Object.entries(audio)) {
            const row = document.createElement('div');
            row.className = 'debug-panel__audio-row';
            row.dataset.audioKey = key;

            const label = document.createElement('span');
            label.className = 'debug-panel__audio-label';
            label.textContent = key;

            const valueElement = document.createElement('span');
            valueElement.className = 'debug-panel__audio-value';
            valueElement.textContent = formatFixed(value, AUDIO_DECIMALS);

            row.append(label, valueElement);
            this.audioElement.appendChild(row);
        }
    }
}
