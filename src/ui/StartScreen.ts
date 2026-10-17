import './StartScreen.scss';

import { Signal } from '@codexo/exojs';

import { DEMO_MUSIC } from '../data/demoMusic';
import type { BlinkFxPackageList, BlinkFxPackageListItem } from '../services/BlinkFxService';
import { assetUrl } from '../utils/base-url';
import { groupEffects } from './effectGroups';
import { ErrorCard } from './ErrorCard';
import type { SourceTileOptions } from './start/SourceTile';
import { SourceTile } from './start/SourceTile';
import { DEFAULT_STREAM_URL, readStartSelection, rememberEffect } from './startSelection';

export type SourceType = 'mic' | 'screen' | 'url' | 'upload';

export interface StartConfig {
    sourceType: SourceType;
    packageId: string;
    url?: string;
    file?: File;
}

const TILE_DEFS: readonly SourceTileOptions[] = [
    { sourceType: 'url', title: 'Stream / URL', submitLabel: '', field: 'url', selectionOnly: true },
    { sourceType: 'mic', title: 'Mikrofon', submitLabel: '', field: 'none', selectionOnly: true },
    { sourceType: 'screen', title: 'Screen-Audio', submitLabel: '', field: 'none', selectionOnly: true },
    { sourceType: 'upload', title: 'Audiodatei', submitLabel: '', field: 'file', selectionOnly: true },
];

export class StartScreen {
    public readonly onSubmit = new Signal<[StartConfig]>();

    private readonly root: HTMLElement;
    private readonly errorCard = new ErrorCard();
    private readonly tiles = new Map<SourceType, SourceTile>();
    private readonly cards = new Map<string, HTMLButtonElement>();
    private readonly statusElement: HTMLElement;
    private readonly demoMusicSelect: HTMLSelectElement;
    private readonly demoMusicCredit: HTMLAnchorElement;
    private selectedSource: SourceType = 'url';
    private selectedEffect: string | null = null;
    private loading = false;

    public constructor(packages: BlinkFxPackageList) {
        this.root = document.createElement('div');
        this.root.className = 'start-screen';
        this.root.innerHTML = this.template();
        this.statusElement = this.root.querySelector<HTMLElement>('[data-status]')!;
        this.demoMusicSelect = this.root.querySelector<HTMLSelectElement>('[data-demo-music]')!;
        this.demoMusicCredit = this.root.querySelector<HTMLAnchorElement>('[data-demo-credit]')!;

        const sources = this.root.querySelector<HTMLElement>('.start-screen__sources')!;
        for (const def of TILE_DEFS) {
            const tile = new SourceTile(def);
            tile.onSelect.add(type => this.selectSource(type));
            tile.onChange.add(() => {
                this.selectSource(def.sourceType);
                this.updateDemoMusic();
            });
            tile.mount(sources);
            this.tiles.set(def.sourceType, tile);
        }
        this.renderDemoMusic();
        this.renderGallery(packages);
        this.errorCard.mount(this.root);

        const saved = readStartSelection();
        this.selectedEffect = this.cards.keys().next().value ?? null;
        const defaultUrl = DEMO_MUSIC[0] === undefined ? DEFAULT_STREAM_URL : this.demoMusicUrl(DEMO_MUSIC[0].path);
        this.prefill({ ...saved, sourceType: saved.sourceType ?? 'url', url: saved.url ?? defaultUrl });
    }

    public mount(parent: HTMLElement): void {
        parent.appendChild(this.root);
    }

    public unmount(): void {
        this.errorCard.clear();
        this.root.remove();
    }

    /** Prefills the source and marks an effect without starting it; an unknown effect keeps the current mark. */
    public prefill(config: { sourceType?: SourceType; url?: string; packageId?: string }): void {
        if (config.url !== undefined) this.tiles.get('url')?.setValue(config.url);
        if (config.packageId !== undefined && this.cards.has(config.packageId)) this.selectedEffect = config.packageId;
        this.selectSource(config.sourceType ?? this.selectedSource);
        this.updateDemoMusic();
        this.markSelectedEffect();
    }

    public setStatus(message: string, isError = false): void {
        this.statusElement.textContent = message;
        this.statusElement.classList.toggle('start-screen__status--error', isError);
        if (isError && message.length > 0) this.errorCard.show(message);
        else this.errorCard.clear();
    }

    /** Locks source fields and effect cards together; clearing it restores the selected source's readiness. */
    public setLoading(loading: boolean): void {
        this.loading = loading;
        this.root.setAttribute('aria-busy', String(loading));
        for (const tile of this.tiles.values()) tile.setDisabled(loading);
        this.demoMusicSelect.disabled = loading;
        if (!loading) this.updateDemoMusic();
        this.updateReadiness();
    }

    private selectSource(sourceType: SourceType): void {
        if (this.loading) return;
        this.selectedSource = sourceType;
        for (const [type, tile] of this.tiles) tile.setSelected(type === sourceType);
        this.updateDemoMusic();
        this.updateReadiness();
    }

    private demoMusicUrl(path: string): string {
        return new URL(assetUrl(path), document.baseURI).href;
    }

