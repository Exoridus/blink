import { Signal } from '@codexo/exojs';

import type { SourceType } from '../StartScreen';

export type SourceTileField = 'none' | 'url' | 'file';

export interface SourceTileOptions {
    sourceType: SourceType;
    title: string;
    submitLabel: string;
    field: SourceTileField;
    /** Shows a source selector instead of a submit button; acquisition remains the caller's job. */
    selectionOnly?: boolean;
}

/** The source snapshot; the caller supplies the chosen effect. */
export interface SourceTileSubmission {
    sourceType: SourceType;
    url?: string;
    file?: File;
}

const URL_PLACEHOLDER = 'https://example.com/audio.mp3';
const FILE_PROMPT = 'Datei wählen oder hierher ziehen';

function isParsableUrl(value: string): boolean {
    if (value.length === 0) {
        return false;
    }
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * A source option with its own readiness and optional field. Default mode submits a ready
 * source; selection mode lets a caller choose an effect before acquiring that source.
 */
export class SourceTile {
    public readonly onSubmit = new Signal<[SourceTileSubmission]>();
    public readonly onSelect = new Signal<[SourceType]>();
    public readonly onChange = new Signal();

    public readonly element: HTMLElement;

    private readonly sourceType: SourceType;
    private readonly field: SourceTileField;
    private readonly selectionOnly: boolean;
    private readonly submitButton: HTMLButtonElement;
    private readonly urlInput: HTMLInputElement | null = null;
    private readonly fileInput: HTMLInputElement | null = null;
    private readonly filenameElement: HTMLElement | null = null;

    private selectedFile: File | undefined;
    private forcedDisabled = false;

    public constructor(options: SourceTileOptions) {
        this.sourceType = options.sourceType;
        this.field = options.field;
        this.selectionOnly = options.selectionOnly === true;

        this.element = document.createElement('article');
        this.element.className = this.selectionOnly ? 'source-tile source-tile--picker' : 'source-tile';
        this.element.dataset.sourceTile = options.sourceType;

        if (!this.selectionOnly) {
            const title = document.createElement('h2');
            title.className = 'source-tile__title';
            title.textContent = options.title;
            this.element.appendChild(title);
        }

        if (this.field === 'url') {
            this.urlInput = document.createElement('input');
            this.urlInput.className = 'source-tile__input';
            this.urlInput.type = 'url';
            this.urlInput.placeholder = URL_PLACEHOLDER;
            this.urlInput.setAttribute('aria-label', 'Audio-URL');
            this.urlInput.addEventListener('input', () => {
                this.updateButtonState();
                if (!this.forcedDisabled) this.onChange.dispatch();
            });

            const field = document.createElement('label');
            field.className = 'source-tile__field';
            field.appendChild(this.urlInput);
            this.element.appendChild(field);
        }

        if (this.field === 'file') {
            this.fileInput = document.createElement('input');
            this.fileInput.className = 'source-tile__input';
            this.fileInput.type = 'file';
            this.fileInput.accept = 'audio/*';
            this.fileInput.setAttribute('aria-label', 'Audiodatei wählen');
            this.fileInput.addEventListener('change', () => {
                if (this.forcedDisabled) return;
                this.selectedFile = this.fileInput?.files?.[0];
                this.updateFilename();
                this.updateButtonState();
                this.onChange.dispatch();
            });

            this.filenameElement = document.createElement('span');
            this.filenameElement.className = 'source-tile__filename';
            this.filenameElement.textContent = FILE_PROMPT;

            const field = document.createElement('label');
            field.className = 'source-tile__field source-tile__field--drop';
            field.append(this.fileInput, this.filenameElement);
            this.bindDropZone(field);
            this.element.appendChild(field);
        }

        this.submitButton = document.createElement('button');
        this.submitButton.type = 'button';
        this.submitButton.className = this.selectionOnly ? 'source-tile__select' : 'source-tile__submit';
        this.submitButton.textContent = this.selectionOnly ? options.title : options.submitLabel;
        this.submitButton.addEventListener('click', () => {
            if (this.selectionOnly) {
                if (!this.forcedDisabled) this.onSelect.dispatch(this.sourceType);
            } else this.handleSubmit();
        });
        if (this.selectionOnly) {
            this.submitButton.setAttribute('aria-pressed', 'false');
            this.element.prepend(this.submitButton);
        } else this.element.appendChild(this.submitButton);

        this.updateButtonState();
    }

    public mount(parent: HTMLElement): void {
        parent.appendChild(this.element);
    }

    /** Populates the tile's text field, for the URL tile only. A no-op on any other field kind. */
    public setValue(value: string): void {
        if (this.urlInput === null) {
            return;
        }
        this.urlInput.value = value;
        this.updateButtonState();
    }

    /**
     * Locks the field and action together. Clearing the lock restores submission readiness in
     * default mode and makes the source selectable again in selection mode.
     */
    public setDisabled(disabled: boolean): void {
        this.forcedDisabled = disabled;
        if (this.urlInput !== null) this.urlInput.disabled = disabled;
        if (this.fileInput !== null) this.fileInput.disabled = disabled;
        this.updateButtonState();
    }

    public setSelected(selected: boolean): void {
        this.element.classList.toggle('source-tile--selected', selected);
        if (this.selectionOnly) this.submitButton.setAttribute('aria-pressed', String(selected));
    }

    /** Returns a ready source snapshot, or null while its field is invalid or externally locked. */
    public getSubmission(): SourceTileSubmission | null {
        if (this.forcedDisabled || !this.isReady()) return null;
        const submission: SourceTileSubmission = { sourceType: this.sourceType };
        if (this.field === 'url') submission.url = (this.urlInput?.value ?? '').trim();
        if (this.field === 'file') submission.file = this.selectedFile;
        return submission;
    }

    private bindDropZone(dropZone: HTMLElement): void {
        dropZone.addEventListener('dragover', event => {
            event.preventDefault();
            dropZone.classList.add('source-tile__field--drag-over');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('source-tile__field--drag-over');
        });
        dropZone.addEventListener('drop', event => {
            event.preventDefault();
            dropZone.classList.remove('source-tile__field--drag-over');
            if (this.forcedDisabled) return;
            const dropped = event.dataTransfer?.files[0];
            if (dropped !== undefined) {
                this.selectedFile = dropped;
                this.updateFilename();
                this.updateButtonState();
                this.onChange.dispatch();
            }
        });
    }

    private updateFilename(): void {
        if (this.filenameElement !== null) {
            this.filenameElement.textContent = this.selectedFile?.name ?? FILE_PROMPT;
        }
    }

    private isReady(): boolean {
        switch (this.field) {
            case 'none':
                return true;
            case 'url':
                return isParsableUrl((this.urlInput?.value ?? '').trim());
            case 'file':
                return this.selectedFile !== undefined;
        }
    }

    private updateButtonState(): void {
        this.submitButton.disabled = this.forcedDisabled || (!this.selectionOnly && !this.isReady());
    }

    private handleSubmit(): void {
        const submission = this.getSubmission();
        if (submission !== null) this.onSubmit.dispatch(submission);
    }
}
