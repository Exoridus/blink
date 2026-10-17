import './ErrorCard.scss';

/** A dismissible error message that leaves the surrounding controls usable. */
export class ErrorCard {
    private readonly root: HTMLElement;
    private readonly message: HTMLElement;

    public constructor() {
        this.root = document.createElement('section');
        this.root.className = 'error-card';
        this.root.hidden = true;
        this.root.setAttribute('role', 'alert');
        this.root.setAttribute('aria-label', 'Error');

        const title = document.createElement('h2');
        title.className = 'error-card__title';
        title.textContent = 'Error';

        const label = document.createElement('div');
        label.className = 'error-card__label';
        label.textContent = 'Error Message';

        this.message = document.createElement('div');
        this.message.className = 'error-card__message';

        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'error-card__dismiss';
        dismiss.textContent = 'Schliessen';
        dismiss.addEventListener('click', () => this.clear());
        this.root.append(title, label, this.message, dismiss);
    }

    public mount(parent: HTMLElement): void {
        parent.append(this.root);
    }

    public show(message: string): void {
        this.message.textContent = message;
        this.root.hidden = false;
    }

    public clear(): void {
        this.root.hidden = true;
        this.message.textContent = '';
    }

    public unmount(): void {
        this.clear();
        this.root.remove();
    }
}