    private renderDemoMusic(): void {
        const groups = new Map<string, HTMLOptGroupElement>();
        for (const track of DEMO_MUSIC) {
            let group = groups.get(track.category);
            if (group === undefined) {
                group = document.createElement('optgroup');
                group.label = track.category;
                groups.set(track.category, group);
                this.demoMusicSelect.append(group);
            }
            const option = document.createElement('option');
            option.value = track.id;
            option.textContent = `${track.title} - ${track.author} (CC0)`;
            group.append(option);
        }
        this.demoMusicSelect.addEventListener('change', () => {
            if (this.loading) return;
            const track = DEMO_MUSIC.find(candidate => candidate.id === this.demoMusicSelect.value);
            if (track !== undefined) this.prefill({ sourceType: 'url', url: this.demoMusicUrl(track.path) });
        });
    }

    private updateDemoMusic(): void {
        const url = this.selectedSource === 'url' ? this.tiles.get('url')?.getSubmission()?.url : undefined;
        const track = DEMO_MUSIC.find(candidate => this.demoMusicUrl(candidate.path) === url);
        this.demoMusicSelect.value = track?.id ?? '';
        this.demoMusicCredit.hidden = track === undefined;
        if (track !== undefined) {
            this.demoMusicCredit.textContent = `${track.title} - ${track.author} - CC0`;
            this.demoMusicCredit.href = track.sourceUrl;
        } else {
            this.demoMusicCredit.textContent = '';
            this.demoMusicCredit.removeAttribute('href');
        }
    }

    private updateReadiness(): void {
        const source = this.tiles.get(this.selectedSource);
        const ready = !this.loading && source !== undefined && source.getSubmission() !== null;
        for (const card of this.cards.values()) card.disabled = !ready;
    }

    private handleEffectClick(packageId: string): void {
        if (this.loading) return;
        const source = this.tiles.get(this.selectedSource)?.getSubmission();
        if (source === null || source === undefined) return;
        this.selectedEffect = packageId;
        this.markSelectedEffect();
        rememberEffect(packageId);
        this.setStatus('');
        this.setLoading(true);
        this.onSubmit.dispatch({ ...source, packageId });
    }

    private markSelectedEffect(): void {
        for (const [id, card] of this.cards) {
            const selected = id === this.selectedEffect;
            card.classList.toggle('effect-gallery__card--selected', selected);
            if (selected) card.setAttribute('aria-current', 'true');
            else card.removeAttribute('aria-current');
        }
    }

    private renderGallery(packages: BlinkFxPackageList): void {
        const gallery = this.root.querySelector<HTMLElement>('.effect-gallery')!;
        for (const group of groupEffects(packages)) {
            const section = document.createElement('section');
            section.className = 'effect-gallery__section';
            const heading = document.createElement('h2');
            heading.id = `start-gallery-${group.id}`;
            heading.className = 'effect-gallery__heading';
            heading.textContent = group.label;
            section.setAttribute('aria-labelledby', heading.id);
            const grid = document.createElement('div');
            grid.className = 'effect-gallery__grid';
            for (const pkg of group.packages) grid.append(this.buildEffectCard(pkg));
            section.append(heading, grid);
            gallery.append(section);
        }
        if (packages.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'effect-gallery__empty';
            empty.textContent = 'Keine Effekte verfügbar.';
            gallery.append(empty);
        }
    }

    private buildEffectCard(pkg: BlinkFxPackageListItem): HTMLButtonElement {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'effect-gallery__card';
        card.dataset.effectId = pkg.id;
        card.title = pkg.description;
        card.setAttribute('aria-label', `${pkg.title} starten`);
        card.addEventListener('click', () => this.handleEffectClick(pkg.id));

        const preview = document.createElement('span');
        preview.className = 'effect-gallery__preview';
        const hue = [...pkg.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
        preview.style.setProperty('--preview-hue', String(hue));
        if (pkg.previewUrl !== undefined) {
            const image = document.createElement('img');
            image.src = pkg.previewUrl;
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', () => {
                image.hidden = true;
            });
            preview.append(image);
        }
        const title = document.createElement('span');
        title.className = 'effect-gallery__title';
        title.textContent = pkg.title;
        card.append(preview, title);
        this.cards.set(pkg.id, card);
        return card;
    }

    private template(): string {
        return `
            <main class="start-screen__content">
                <header class="start-screen__header">
                    <h1 class="start-screen__title">Blink</h1>
                    <p class="start-screen__intro">Audioquelle wählen, Effekt anklicken.</p>
                </header>
                <div class="start-screen__sources" role="group" aria-label="Audioquelle"></div>
                <div class="start-screen__demo-music">
                    <label>Demo-Musik
                        <select data-demo-music>
                            <option value="" disabled>Eigene Audio-URL</option>
                        </select>
                    </label>
                    <a data-demo-credit target="_blank" rel="noopener noreferrer" hidden></a>
                </div>
                <div class="start-screen__status" data-status role="status"></div>
                <div class="effect-gallery"></div>
            </main>
        `;
    }
}
