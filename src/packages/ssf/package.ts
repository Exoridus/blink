import type { SsfSceneSource } from './convert/convertSsfScene';

const decoder = new TextDecoder('utf-8', { fatal: true });

/** JsonCpp's commonly used comments and trailing commas, without evaluating source text. */
function sceneJson(text: string): Record<string, unknown> {
    let cleaned = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            cleaned += char;
            if (char === '\\') cleaned += text[++i] ?? '';
            else if (char === '"') quoted = false;
        } else if (char === '"') {
            quoted = true;
            cleaned += char;
        } else if (char === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            cleaned += '\n';
        } else if (char === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            if (end < 0) throw new SyntaxError('Unterminated scene.json comment');
            cleaned += ' ';
            i = end + 1;
        } else cleaned += char;
    }
    const tokens = /"(?:\\.|[^"\\])*"|,\s*(?=[}\]])/g;
    cleaned = cleaned.replaceAll(tokens, token => (token.startsWith(',') ? '' : token));
    const parsed: unknown = JSON.parse(cleaned.replace(/^\uFEFF/, ''));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new SyntaxError('scene.json must contain an object');
    return parsed as Record<string, unknown>;
}

/** Reads an already acquired directory; source bytes and arbitrary ancillary files remain owned by the caller. */
export function readSsfDirectory(files: ReadonlyMap<string, Uint8Array>, slug: string): SsfSceneSource {
    const read = (name: string): string | undefined => {
        const entry = [...files].find(([path]) => path.toLowerCase() === name);
        return entry === undefined ? undefined : decoder.decode(entry[1]);
    };
    const json = read('scene.json');
    if (json === undefined) throw new Error('No scene.json file found in scene directory');
    return { slug, sceneJson: sceneJson(json), mainGlsl: read('main.glsl') ?? '', scriptJs: read('script.js'), files };
}

export interface SsfMarketplaceArchive {
    readonly selectedPath: string;
    readonly files: ReadonlyMap<string, Uint8Array>;
    scene(): SsfSceneSource;
}

function safeTarPath(name: string, parts: string[]): boolean {
    return !name.startsWith('/') && !name.includes('\\') && !/^[a-z]:/i.test(name) && !parts.includes('..');
}

/** Uncompressed regular-file/directory TAR only; selection precedes validation of the selected scene. */
export function readSsfMarketplaceTar(bytes: Uint8Array): SsfMarketplaceArchive {
    const files = new Map<string, Uint8Array>();
    let selectedPath: string | null = null;
    let position = 0;
    const field = (header: Uint8Array, start: number, length: number): string =>
        decoder.decode(header.subarray(start, start + length)).split('\0')[0];
    const octal = (value: string): number => {
        const trimmed = value.trim();
        if (!/^[0-7]*$/.test(trimmed)) throw new Error('Unsupported TAR numeric field');
        const result = trimmed === '' ? 0 : Number.parseInt(trimmed, 8);
        if (!Number.isSafeInteger(result)) throw new Error('TAR size outside safe range');
        return result;
    };
    while (position < bytes.length) {
        if (position + 512 > bytes.length) throw new Error('TAR header truncated');
        const header = bytes.subarray(position, position + 512);
        if (header.every(byte => byte === 0)) break;
        let checksum = 0;
        for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
        if (checksum !== octal(field(header, 148, 8))) throw new Error('TAR checksum mismatch');
        const size = octal(field(header, 124, 12));
        const type = header[156];
        if (type !== 0 && type !== 48 && type !== 53)
            throw new Error(`Unsupported TAR entry type ${String.fromCharCode(type)}`);
        const prefix = field(header, 345, 155);
        const name = `${prefix === '' ? '' : `${prefix}/`}${field(header, 0, 100)}`;
        const end = position + 512 + Math.ceil(size / 512) * 512;
        if (end > bytes.length) throw new Error('TAR member truncated');
        const parts = name.split('/').filter(part => part !== '' && part !== '.');
        const safe = safeTarPath(name, parts);
        if (safe) {
            const path = parts.join('/');
            if (type !== 53) files.set(path, bytes.slice(position + 512, position + 512 + size));
            if (path.endsWith('.synScene')) selectedPath = `${path}${name.endsWith('/') ? '/' : ''}`;
        }
        position = end;
    }
    if (selectedPath === null) throw new Error('The archive did not contain a valid synScene entry');
    const selected = selectedPath;
    return {
        selectedPath: selected,
        files,
        scene: () => {
            const prefix = `${selected.replace(/\/$/, '')}/`;
            const entries = new Map(
                [...files]
                    .filter(([path]) => path.startsWith(prefix))
                    .map(([path, content]) => [path.slice(prefix.length), content])
            );
            return readSsfDirectory(entries, prefix.slice(0, -1).split('/').at(-1) ?? 'scene');
        },
    };
}
