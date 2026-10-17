import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { messageViolations } from './lib/commitPolicy.ts';

const [base, head = 'HEAD'] = process.argv.slice(2);
if (!base) throw new Error('Usage: node scripts/check-commits.ts <base> [head]');
const commits = execFileSync('git', ['rev-list', base === 'ALL' ? head : `${base}..${head}`], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
let failed = false;
for (const commit of commits) {
    const message = execFileSync('git', ['show', '-s', '--format=%B', commit], { encoding: 'utf8' });
    const result = spawnSync(process.execPath, ['node_modules/@commitlint/cli/cli.js'], {
        input: message,
        encoding: 'utf8',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        failed = true;
        console.error(`${commit}: ${result.stdout}${result.stderr}`);
    }
}
if (process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) as {
        pull_request?: { title: string; body?: string | null };
    };
    if (event.pull_request) {
        const violations = messageViolations(`${event.pull_request.title}\n${event.pull_request.body ?? ''}`);
        if (violations.length) {
            failed = true;
            console.error(violations.join('\n'));
        }
        const result = spawnSync(process.execPath, ['node_modules/@commitlint/cli/cli.js'], {
            input: event.pull_request.title,
            encoding: 'utf8',
        });
        if (result.error) throw result.error;
        if (result.status !== 0) {
            failed = true;
            console.error(`PR title: ${result.stdout}${result.stderr}`);
        }
    }
}
process.exitCode = failed ? 1 : 0;
