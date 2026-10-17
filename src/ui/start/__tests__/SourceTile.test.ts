// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type { SourceTileOptions } from '../SourceTile';
import { SourceTile } from '../SourceTile';

function mount(options: SourceTileOptions): { parent: HTMLElement; tile: SourceTile } {
    const tile = new SourceTile(options);
    const parent = document.createElement('div');
    tile.mount(parent);
    return { parent, tile };
}

function submitButton(parent: HTMLElement): HTMLButtonElement {
    return parent.querySelector<HTMLButtonElement>('.source-tile__submit')!;
}

function urlInput(parent: HTMLElement): HTMLInputElement {
    return parent.querySelector<HTMLInputElement>('input[type="url"]')!;
}

function fileInput(parent: HTMLElement): HTMLInputElement {
    return parent.querySelector<HTMLInputElement>('input[type="file"]')!;
}

function setInputFiles(input: HTMLInputElement, files: File[]): void {
    Object.defineProperty(input, 'files', { value: files, configurable: true });
}

function makeFile(name = 'clip.mp3'): File {
    return new File(['data'], name, { type: 'audio/mpeg' });
}

describe('SourceTile', () => {
    describe('a fieldless tile (mic / screen)', () => {
        function mountNoneTile(): { parent: HTMLElement; tile: SourceTile } {
            return mount({ sourceType: 'mic', title: 'Mikrofon', submitLabel: 'Mikrofon verwenden', field: 'none' });
        }

        it('is ready to submit immediately', () => {
            const { parent } = mountNoneTile();
            expect(submitButton(parent).disabled).toBe(false);
        });

        it('submits its own sourceType with no url or file on click', () => {
            const { parent, tile } = mountNoneTile();
            const onSubmit = vi.fn();
            tile.onSubmit.add(onSubmit);

            submitButton(parent).click();

            expect(onSubmit).toHaveBeenCalledTimes(1);
            expect(onSubmit).toHaveBeenCalledWith({ sourceType: 'mic' });
        });
    });

    describe('the URL tile', () => {
        function mountUrlTile(): { parent: HTMLElement; tile: SourceTile } {
            return mount({ sourceType: 'url', title: 'URL', submitLabel: 'URL verwenden', field: 'url' });
        }

        it('starts disabled with an empty field', () => {
            const { parent } = mountUrlTile();
            expect(submitButton(parent).disabled).toBe(true);
        });

        it('stays disabled while the value does not parse as a URL', () => {
            const { parent } = mountUrlTile();
            const input = urlInput(parent);

            input.value = 'not a url';
            input.dispatchEvent(new Event('input'));

            expect(submitButton(parent).disabled).toBe(true);
        });

        it('enables once the value parses as a URL', () => {
            const { parent } = mountUrlTile();
            const input = urlInput(parent);

            input.value = 'https://example.com/audio.mp3';
            input.dispatchEvent(new Event('input'));

            expect(submitButton(parent).disabled).toBe(false);
        });

        it('disables again if the value is edited back to something invalid', () => {
            const { parent } = mountUrlTile();
            const input = urlInput(parent);

            input.value = 'https://example.com/audio.mp3';
            input.dispatchEvent(new Event('input'));
            expect(submitButton(parent).disabled).toBe(false);

            input.value = 'not a url anymore';
            input.dispatchEvent(new Event('input'));
            expect(submitButton(parent).disabled).toBe(true);
        });

        it('submits sourceType "url" with the trimmed value', () => {
            const { parent, tile } = mountUrlTile();
            const onSubmit = vi.fn();
            tile.onSubmit.add(onSubmit);
            const input = urlInput(parent);

            input.value = '  https://example.com/audio.mp3  ';
            input.dispatchEvent(new Event('input'));
            submitButton(parent).click();

            expect(onSubmit).toHaveBeenCalledWith({ sourceType: 'url', url: 'https://example.com/audio.mp3' });
        });

        it('does not dispatch onSubmit when the button is clicked while still invalid', () => {
            const { parent, tile } = mountUrlTile();
            const onSubmit = vi.fn();
            tile.onSubmit.add(onSubmit);

            // Bypass the disabled attribute itself and dispatch the click event directly, so this
            // proves the tile's own readiness guard blocks the submit, not just that a disabled
            // button happens to swallow clicks.
            submitButton(parent).dispatchEvent(new MouseEvent('click'));

            expect(onSubmit).not.toHaveBeenCalled();
        });

        it('setValue populates the field and updates readiness', () => {
            const { parent, tile } = mountUrlTile();

            tile.setValue('https://example.com/stream');

            expect(urlInput(parent).value).toBe('https://example.com/stream');
            expect(submitButton(parent).disabled).toBe(false);
        });
    });

    describe('the file tile', () => {
        function mountFileTile(): { parent: HTMLElement; tile: SourceTile } {
            return mount({ sourceType: 'upload', title: 'Datei', submitLabel: 'Datei verwenden', field: 'file' });
        }

        it('starts disabled with no file chosen', () => {
            const { parent } = mountFileTile();
            expect(submitButton(parent).disabled).toBe(true);
        });

        it('enables once a file is chosen via the input', () => {
            const { parent } = mountFileTile();
            const input = fileInput(parent);
            const file = makeFile();

            setInputFiles(input, [file]);
            input.dispatchEvent(new Event('change'));

            expect(submitButton(parent).disabled).toBe(false);
        });

        it('is reachable by keyboard and activatable there, not only through the wrapping label', () => {
            const { parent, tile } = mountFileTile();
            // .focus() only succeeds on an element connected to the live document, so proving
            // reachability needs the tile actually attached here, not just built in memory.
            document.body.appendChild(parent);
            const onSubmit = vi.fn();
            tile.onSubmit.add(onSubmit);
            const input = fileInput(parent);

            // A native <label> is never itself a tab stop; the input must be the thing Tab
            // lands on, with its default tabIndex and without disabled/hidden, or a keyboard
            // user has no way to reach the file picker at all. jsdom does not model the OS file
            // dialog a real Enter/Space keypress would open, so the flow past that point is
            // simulated the same way userEvent.upload() does: focus the input directly, then
            // drive the input/change events a real selection ends in.
            expect(input.tabIndex).toBe(0);
            expect(input.disabled).toBe(false);
            expect(input.hidden).toBe(false);

            input.focus();
            expect(document.activeElement).toBe(input);

            const file = makeFile();
            setInputFiles(input, [file]);
            input.dispatchEvent(new Event('change'));
            submitButton(parent).click();

            expect(onSubmit).toHaveBeenCalledWith({ sourceType: 'upload', file });

            parent.remove();
        });

        it('submits sourceType "upload" with the chosen file', () => {
            const { parent, tile } = mountFileTile();
            const onSubmit = vi.fn();
            tile.onSubmit.add(onSubmit);
            const input = fileInput(parent);
            const file = makeFile();

            setInputFiles(input, [file]);
            input.dispatchEvent(new Event('change'));
            submitButton(parent).click();

            expect(onSubmit).toHaveBeenCalledWith({ sourceType: 'upload', file });
        });

        it('enables and updates the filename display on drop', () => {
            const { parent } = mountFileTile();
            const dropZone = parent.querySelector<HTMLElement>('.source-tile__field')!;
            const file = makeFile('dropped.wav');

            const dropEvent = new Event('drop', { cancelable: true });
            Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } });
            dropZone.dispatchEvent(dropEvent);

            expect(submitButton(parent).disabled).toBe(false);
            expect(parent.querySelector('.source-tile__filename')?.textContent).toBe('dropped.wav');
        });

        it('submits the dropped file, not merely a re-selected input file', () => {
            const { parent, tile } = mountFileTile();
            const onSubmit = vi.fn();
            tile.onSubmit.add(onSubmit);
            const dropZone = parent.querySelector<HTMLElement>('.source-tile__field')!;
            const file = makeFile('dropped.wav');

            const dropEvent = new Event('drop', { cancelable: true });
            Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } });
            dropZone.dispatchEvent(dropEvent);
            submitButton(parent).click();

            expect(onSubmit).toHaveBeenCalledWith({ sourceType: 'upload', file });
        });

        it('marks the drop zone during dragover and clears it on dragleave', () => {
            const { parent } = mountFileTile();
            const dropZone = parent.querySelector<HTMLElement>('.source-tile__field')!;

            dropZone.dispatchEvent(new Event('dragover', { cancelable: true }));
            expect(dropZone.classList.contains('source-tile__field--drag-over')).toBe(true);

            dropZone.dispatchEvent(new Event('dragleave'));
            expect(dropZone.classList.contains('source-tile__field--drag-over')).toBe(false);
        });

        it('setValue is a no-op and never throws', () => {
            const { parent, tile } = mountFileTile();
            expect(() => tile.setValue('https://example.com')).not.toThrow();
            expect(submitButton(parent).disabled).toBe(true);
        });
    });

    describe('setDisabled', () => {
        it('disables a tile that is otherwise ready', () => {
            const { parent, tile } = mount({
                sourceType: 'screen',
                title: 'Screen-Audio',
                submitLabel: 'Bildschirm teilen',
                field: 'none',
            });

            tile.setDisabled(true);

            expect(submitButton(parent).disabled).toBe(true);
        });

        it('restores the tile to its own readiness once cleared', () => {
            const { parent, tile } = mount({
                sourceType: 'url',
                title: 'URL',
                submitLabel: 'URL verwenden',
                field: 'url',
            });

            tile.setDisabled(true);
            expect(submitButton(parent).disabled).toBe(true);

            tile.setDisabled(false);
            // still invalid, so clearing the override must not force it enabled
            expect(submitButton(parent).disabled).toBe(true);

            const input = urlInput(parent);
            input.value = 'https://example.com/audio.mp3';
            input.dispatchEvent(new Event('input'));
            tile.setDisabled(true);
            tile.setDisabled(false);
            expect(submitButton(parent).disabled).toBe(false);
        });

        it('blocks onSubmit while disabled even if a click event fires', () => {
            const { parent, tile } = mount({
                sourceType: 'mic',
                title: 'Mikrofon',
                submitLabel: 'Mikrofon verwenden',
                field: 'none',
            });
            const onSubmit = vi.fn();
            tile.onSubmit.add(onSubmit);

            tile.setDisabled(true);
            submitButton(parent).dispatchEvent(new MouseEvent('click'));

            expect(onSubmit).not.toHaveBeenCalled();
        });
    });
});

