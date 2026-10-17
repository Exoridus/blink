import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEMO_MUSIC } from '../../src/data/demoMusic';
import { readDemoAudio } from '../lib/demoAudio';

describe('bundled CC0 demo music', () => {
    it('matches the source catalog and exact unmodified licensed recordings', () => {
        const metadata = JSON.parse(readFileSync('public/audio/demo/manifest.json', 'utf8')) as {
            tracks: {
                id: string;
                title: string;
                author: string;
                path: string;
                sourceUrl: string;
                license: string;
                category: string;
                sha256: string;
                bytes: number;
            }[];
        };
        expect(
            metadata.tracks.map(({ id, title, author, path, sourceUrl, license, category }) => ({
                id,
                title,
                author,
                path,
                sourceUrl,
                license,
                category,
            }))
        ).toEqual(DEMO_MUSIC);
        expect(readDemoAudio('public')).toHaveLength(DEMO_MUSIC.length);
        for (const track of metadata.tracks) {
            const bytes = readFileSync(`public/${track.path}`);
            if (track.path.endsWith('.ogg')) expect(bytes.subarray(0, 4).toString('ascii')).toBe('OggS');
            else expect(bytes.subarray(0, 3).toString('ascii') === 'ID3' || bytes[0] === 0xff).toBe(true);
            expect(bytes.length).toBe(track.bytes);
            expect(createHash('sha256').update(bytes).digest('hex')).toBe(track.sha256);
        }
        expect(readFileSync('public/audio/demo/SOURCE-INFO.txt', 'utf8')).toContain('released under CC0');
        expect(readFileSync('public/audio/demo/LICENSE-CC0.txt', 'utf8')).toContain('CC0 1.0 Universal');
    });
});
