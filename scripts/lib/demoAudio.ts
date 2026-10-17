import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface DemoAudioFile {
    readonly path: string;
    readonly sha256: string;
}

export function readDemoAudio(source: string): readonly DemoAudioFile[] {
    const directory = join(source, 'audio', 'demo');
    for (const path of [join(source, 'audio'), directory]) {
        if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Symlink is not demo audio');
    }
    const index = join(directory, 'manifest.json');
    if (!existsSync(index)) return [];
    if (lstatSync(index).isSymbolicLink()) throw new Error('Symlink is not demo audio metadata');
    const value = JSON.parse(readFileSync(index, 'utf8')) as { version?: unknown; tracks?: unknown };
    if (value.version !== 1 || !Array.isArray(value.tracks) || value.tracks.length === 0)
        throw new Error('Invalid demo audio manifest');
    return value.tracks.map((value: unknown): DemoAudioFile => {
        if (typeof value !== 'object' || value === null) throw new Error('Invalid demo audio track');
        const track = value as Record<string, unknown>;
        if (track.license !== 'CC0-1.0') throw new Error('Demo audio must be declared CC0');
        if (typeof track.path !== 'string' || !/^audio\/demo\/[a-z0-9-]+\.(?:ogg|mp3)$/.test(track.path))
            throw new Error('Invalid demo audio path');
        if (typeof track.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(track.sha256))
            throw new Error('Missing demo audio checksum');
        const path = join(source, track.path);
        if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('Invalid demo audio file');
        if (createHash('sha256').update(readFileSync(path)).digest('hex') !== track.sha256)
            throw new Error('Demo audio checksum mismatch');
        return { path: track.path, sha256: track.sha256 };
    });
}

export function prepareDemoAudio(source: string, destination: string): void {
    const files = readDemoAudio(source);
    if (files.length === 0) return;
    mkdirSync(join(destination, 'audio', 'demo'), { recursive: true });
    for (const path of [
        ...files.map(file => file.path),
        'audio/demo/manifest.json',
        'audio/demo/LICENSE-CC0.txt',
        'audio/demo/SOURCE-INFO.txt',
        'audio/demo/SOURCES.md',
    ]) {
        if (!lstatSync(join(source, path)).isFile() || lstatSync(join(source, path)).isSymbolicLink())
            throw new Error('Invalid demo audio metadata file');
        cpSync(join(source, path), join(destination, path));
    }
}
