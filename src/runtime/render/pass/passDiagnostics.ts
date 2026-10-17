import type { BlinkPassTarget, BlinkRenderTargetSpec } from '../../ir/types';
import type { RenderTargetPool } from './RenderTargetPool';

export interface PassDiagnostics {
    name: string;
    resolution: readonly [number, number];
    format: string;
}

/**
 * Project a compiled pass list into per-pass diagnostics for a debug panel:
 * each pass's resolved output resolution and declared color format. A
 * render-target pass reports the pool's allocated size and that target's
 * declared format; the screen pass reports the current screen size and the
 * literal `'screen'` (the backbuffer has no BlinkFX-declared color format).
 *
 * `renderTargets` must be the same spec list the pool was built from - a
 * pass naming a render target neither declares is a build()-time invariant
 * violation, not something this projection can recover from silently.
 */
export function computePassDiagnostics(
    passes: ReadonlyArray<{ name: string; target: BlinkPassTarget }>,
    pool: RenderTargetPool,
    screenSize: readonly [number, number],
    renderTargets: readonly BlinkRenderTargetSpec[]
): readonly PassDiagnostics[] {
    return passes.map(pass => {
        if (pass.target.kind === 'screen') {
            return { name: pass.name, resolution: screenSize, format: 'screen' };
        }
        const targetName = pass.target.name;
        const spec = renderTargets.find(rt => rt.name === targetName);
        if (spec === undefined) {
            throw new Error(
                `computePassDiagnostics: pass "${pass.name}" targets undeclared render target "${targetName}"`
            );
        }
        return { name: pass.name, resolution: pool.size(targetName), format: spec.format };
    });
}
