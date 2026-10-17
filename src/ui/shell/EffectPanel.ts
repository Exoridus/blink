import type { BlinkFxPackageList, BlinkFxPackageListItem } from '../../services/BlinkFxService';
import { groupEffects } from '../effectGroups';
import { ErrorCard } from '../ErrorCard';
import { describeFault } from './faultText';
import type { ShellHost, ShellRuntimeState, Unsubscribe } from './ShellHost';
import { ShellOverlay } from './ShellOverlay';

const PANEL_ID = 'effect-panel';
const PANEL_TITLE = 'Effekt';

function describeError(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

/**
 * The only path to another effect: lists every package the host knows about, marks the running
 * one, and switches on click. Starts expanded because a collapsed switcher is a dead end - there
 * is no other way to reach it.
 */
export class EffectPanel extends ShellOverlay {
    private readonly host: ShellHost;
    private readonly errorCard = new ErrorCard();
    private faultSignature = '';
    private showingFault = false;
    private readonly entries = new Map<string, HTMLButtonElement>();
    private readonly removeButtons = new Set<HTMLButtonElement>();

    private unsubscribe: Unsubscribe | null = null;
    private activeEffectId: string | null = null;

    private statusElement!: HTMLElement;
    private faultElement!: HTMLElement;
    private listElement!: HTMLUListElement;
    private installButton!: HTMLButtonElement;
    private reloadButton!: HTMLButtonElement;
    private fileInput!: HTMLInputElement;

    // Guards against a double click starting a second switchEffect() while the first is still
    // in flight - the entries are also disabled meanwhile, but this is the authoritative check.
    private switching = false;

    // loadEffects() and handleSelect() both await a host call before touching the DOM; if
    // unmount() runs while one is in flight, its continuation must not write into elements
    // ShellOverlay.unmount() already detached.
    private destroyed = false;

    public constructor(host: ShellHost) {
        super(PANEL_ID, PANEL_TITLE, { startCollapsed: false });
        this.host = host;
    }

    public mount(parent: HTMLElement): void {
        super.mount(parent);
        this.errorCard.mount(parent);
    }

    public unmount(): void {
        this.destroyed = true;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.errorCard.unmount();
        super.unmount();
    }

    protected renderBody(body: HTMLElement): void {
        this.statusElement = document.createElement('div');
        this.statusElement.className = 'effect-panel__status';

        this.faultElement = document.createElement('div');
        this.faultElement.className = 'effect-panel__faults';

        this.listElement = document.createElement('ul');
        this.listElement.className = 'effect-panel__list';

        body.append(this.statusElement, this.faultElement, this.listElement, this.buildInstallRow());

        this.unsubscribe = this.host.subscribeState(this.handleState);

        void this.loadEffects();
    }

    private buildInstallRow(): HTMLElement {
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.blinkfx,.zip';
        this.fileInput.hidden = true;
        this.fileInput.addEventListener('change', () => {
            const file = this.fileInput.files?.[0];
            if (file !== undefined) {
                void this.handleInstall(file);
            }
        });

        this.installButton = document.createElement('button');
        this.installButton.type = 'button';
        this.installButton.className = 'effect-panel__install';
        this.installButton.textContent = 'Paket installieren...';
        this.installButton.title =
            'Pakete koennen Skripte enthalten, die mit den Rechten dieser Seite laufen. Nur Pakete aus vertrauenswuerdigen Quellen installieren.';
        this.installButton.addEventListener('click', () => this.fileInput.click());

        this.reloadButton = document.createElement('button');
        this.reloadButton.type = 'button';
        this.reloadButton.className = 'effect-panel__reload';
        this.reloadButton.title = 'Effektliste neu laden';
        this.reloadButton.setAttribute('aria-label', 'Effektliste neu laden');
        this.reloadButton.hidden = this.host.reloadEffects === undefined;
        this.reloadButton.innerHTML =
            '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7M20 12l-4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        this.reloadButton.addEventListener('click', () => {
            void this.handleReload();
        });

        const row = document.createElement('div');
        row.className = 'effect-panel__install-row';
        row.append(this.installButton, this.reloadButton, this.fileInput);
        return row;
    }

    private async loadEffects(): Promise<void> {
        this.switching = true;
        this.setBusy(true);
        this.setStatus('Lade Effektliste...');
        try {
            const packages = await this.host.listEffects();
            if (this.destroyed) {
                return;
            }
            this.renderEntries(packages);
            this.setStatus('');
        } catch (error) {
            if (this.destroyed) {
                return;
            }
            this.setStatus(describeError(error, 'Effektliste konnte nicht geladen werden.'), true);
        } finally {
            if (!this.destroyed) {
                this.switching = false;
                this.setBusy(false);
            }
        }
    }

    private renderEntries(packages: BlinkFxPackageList): void {
        this.listElement.replaceChildren();
        this.entries.clear();
        this.removeButtons.clear();

        for (const group of groupEffects(packages)) {
            const heading = document.createElement('li');
            heading.className = 'effect-panel__group-title';
            heading.textContent = group.label;
            this.listElement.appendChild(heading);

            for (const pkg of group.packages) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'effect-panel__entry';
                button.textContent = pkg.title;
                button.title = pkg.description;
                button.addEventListener('click', () => {
                    void this.handleSelect(pkg);
                });

                const item = document.createElement('li');
                item.className = 'effect-panel__item';
                item.appendChild(button);
                if (pkg.installed === true) {
                    item.appendChild(this.buildRemoveButton(pkg));
                }

                this.listElement.appendChild(item);
                this.entries.set(pkg.id, button);
            }
        }

        this.markActive();
    }

    // The host pushes the active effect, so this panel never asks for it - not even right after
    // its own switchEffect(), which resolves only once the new state has been pushed.
    private readonly handleState = (state: ShellRuntimeState): void => {
        if (state.activeEffectId !== this.activeEffectId) {
            this.errorCard.clear();
            this.showingFault = false;
            this.faultSignature = '';
        }
        this.activeEffectId = state.activeEffectId;
        this.markActive();
        this.renderFaults(state);
    };

    // Shown here rather than in the diagnostics panel because that one starts collapsed, and a
    // switched-off script or render pass must not go unnoticed behind a closed panel.
    private renderFaults(state: ShellRuntimeState): void {
        const faults = state.faults ?? [];
        const signature = JSON.stringify(
            faults.map(({ source, kind, message, disabled }) => ({ source, kind, message, disabled }))
        );
        if (signature !== this.faultSignature) {
            this.faultSignature = signature;
            if (faults.length > 0) {
                this.showingFault = true;
                this.errorCard.show(faults.map(describeFault).join('\n'));
            } else if (this.showingFault) {
                this.showingFault = false;
                this.errorCard.clear();
            }
        }
        this.faultElement.replaceChildren(
            ...(state.faults ?? []).map(fault => {
                const line = document.createElement('div');
                line.className = fault.disabled
                    ? 'effect-panel__fault effect-panel__fault--disabled'
                    : 'effect-panel__fault';
                line.textContent = describeFault(fault);
                return line;
            })
        );
    }

    private async handleSelect(pkg: BlinkFxPackageListItem): Promise<void> {
        if (this.switching || pkg.id === this.activeEffectId) {
            return;
        }

        this.switching = true;
        this.setBusy(true);
        this.setStatus(`Lade "${pkg.title}"...`);

        try {
            await this.host.switchEffect(pkg.id);
            if (this.destroyed) {
                return;
            }
            this.setStatus('');
        } catch (error) {
            if (this.destroyed) {
                return;
            }
            this.setStatus(describeError(error, `"${pkg.title}" konnte nicht geladen werden.`), true);
        } finally {
            if (!this.destroyed) {
                this.switching = false;
                this.setBusy(false);
            }
        }
    }

    private buildRemoveButton(pkg: BlinkFxPackageListItem): HTMLButtonElement {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'effect-panel__remove';
        remove.textContent = 'x';
        remove.title = `"${pkg.title}" entfernen`;
        remove.setAttribute('aria-label', `"${pkg.title}" entfernen`);
        remove.addEventListener('click', () => {
            void this.handleRemove(pkg);
        });
        this.removeButtons.add(remove);
        return remove;
    }

    // Installing and removing share the in-flight guard with switching: while any of them runs the
    // list is about to change, and a second action started on the old list would act on a stale one.
    private async runExclusive(message: string, work: () => Promise<string>, failure: string): Promise<void> {
        if (this.switching) {
            return;
        }
        this.switching = true;
        this.setBusy(true);
        this.setStatus(message);
        try {
            const done = await work();
            if (!this.destroyed) {
                this.setStatus(done);
            }
        } catch (error) {
            if (!this.destroyed) {
                this.setStatus(describeError(error, failure), true);
            }
        } finally {
            if (!this.destroyed) {
                this.switching = false;
                this.fileInput.value = '';
                this.setBusy(false);
            }
        }
    }

    private async handleReload(): Promise<void> {
        const reloadEffects = this.host.reloadEffects?.bind(this.host);
        if (reloadEffects === undefined) return;
        await this.runExclusive(
            'Lade Effektliste...',
            async () => {
                const packages = await reloadEffects();
                if (!this.destroyed) this.renderEntries(packages);
                return '';
            },
            'Effektliste konnte nicht geladen werden.'
        );
    }

    private async handleInstall(file: File): Promise<void> {
        await this.runExclusive(
            `Installiere "${file.name}"...`,
            async () => {
                const installed = await this.host.installPackage(new Uint8Array(await file.arrayBuffer()));
                await this.refreshEntries();
                return `"${installed.title}" installiert.`;
            },
            `"${file.name}" konnte nicht installiert werden.`
        );
    }

    private async handleRemove(pkg: BlinkFxPackageListItem): Promise<void> {
        await this.runExclusive(
            `Entferne "${pkg.title}"...`,
            async () => {
                await this.host.removePackage(pkg.id);
                await this.refreshEntries();
                return `"${pkg.title}" entfernt.`;
            },
            `"${pkg.title}" konnte nicht entfernt werden.`
        );
    }

    private async refreshEntries(): Promise<void> {
        const packages = await this.host.listEffects();
        if (!this.destroyed) {
            this.renderEntries(packages);
        }
    }

    private markActive(): void {
        for (const [id, button] of this.entries) {
            button.classList.toggle('effect-panel__entry--active', id === this.activeEffectId);
        }
    }

    private setBusy(busy: boolean): void {
        for (const button of [...this.entries.values(), ...this.removeButtons, this.installButton, this.reloadButton]) {
            button.disabled = busy;
        }
    }

    private setStatus(message: string, isError = false): void {
        this.statusElement.textContent = message;
        this.statusElement.classList.toggle('effect-panel__status--error', isError);
        if (isError && message.length > 0) {
            this.showingFault = false;
            this.errorCard.show(message);
        } else if (!this.showingFault) {
            this.errorCard.clear();
        }
    }
}
