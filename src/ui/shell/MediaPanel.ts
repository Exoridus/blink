import type { ShellHost, ShellRuntimeState, Unsubscribe } from './ShellHost';
import { ShellOverlay } from './ShellOverlay';

const NO_MEDIA_INPUT = 'Der laufende Effekt nutzt keine Medienquelle.';

/**
 * Chooses the camera, a video or an image as the source of effects that sample an external image.
 * Renders nothing actionable while the running effect declares no such input.
 */
export class MediaPanel extends ShellOverlay {
    private readonly host: ShellHost;
    private unsubscribe: Unsubscribe | null = null;
    private content!: HTMLElement;
    private fileInput!: HTMLInputElement;
    private cameraButton!: HTMLButtonElement;
    private fileButton!: HTMLButtonElement;
    private clearButton!: HTMLButtonElement;
    private status!: HTMLElement;

    public constructor(host: ShellHost) {
        super('media-panel', 'Medien', { startCollapsed: true });
        this.host = host;
    }

    protected renderBody(body: HTMLElement): void {
        this.content = document.createElement('div');
        this.content.className = 'media-panel';

        this.cameraButton = this.button('Kamera', () => this.run(() => this.host.useMediaCamera?.()));
        this.fileButton = this.button('Datei...', () => this.fileInput.click());
        this.clearButton = this.button('Aus', () => this.host.clearMedia?.());

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'video/*,image/*';
        this.fileInput.hidden = true;
        this.fileInput.addEventListener('change', () => {
            const file = this.fileInput.files?.[0];
            this.fileInput.value = '';
            if (file !== undefined) void this.run(() => this.host.useMediaFile?.(file));
        });

        this.status = document.createElement('p');
        this.status.className = 'media-panel__status';
        this.status.setAttribute('role', 'status');

        const row = document.createElement('div');
        row.className = 'media-panel__actions';
        row.append(this.cameraButton, this.fileButton, this.clearButton, this.fileInput);
        this.content.append(row, this.status);
        body.append(this.content);
        this.unsubscribe = this.host.subscribeState(this.handleState);
    }

    public unmount(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        super.unmount();
    }

    private button(label: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', onClick);
        return button;
    }

    private async run(action: () => Promise<void> | undefined): Promise<void> {
        try {
            await action();
        } catch (error) {
            this.status.textContent = error instanceof Error ? error.message : 'Medienquelle nicht verfügbar.';
        }
    }

    private readonly handleState = (state: ShellRuntimeState): void => {
        const media = state.media;
        const usable = media !== undefined && media.inputs.length > 0;
        for (const button of [this.cameraButton, this.fileButton, this.clearButton]) button.disabled = !usable;
        if (!usable) {
            this.status.textContent = NO_MEDIA_INPUT;
        } else if (media.kind === 'none') {
            this.status.textContent = 'Keine Quelle gewählt; der Effekt zeigt ohne Medium nur seinen Hintergrund.';
        } else {
            this.status.textContent = `Quelle: ${media.label}`;
        }
    };
}
