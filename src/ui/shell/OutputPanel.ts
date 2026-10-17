import { outputSettingsControls } from '../outputSettings';
import type { ShellHost } from './ShellHost';
import { ShellOverlay } from './ShellOverlay';

export class OutputPanel extends ShellOverlay {
    public constructor(private readonly host: ShellHost) {
        super('output-panel', 'Output & Preview');
    }
    protected override renderBody(body: HTMLElement): void {
        if (this.host.getOutputSettings === undefined || this.host.setOutputSettings === undefined) return;
        const apply = this.host.setOutputSettings.bind(this.host);
        body.append(
            outputSettingsControls(this.host.getOutputSettings(), settings => {
                apply(settings);
                const shell = body.closest<HTMLElement>('.shell');
                if (shell !== null) shell.style.setProperty('zoom', String(settings.uiScale));
            })
        );
    }
}
