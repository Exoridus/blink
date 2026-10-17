import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { exportBlinkFxSpec } from '../../export-blinkfx-spec.ts';

void test('standalone specification export preserves schema and declarations without engine dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'blink-spec-export-'));
    try {
        exportBlinkFxSpec(root);
        for (const name of [
            'schemas/v1/manifest.schema.json',
            'types/manifest.d.ts',
            'types/scene-runtime.d.ts',
            'types/audio-frame.d.ts',
            'examples/minimal/manifest.json',
        ]) {
            assert.equal(
                readFileSync(join(root, name), 'utf8'),
                readFileSync(join('docs/blinkfx', name), 'utf8').replaceAll('\r\n', '\n')
            );
        }
        const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            dependencies: Record<string, string>;
            devDependencies: Record<string, string>;
        };
        assert.deepEqual(Object.keys(manifest.dependencies), ['ajv']);
        assert.deepEqual(Object.keys(manifest.devDependencies).sort(), ['@types/node', '@typescript/native']);
        assert.ok(readFileSync(join(root, 'LICENSE'), 'utf8').includes('Copyright (c) 2026 Dieter Giesler'));
        assert.ok(readFileSync(join(root, 'conformance/check.ts'), 'utf8').includes('semanticErrors'));
        assert.ok(readFileSync(join(root, '.github/workflows/conformance.yml'), 'utf8').includes('npm run check'));
        for (const name of readdirSync(join(root, 'spec/v1'))) {
            assert.doesNotMatch(readFileSync(join(root, 'spec/v1', name), 'utf8'), /\]\(\.\.\/architecture\//);
        }
        const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
            packages: Record<string, object>;
        };
        assert.ok(lock.packages['node_modules/ajv']);
        assert.ok(lock.packages['node_modules/@typescript/native']);
        assert.equal(
            Object.keys(lock.packages).some(name => /exojs|vite|playwright/.test(name)),
            false
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('export refuses parent traversal and nonempty destinations without replacing files', () => {
    const root = mkdtempSync(join(tmpdir(), 'blink-spec-path-'));
    try {
        assert.throws(() => exportBlinkFxSpec(join(root, 'child') + '/../out'), /parent traversal/);
        writeFileSync(join(root, 'keep.txt'), 'preserved');
        assert.throws(() => exportBlinkFxSpec(root), /empty directory/);
        assert.equal(readFileSync(join(root, 'keep.txt'), 'utf8'), 'preserved');
        assert.throws(() => exportBlinkFxSpec(process.cwd()), /source repository/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('independent exports have identical portable text and lockfiles', () => {
    const root = mkdtempSync(join(tmpdir(), 'blink-spec-repeat-'));
    try {
        const left = exportBlinkFxSpec(join(root, 'left'));
        const right = exportBlinkFxSpec(join(root, 'right'));
        function compare(directory: string): void {
            for (const entry of readdirSync(join(left, directory), { withFileTypes: true })) {
                const name = join(directory, entry.name);
                if (entry.isDirectory()) compare(name);
                else
                    assert.equal(readFileSync(join(left, name), 'utf8'), readFileSync(join(right, name), 'utf8'), name);
            }
        }
        compare('');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
