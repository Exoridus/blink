import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { addedLineViolations, patchViolations } from './lib/commitPolicy.ts';

const args = process.argv.slice(2);
const staged = args.includes('--staged');
const [base, head = 'HEAD'] = args.filter(arg => arg !== '--staged');
const diffArgs = ['diff', '--no-ext-diff', '--unified=0'];
if (staged) diffArgs.push('--cached');
else if (base && base !== 'ALL') diffArgs.push(`${base}...${head}`);
else diffArgs.push('HEAD');
diffArgs.push('--', 'src', 'scripts', 'docs', 'README.md', 'CONTRIBUTING.md', 'AGENTS.md');
const violations =
    base === 'ALL'
        ? []
        : patchViolations(execFileSync('git', diffArgs, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
if (base === 'ALL') {
    const names = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', head], { encoding: 'utf8' }).split('\0');
    for (const path of names.filter(path => /^(?:src\/|scripts\/|docs\/)|^(?:README|CONTRIBUTING)\.md$/.test(path))) {
        if (/\.(?:ts|mts|js|mjs|md)$/.test(path)) {
            const source = execFileSync('git', ['show', `${head}:${path}`], {
                encoding: 'utf8',
                maxBuffer: 16 * 1024 * 1024,
            });
            violations.push(...addedLineViolations(path, source.split('\n')));
        }
    }
}
if (!staged && !base) {
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
    for (const path of untracked
        .split('\0')
        .filter(path => /^(?:src\/|scripts\/|docs\/)|^(?:README|CONTRIBUTING)\.md$/.test(path))) {
        if (/\.(?:ts|mts|js|mjs|md)$/.test(path))
            violations.push(...addedLineViolations(path, readFileSync(path, 'utf8').split('\n')));
    }
}
if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
} else console.log('Repository provenance policy passed');
