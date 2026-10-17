import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { resolvePolicyBase } from '../../lib/policyBase.ts';

void test('new remote branches check from adoption or fetched main, not preserved history', () => {
    const root = mkdtempSync(join(tmpdir(), 'blink-policy-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    try {
        git('init', '-q', '-b', 'main');
        git('config', 'core.hooksPath', '.unused-hooks');
        git('config', 'user.name', 'Policy fixture');
        git('config', 'user.email', 'policy@example.invalid');
        writeFileSync(join(root, 'example.js'), 'export const value = 1;\n');
        git('add', '.');
        git('commit', '-q', '-m', 'feat: historical fixture');
        const adoption = git('rev-parse', 'HEAD');
        mkdirSync(join(root, '.github'));
        writeFileSync(join(root, '.github', 'commit-policy.json'), JSON.stringify({ adoptionCommit: adoption }));
        writeFileSync(join(root, 'example.js'), 'export const value = 2;\n');
        git('add', '.');
        git('commit', '-q', '-m', 'fix: current behavior');
        assert.equal(resolvePolicyBase('HEAD', 'origin', root), adoption);
        git('update-ref', 'refs/remotes/origin/main', 'HEAD');
        const remoteMain = git('rev-parse', 'HEAD');
        writeFileSync(join(root, 'example.js'), 'export const value = 3;\n');
        git('add', '.');
        git('commit', '-q', '-m', 'fix: topic behavior');
        assert.equal(resolvePolicyBase('HEAD', 'origin', root), remoteMain);
        writeFileSync(join(root, '.github', 'commit-policy.json'), JSON.stringify({ adoptionCommit: '0'.repeat(40) }));
        assert.equal(resolvePolicyBase('HEAD', 'other', root), 'ALL');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
