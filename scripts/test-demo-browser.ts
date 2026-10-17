import { spawnSync } from 'node:child_process';
import { DEMO_MUSIC } from '../src/data/demoMusic.ts';

for (const track of DEMO_MUSIC) {
    const result = spawnSync(process.execPath, ['scripts/ci-browser-smoke.ts'], {
        stdio: 'inherit',
        env: { ...process.env, BLINK_SMOKE_SOURCE: 'demo', BLINK_SMOKE_TRACK: track.id },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        break;
    }
}
