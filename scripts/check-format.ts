import { spawnSync } from 'node:child_process';

const targets = [
    '*.{json,js,ts,mts}',
    'README.md',
    '.editorconfig',
    '.github/**/*.{yml,json}',
    'CONTRIBUTING.md',
    'docs/README.md',
    'docs/blinkfx/**/*.md',
    'docs/architecture/**/*.md',
    'docs/development/**/*.md',
    'scripts/**/*.ts',
];
const result = spawnSync(
    process.execPath,
    ['node_modules/prettier/bin/prettier.cjs', '--check', '--ignore-unknown', ...targets],
    {
        stdio: 'inherit',
    }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
