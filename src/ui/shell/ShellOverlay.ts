import './shell.scss';

const STORAGE_PREFIX = 'blink.shell.';

/**
 * Reads a persisted collapse flag, degrading to `fallback` on anything but an exact 'true' or
 * 'false' - a blocked or cleared store, a private window, or a value some other code path wrote
 * in a different shape must never surface as a thrown error or as a misread boolean.
 */
function readCollapsed(key: string, fallback: boolean): boolean {
    try {
        const raw = localStorage.getItem(key);
        if (raw === 'true') {
            return true;
        }
        if (raw === 'false') {
            return false;
        }
        return fallback;
    } catch {
        return fallback;
    }
}

function writeCollapsed(key: string, value: boolean): void {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Persistence is best-effort; a blocked or full store must not break the toggle itself.
    }
}

/**
 * Base panel every shell overlay extends: the header, the collapse toggle and its persisted
 * state, and the mount/unmount lifecycle. Subclasses only ever fill `body` via `renderBody`.
 */
export abstract class ShellOverlay {
    protected readonly body: HTMLElement;

    private readonly root: HTMLElement;
    private readonly toggle: HTMLButtonElement;
    private readonly storageKey: string;
    private readonly defaultCollapsed: boolean;
    private collapsed: boolean;
    private rendered = false;

    private readonly handleToggleClick = (): void => {
        this.setCollapsed(!this.collapsed);
    };

    public constructor(id: string, title: string, options?: { startCollapsed?: boolean }) {
        this.storageKey = `${STORAGE_PREFIX}${id}.collapsed`;
        this.defaultCollapsed = options?.startCollapsed ?? true;
        this.collapsed = readCollapsed(this.storageKey, this.defaultCollapsed);

        this.root = document.createElement('section');
        this.root.className = 'shell-overlay';
        this.root.dataset.shellId = id;

        const header = document.createElement('header');
        header.className = 'shell-overlay__header';

        const titleElement = document.createElement('span');
        titleElement.className = 'shell-overlay__title';
        titleElement.textContent = title;

        this.toggle = document.createElement('button');
        this.toggle.type = 'button';
        this.toggle.className = 'shell-overlay__toggle';
        this.toggle.addEventListener('click', this.handleToggleClick);

        header.append(titleElement, this.toggle);

        this.body = document.createElement('div');
        this.body.className = 'shell-overlay__body';

        this.root.append(header, this.body);
        this.applyCollapsed();
    }

    /**
     * Fills the body and attaches the frame to `parent`. Body content is built here, not in the
     * constructor, so a subclass constructor can finish setting its own fields (a host reference,
     * loaded data) before `renderBody` - overridden and invoked on `this` - ever runs.
     */
    public mount(parent: HTMLElement): void {
        if (!this.rendered) {
            this.renderBody(this.body);
            this.rendered = true;
        }
        parent.appendChild(this.root);
    }

    public unmount(): void {
        this.toggle.removeEventListener('click', this.handleToggleClick);
        this.root.remove();
    }

    protected abstract renderBody(body: HTMLElement): void;

    /**
     * Current collapse state, for a subclass that needs to decide its initial behaviour (start
     * or skip a poll timer) inside `renderBody`, before any toggle click has happened.
     */
    protected isCollapsed(): boolean {
        return this.collapsed;
    }

    /**
     * Called after every toggle-driven collapse change, never for the initial state a subclass
     * reads via `isCollapsed()`. Override to start or stop per-panel work (a poll timer) that
     * must not run while the body is hidden.
     */
    protected onCollapsedChange(_collapsed: boolean): void {
        // No-op by default; only a subclass with collapse-driven work needs this.
    }

    private setCollapsed(collapsed: boolean): void {
        this.collapsed = collapsed;
        this.applyCollapsed();
        writeCollapsed(this.storageKey, collapsed);
        this.onCollapsedChange(collapsed);
    }

    private applyCollapsed(): void {
        this.root.classList.toggle('shell-overlay--collapsed', this.collapsed);
        this.toggle.textContent = this.collapsed ? '+' : '-';
        this.toggle.setAttribute('aria-expanded', String(!this.collapsed));
        this.toggle.setAttribute('aria-label', this.collapsed ? 'Erweitern' : 'Einklappen');
    }
}
