import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { normalizeBase, preparePublicAssets, checkStaticBuild } from '../../lib/staticBuild.ts';

void test('base paths preserve root and normalize repository subpaths', () => {
    assert.equal(normalizeBase('/'), '/');
    assert.equal(normalizeBase('/blink'), '/blink/');
    assert.throws(() => normalizeBase('https://example.com/'));
    assert.throws(() => normalizeBase('/../private/'));
    assert.throws(() => normalizeBase('/blink/?secret=1'));
});

void test('public assets include only approved MIT packages and never source scenes', () => {
    const root = mkdtempSync(join(tmpdir(), 'blink-assets-'));
    try {
        const source = join(root, 'source');
        const destination = join(root, 'out');
        mkdirSync(join(source, 'effects', 'native.blinkfx'), { recursive: true });
        mkdirSync(join(source, 'effects', 'private.synScene'), { recursive: true });
        writeFileSync(join(source, 'effects', 'native.blinkfx', 'manifest.json'), JSON.stringify({ license: 'MIT' }));
        writeFileSync(join(source, 'effects', 'private.synScene', 'scene.json'), '{}');
        preparePublicAssets(source, destination, ['native.blinkfx']);
        assert.equal(existsSync(join(destination, 'effects', 'private.synScene')), false);
        assert.deepEqual(JSON.parse(readFileSync(join(destination, 'effects', 'previews', 'manifest.json'), 'utf8')), {
            version: 1,
            previews: {},
        });
        assert.deepEqual(JSON.parse(readFileSync(join(destination, 'effects', 'catalog.json'), 'utf8')).packages, [
            'effects/native.blinkfx/manifest.json',
        ]);
        assert.throws(() => preparePublicAssets(source, join(root, 'bad'), ['../private.synScene']));
        assert.throws(() => preparePublicAssets(source, join(root, 'missing-license'), ['private.synScene']));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('shipping previews include only curated package IDs and reject escaping paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'blink-previews-'));
    try {
        const source = join(root, 'source');
        mkdirSync(join(source, 'effects/native.blinkfx'), { recursive: true });
        mkdirSync(join(source, 'effects/previews'), { recursive: true });
        writeFileSync(
            join(source, 'effects/native.blinkfx/manifest.json'),
            JSON.stringify({ id: 'native', license: 'MIT' })
        );
        writeFileSync(join(source, 'effects/previews/native.png'), 'own preview');
        writeFileSync(join(source, 'effects/previews/private.png'), 'private preview');
        const entry = { path: 'effects/previews/native.png', fingerprint: 'fixture', source: 'rendered' };
        const manifest = join(source, 'effects/previews/manifest.json');
        writeFileSync(
            manifest,
            JSON.stringify({
                version: 1,
                previews: { native: entry, private: { ...entry, path: 'effects/previews/private.png' } },
            })
        );
        const out = join(root, 'out');
        preparePublicAssets(source, out, ['native.blinkfx']);
        assert.equal(existsSync(join(out, entry.path)), true);
        assert.equal(existsSync(join(out, 'effects/previews/private.png')), false);
        assert.deepEqual(JSON.parse(readFileSync(join(out, 'effects/previews/manifest.json'), 'utf8')).previews, {
            native: entry,
        });
        writeFileSync(
            manifest,
            JSON.stringify({
                version: 1,
                previews: { native: { ...entry, path: 'effects/previews/../../private.png' } },
            })
        );
        assert.throws(() => preparePublicAssets(source, join(root, 'unsafe'), ['native.blinkfx']), /preview path/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('public assets reject an effects ancestor junction before reading a package', () => {
    const root = mkdtempSync(join(tmpdir(), 'blink-ancestor-'));
    try {
        const source = join(root, 'source');
        const external = join(root, 'external');
        mkdirSync(source);
        mkdirSync(join(external, 'native.blinkfx'), { recursive: true });
        writeFileSync(join(external, 'native.blinkfx/manifest.json'), JSON.stringify({ license: 'MIT' }));
        writeFileSync(join(external, 'native.blinkfx/private.txt'), 'private material');
        symlinkSync(external, join(source, 'effects'), process.platform === 'win32' ? 'junction' : 'dir');
        assert.throws(() => preparePublicAssets(source, join(root, 'out'), ['native.blinkfx']), /Symlink/);
        assert.equal(existsSync(join(root, 'out/effects/native.blinkfx/private.txt')), false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('static checks reject an entry bundle outside the configured base', () => {
    const root = mkdtempSync(join(tmpdir(), 'blink-build-'));
    try {
        mkdirSync(join(root, 'assets'));
        mkdirSync(join(root, 'effects', 'native.blinkfx'), { recursive: true });
        writeFileSync(join(root, 'assets', 'app.js'), 'console.log("fixture");');
        writeFileSync(join(root, 'index.html'), '<script type="module" src="/assets/app.js"></script>');
        writeFileSync(
            join(root, 'effects', 'catalog.json'),
            JSON.stringify({ packages: ['effects/native.blinkfx/manifest.json'] })
        );
        writeFileSync(
            join(root, 'effects', 'native.blinkfx', 'manifest.json'),
            JSON.stringify({ shaders: { glsl: 'main.glsl' } })
        );
        writeFileSync(join(root, 'effects', 'native.blinkfx', 'main.glsl'), 'void main() {}');
        assert.throws(() => checkStaticBuild(root, '/blink/'), /base/);
        writeFileSync(join(root, 'index.html'), '<script type="module" src="/blink/assets/app.js"></script>');
        assert.doesNotThrow(() => checkStaticBuild(root, '/blink/'));
        writeFileSync(
            join(root, 'effects', 'catalog.json'),
            JSON.stringify({ packages: ['effects/missing/manifest.json'] })
        );
        assert.throws(() => checkStaticBuild(root, '/blink/'), /missing/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