describe('SourceTile selection mode', () => {
    it('chooses an unready source without submitting it and exposes readiness as a snapshot', () => {
        const { parent, tile } = mount({
            sourceType: 'upload',
            title: 'Datei',
            submitLabel: '',
            field: 'file',
            selectionOnly: true,
        });
        const selected: string[] = [];
        const submitted: unknown[] = [];
        tile.onSelect.add(type => selected.push(type));
        tile.onSubmit.add(value => submitted.push(value));
        expect(parent.querySelector('.source-tile__submit')).toBeNull();
        parent.querySelector<HTMLButtonElement>('.source-tile__select')!.click();
        expect(selected).toEqual(['upload']);
        expect(submitted).toEqual([]);
        expect(tile.getSubmission()).toBeNull();
        const file = makeFile();
        setInputFiles(fileInput(parent), [file]);
        fileInput(parent).dispatchEvent(new Event('change'));
        expect(tile.getSubmission()).toEqual({ sourceType: 'upload', file });
        tile.setSelected(true);
        expect(parent.querySelector('.source-tile__select')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('locks native inputs and ignores dropped files while loading', () => {
        const { parent, tile } = mount({
            sourceType: 'upload',
            title: 'Datei',
            submitLabel: '',
            field: 'file',
            selectionOnly: true,
        });
        tile.setDisabled(true);
        expect(fileInput(parent).disabled).toBe(true);
        const event = new Event('drop', { cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { files: [makeFile()] } });
        parent.querySelector('.source-tile__field')!.dispatchEvent(event);
        tile.setDisabled(false);
        expect(tile.getSubmission()).toBeNull();
    });
});
