import catalog from '../../public/audio/demo/manifest.json' with { type: 'json' };

export interface DemoMusicTrack {
    readonly id: string;
    readonly title: string;
    readonly author: string;
    readonly path: string;
    readonly sourceUrl: string;
    readonly license: 'CC0-1.0';
    readonly category: string;
}

export const DEMO_MUSIC: readonly DemoMusicTrack[] = catalog.tracks.map(track => {
    if (track.license !== 'CC0-1.0') throw new Error('Demo recordings require a CC0 dedication');
    const { id, title, author, path, sourceUrl, license, category } = track;
    return { id, title, author, path, sourceUrl, license, category };
});
