import { spawnSync } from 'node:child_process';
import { corpusRoot } from './lib/workspacePaths.ts';

const result = spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.private.config.ts', ...process.argv.slice(2)],
    {
        stdio: 'inherit',
        env: { ...process.env, BLINK_CORPUS_ROOT: corpusRoot() },
    }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
