import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function resolvePolicyBase(head = 'HEAD', remote = 'origin', cwd = process.cwd()) {
    const git = (args: string[]) => {
        const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
        if (result.error) throw result.error;
        return result.status === 0 ? result.stdout.trim() : null;
    };
    if (!/^[A-Za-z0-9._-]+$/.test(remote)) throw new Error('Invalid Git remote name');
    const remoteMain = git(['merge-base', `refs/remotes/${remote}/main`, head]);
    if (remoteMain) return remoteMain;
    const config = resolve(cwd, '.github/commit-policy.json');
    if (existsSync(config)) {
        const { adoptionCommit } = JSON.parse(readFileSync(config, 'utf8')) as { adoptionCommit: string };
        if (!/^[a-f0-9]{40,64}$/.test(adoptionCommit)) throw new Error('Invalid policy adoption commit');
        if (git(['merge-base', '--is-ancestor', adoptionCommit, head]) !== null) return adoptionCommit;
    }
    return 'ALL';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    console.log(resolvePolicyBase(process.argv[2], process.argv[3]));
}
