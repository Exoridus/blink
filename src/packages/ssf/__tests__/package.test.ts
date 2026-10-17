import { describe, expect, it } from 'vitest';

import { readSsfDirectory, readSsfMarketplaceTar } from '../package';

const encoder = new TextEncoder();
function tar(entries: [string, string, string?][]): Uint8Array {
    const blocks: Uint8Array[] = [];
    for (const [name, content, type = '0'] of entries) {
        const payload = encoder.encode(content);
        const header = new Uint8Array(512);
        header.set(encoder.encode(name));
        header.set(encoder.encode(`${payload.length.toString(8).padStart(11, '0')}\0`), 124);
        header.fill(32, 148, 156);
        header[156] = type.charCodeAt(0);
        const checksum = header.reduce((sum, byte) => sum + byte, 0);
        header.set(encoder.encode(`${checksum.toString(8).padStart(6, '0')}\0 `), 148);
        blocks.push(header);
        const body = new Uint8Array(Math.ceil(payload.length / 512) * 512);
        body.set(payload);
        blocks.push(body);
    }
    blocks.push(new Uint8Array(1024));
    const output = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
    let cursor = 0;
    for (const block of blocks) {
        output.set(block, cursor);
        cursor += block.length;
    }
    return output;
}

describe('native SSF package boundary', () => {
    it('loads a local directory case-insensitively while preserving exact source bytes', () => {
        const files = new Map([
            ['SCENE.JSON', encoder.encode('{/* comment */"TITLE":"Native",}')],
            ['Main.GLSL', encoder.encode('vec4 renderMain(){return vec4(1.0);}')],
            ['notes.txt', encoder.encode('keep')],
        ]);
        const scene = readSsfDirectory(files, 'local');
        expect(scene.sceneJson).toMatchObject({ TITLE: 'Native' });
        expect(scene.files.get('SCENE.JSON')).toBe(files.get('SCENE.JSON'));
        expect(scene.mainGlsl).toContain('renderMain');
    });
    it('extracts safe files and selects the last exact .synScene entry independently of scene validation', () => {
        const archive = tar([
            ['a.synScene/', '', '5'],
            ['a.synScene/scene.json', '{}'],
            ['outer/b.synScene/', '', '5'],
            ['outer/b.synScene/scene.json', '{"TITLE":"B"}'],
            ['outer/b.synScene/main.glsl', 'x'],
            ['other.txt', 'keep'],
        ]);
        const extracted = readSsfMarketplaceTar(archive);
        expect(extracted.selectedPath).toBe('outer/b.synScene/');
        expect(extracted.files.has('other.txt')).toBe(true);
        expect(extracted.scene().sceneJson).toMatchObject({ TITLE: 'B' });
    });
    it('selects an exact extension on a regular file and rejects it as a scene directory at load time', () => {
        const extracted = readSsfMarketplaceTar(tar([['scene.synScene', 'arbitrary']]));
        expect(extracted.selectedPath).toBe('scene.synScene');
        expect(() => extracted.scene()).toThrow('scene.json');
    });
    it.each(['synScene', 'synScene/', 'scene.SYNSCENE/'])('does not select %s', name => {
        expect(() => readSsfMarketplaceTar(tar([[name, '']]))).toThrow('valid synScene');
    });
    it('skips parent traversal and refuses links, ZIP, corrupt checksums and truncated members', () => {
        const archive = tar([
            ['../evil.txt', 'x'],
            ['s.synScene/../../evil.txt', 'x'],
            ['s.synScene/', '', '5'],
            ['s.synScene/scene.json', '{}'],
        ]);
        expect([...readSsfMarketplaceTar(archive).files.keys()]).toEqual(['s.synScene/scene.json']);
        expect(() => readSsfMarketplaceTar(tar([['s.synScene', '', '2']]))).toThrow('type');
        expect(() => readSsfMarketplaceTar(encoder.encode('PK\x03\x04'))).toThrow();
        const corrupt = archive.slice();
        corrupt[0] ^= 1;
        expect(() => readSsfMarketplaceTar(corrupt)).toThrow('checksum');
        expect(() => readSsfMarketplaceTar(tar([['s.synScene', 'payload']]).subarray(0, 513))).toThrow('truncated');
    });
});
