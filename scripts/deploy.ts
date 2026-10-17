#!/usr/bin/env node
/**
 * Builds Blink for a sub-path and ships it to the VPS.
 *
 * Usage: node scripts/deploy.ts [dev|live]
 *
 * Two things make this a script rather than a shell one-liner: the base path
 * must reach Vite as an environment variable (a leading slash gets rewritten
 * to a Windows path by MSYS shells), and the remote swap has to be atomic so
 * a visitor never sees a half-copied build.
 */
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, rmSync } from 'node:fs';

const TARGETS: Record<string, { base: string; remote: string } | undefined> = {
    // Prototype shelf, linked ad hoc, excluded from indexing.
    dev: { base: '/dev/blink/', remote: '/srv/dev/blink' },
    // Reserved for the day Blink gets a permanent spot on codexo.de.
    live: { base: '/blink/', remote: '/srv/blink' },
};

const SSH_HOST = 'vps';

const targetName = process.argv[2] ?? 'dev';
const target = TARGETS[targetName];

if (target === undefined) {
    console.error(`Unknown target "${targetName}". Expected one of: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
}

function run(command: string, args: string[], options: import('node:child_process').SpawnSyncOptions = {}) {
    const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) {
        console.error(`\nFailed: ${command} ${args.join(' ')} (exit ${result.status})`);
        process.exit(result.status ?? 1);
    }
}

console.log(`Building with base ${target.base} …`);
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    env: { ...process.env, BLINK_BASE: target.base },
});

// Kept beside the project rather than in the system temp dir: the tar on PATH
// is GNU tar, which reads a Windows absolute path as a remote "host:path" spec.
const archive = `.blink-deploy-${process.pid}.tgz`;
run('tar', ['-czf', archive, '-C', 'dist', '.']);

// Staging directory first, then a rename: the served path is either the old
// build or the new one, never a mix. Joined with "; " rather than newlines
// because ssh flattens argv into a single command string, where a literal
// newline would not survive.
const remoteScript = [
    'set -e',
    `rm -rf ${target.remote}.new`,
    `mkdir -p ${target.remote}.new`,
    `tar xzf - -C ${target.remote}.new`,
    `chown -R deploy:deploy ${target.remote}.new`,
    `rm -rf ${target.remote}.old`,
    `if [ -d ${target.remote} ]; then mv ${target.remote} ${target.remote}.old; fi`,
    `mv ${target.remote}.new ${target.remote}`,
    `rm -rf ${target.remote}.old`,
].join('; ');

console.log(`Shipping to ${SSH_HOST}:${target.remote} …`);
const archiveFd = openSync(archive, 'r');
try {
    // The remote shell re-splits what ssh sends, so the script travels as one
    // single-quoted word. It contains no apostrophes, which keeps this safe.
    run('ssh', [SSH_HOST, 'sudo', 'sh', '-c', `'${remoteScript}'`], {
        stdio: [archiveFd, 'inherit', 'inherit'],
    });
} finally {
    closeSync(archiveFd);
    rmSync(archive, { force: true });
}

console.log(`Done: https://codexo.de${target.base}`);
