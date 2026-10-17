import './shell.scss';

import { CompatibilityPanel } from './CompatibilityPanel';
import { ControlPanel } from './ControlPanel';
import { DebugPanel } from './DebugPanel';
import { EffectPanel } from './EffectPanel';
import { OutputPanel } from './OutputPanel';
import type { ShellHost } from './ShellHost';

const EFFECT_PANEL_ID = 'effect-panel';
const CONTROL_PANEL_ID = 'control-panel';
const DEBUG_PANEL_ID = 'debug-panel';
const COMPATIBILITY_PANEL_ID = 'compatibility-panel';
const PANEL_IDS = [EFFECT_PANEL_ID, CONTROL_PANEL_ID, DEBUG_PANEL_ID, COMPATIBILITY_PANEL_ID, 'output-panel'] as const;

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
    );
}

/**
 * Assembles the three shell panels into one container that floats over the running effect and
 * owns the one thing `ShellHost` cannot express by itself: the keyboard shortcuts.
 *
 * Every panel gets the host unchanged. Cross-panel effects need no wiring here - an effect
 * switch reaches the control panel because the host pushes the new state, not because this
 * class tells it to.
 */
export class Shell {
    private readonly container: HTMLElement;
    private readonly effectPanel: EffectPanel;
    private readonly controlPanel: ControlPanel;
    private readonly debugPanel: DebugPanel;
    private readonly compatibilityPanel: CompatibilityPanel;
    private mounted = false;
    private readonly outputPanel: OutputPanel | null;

    // Alt avoids the single-letter menu mnemonics (Alt+F, Alt+E, ...) browsers and Windows
    // itself already own; a bare digit key would collide with typing inside a control field.
    private readonly handleKeydown = (event: KeyboardEvent): void => {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableTarget(event.target)) {
            return;
        }

        switch (event.key) {
            case '1':
                this.togglePanel(EFFECT_PANEL_ID);
                break;
            case '2':
                this.togglePanel(CONTROL_PANEL_ID);
                break;
            case '3':
                this.togglePanel(DEBUG_PANEL_ID);
                break;
            case '4':
                this.togglePanel(COMPATIBILITY_PANEL_ID);
                break;
            case '5':
                this.togglePanel('output-panel');
                break;
            case '0':
                this.collapseAll();
                break;
            default:
                return;
        }
        event.preventDefault();
    };

    public constructor(host: ShellHost) {
        this.outputPanel = host.getOutputSettings === undefined ? null : new OutputPanel(host);
        this.controlPanel = new ControlPanel(host);
        this.effectPanel = new EffectPanel(host);
        this.debugPanel = new DebugPanel(host);
        this.compatibilityPanel = new CompatibilityPanel(host);

        this.container = document.createElement('div');
        this.container.className = 'shell';
    }

    public mount(parent: HTMLElement): void {
        // Without this, a second mount() would re-attach the keydown listener over an
        // EffectPanel.destroyed state that unmount() already made permanent -
        // ShellOverlay.rendered is the only piece of that state mount() resets.
        if (this.mounted) {
            return;
        }
        this.effectPanel.mount(this.container);
        this.controlPanel.mount(this.container);
        this.debugPanel.mount(this.container);
        this.compatibilityPanel.mount(this.container);
        this.outputPanel?.mount(this.container);
        parent.appendChild(this.container);
        document.addEventListener('keydown', this.handleKeydown);
        this.mounted = true;
    }

    public unmount(): void {
        if (!this.mounted) {
            return;
        }
        document.removeEventListener('keydown', this.handleKeydown);
        this.outputPanel?.unmount();
        this.effectPanel.unmount();
        this.controlPanel.unmount();
        this.debugPanel.unmount();
        this.compatibilityPanel.unmount();
        this.container.remove();
        this.mounted = false;
    }

    private togglePanel(id: (typeof PANEL_IDS)[number]): void {
        this.container.querySelector<HTMLButtonElement>(`[data-shell-id="${id}"] .shell-overlay__toggle`)?.click();
    }

    private collapseAll(): void {
        for (const id of PANEL_IDS) {
            const root = this.container.querySelector<HTMLElement>(`[data-shell-id="${id}"]`);
            if (root !== null && !root.classList.contains('shell-overlay--collapsed')) {
                this.togglePanel(id);
            }
        }
    }
}
