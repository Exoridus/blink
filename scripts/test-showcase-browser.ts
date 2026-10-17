import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const release = JSON.parse(readFileSync('public/release-effects.json', 'utf8')) as { packages: string[] };
for (const name of release.packages) {
    if (!/^[A-Za-z0-9_-]+\.blinkfx$/.test(name)) throw new Error('Invalid showcase package name');
    const manifest = JSON.parse(readFileSync(`public/effects/${name}/manifest.json`, 'utf8')) as { id: string };
    const result = spawnSync(process.execPath, ['scripts/ci-browser-smoke.ts'], {
        stdio: 'inherit',
        env: { ...process.env, BLINK_SMOKE_EFFECT: manifest.id },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        break;
    }
}
