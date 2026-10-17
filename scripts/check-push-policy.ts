import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { resolvePolicyBase } from './lib/policyBase.ts';

const updates = readFileSync(0, 'utf8').trim().split('\n').filter(Boolean);
for (const update of updates) {
    const [localRef, localSha, remoteRef, remoteSha] = update.trim().split(/\s+/);
    if (/^0+$/.test(localSha)) continue;
    if (remoteRef === 'refs/heads/main' && !/^0+$/.test(remoteSha))
        throw new Error('Direct pushes to main are prohibited; use a reviewed pull request');
    if (/^refs\/tags\/v/.test(remoteRef)) throw new Error('Version tags require the authorized release process');
    const head = execFileSync('git', ['rev-parse', `${localSha}^{commit}`], { encoding: 'utf8' }).trim();
    const base = /^0+$/.test(remoteSha) ? resolvePolicyBase(head, process.argv[2] ?? 'origin') : remoteSha;
    for (const args of [
        ['scripts/check-commits.ts', base, head],
        ['scripts/check-repository-policy.ts', base, head],
    ]) {
        const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`Push policy failed for ${localRef}`);
    }
}
