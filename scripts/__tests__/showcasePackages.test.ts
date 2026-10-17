import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadBlinkFx } from '../../src/packages/blinkfx/loader.ts';
import type { BlinkFxManifest } from '../../src/packages/blinkfx/manifest.ts';
import {
    MemoryPackageFiles,
    readPackageArchive,
    writePackageArchive,
} from '../../src/packages/blinkfx/packageReader.ts';
import { validateBlinkFxManifest } from '../../src/packages/blinkfx/validate.ts';

const shippingPackages = ['aurora', 'full', 'prism_orbit', 'spectral_city', 'ink_current'];
const originals = ['prism_orbit', 'spectral_city', 'ink_current'];
const publicRoot = new URL('../../public/', import.meta.url);

function filesIn(directory: string, root = directory): Map<string, Uint8Array> {
    const files = new Map<string, Uint8Array>();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            for (const [name, bytes] of filesIn(path, root)) files.set(name, bytes);
        } else if (entry.isFile()) {
            files.set(relative(root, path).replaceAll('\\', '/'), new Uint8Array(readFileSync(path)));
        }
    }
    return files;
}

describe('shipping showcase packages', () => {
    it.each(shippingPackages)('%s validates, resolves its resources and preserves archive bytes', name => {
        const directory = new URL(`effects/${name}.blinkfx/`, publicRoot);
        const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as BlinkFxManifest;
        expect(validateBlinkFxManifest(manifest)).toEqual({ valid: true });
        expect(manifest.license).toBe('MIT');
        const effect = loadBlinkFx(manifest, 'package');
        const files = filesIn(fileURLToPath(directory));
        const references = [
            ...Object.values(effect.shaders.glsl).flatMap(shader => [shader.path, shader.vertex?.path]),
            ...Object.values(effect.shaders.wgsl).map(shader => shader.path),
            ...effect.assets.map(asset => asset.path),
            ...effect.presets.map(preset => preset.path),
            effect.script?.entry,
            manifest.thumbnail === undefined ? undefined : `package/${manifest.thumbnail}`,
        ].filter((path): path is string => typeof path === 'string');
        for (const path of references) {
            expect(path.startsWith('package/'), path).toBe(true);
            expect(files.has(path.slice('package/'.length)), path).toBe(true);
        }
        const unpacked = readPackageArchive(writePackageArchive(new MemoryPackageFiles(files)));
        expect(unpacked.list()).toEqual([...files.keys()].sort());
        for (const [path, bytes] of files) expect(unpacked.read(path), path).toEqual(bytes);
    });

    it.each(originals)('%s declares independent bass, mid and high audio responses', name => {
        const directory = new URL(`effects/${name}.blinkfx/`, publicRoot);
        const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as BlinkFxManifest;
        const effect = loadBlinkFx(manifest, 'package');
        expect(effect.passes).toHaveLength(1);
        expect(effect.compatibility).toBeNull();
        const source = readFileSync(new URL('shaders/main.frag.glsl', directory), 'utf8');
        for (const uniform of ['au_bass', 'au_mid', 'au_high']) expect(source).toContain(uniform);
        expect(effect.controls.find(control => control.name === 'sensitivity')).toMatchObject({
            type: 'float',
            default: 1,
        });
    });
});
