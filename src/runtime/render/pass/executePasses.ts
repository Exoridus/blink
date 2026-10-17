import type { Color, Mesh, MeshMaterial, RenderTexture, UniformValue } from '@codexo/exojs';

import type { BlinkSourceRef } from '../../ir/sourceRef';
import type { BlinkPassTarget } from '../../ir/types';
import type { PassInputPlan } from './planPasses';
import type { RenderTargetPool } from './RenderTargetPool';

export interface CompiledPass {
    name: string;
    mesh: Mesh;
    material: MeshMaterial;
    target: BlinkPassTarget;
    inputs: PassInputPlan[];
    clear: boolean;
    passIndex: number;
}

/**
 * The subset of ExoJS RenderingContext this loop needs. Declared narrowly so
 * the executor is unit-testable with a plain recording fake.
 */
export interface PassDrawContext {
    renderTo(node: Mesh, options: { target: RenderTexture; clear?: Color }): void;
    render(node: Mesh, options?: { view?: unknown }): void;
    readonly screenView: unknown;
}

/**
 * Run one frame of the pass graph. For each pass in order: upload the shared
 * frame/audio/control uniforms (+ bl_pass) via `uploadFrameUniforms`, with
 * `bl_resolution` set to that pass's own output size (the render target's
 * allocated size for a render-target pass, `screenSize` for the screen pass),
 * per BlinkFX v1 spec §10.1. Then bind each input sampler to whatever
 * `resolveInput` resolves its source to (a pool texture for a target source,
 * or a store-backed resource for an asset, host input or Blink audio surface,
 * falling back to the dummy texture when that resource is not ready). Samplers
 * the shared shader declares but this pass does not bind are left out of the
 * pass material's schema altogether. Then draw: off-screen into the pool for a render-target pass, or to the
 * active target for the screen pass. Parity is chosen by the caller and
 * flipped after this returns.
 */
export function executePasses(
    context: PassDrawContext,
    passes: readonly CompiledPass[],
    pool: RenderTargetPool,
    parity: number,
    clearColor: Color,
    uploadFrameUniforms: (material: MeshMaterial, passIndex: number, resolution: readonly [number, number]) => void,
    resolveInput: (source: BlinkSourceRef, parity: number) => UniformValue,
    screenSize: readonly [number, number]
): void {
    for (const pass of passes) {
        const resolution = pass.target.kind === 'renderTarget' ? pool.size(pass.target.name) : screenSize;
        uploadFrameUniforms(pass.material, pass.passIndex, resolution);

        for (const input of pass.inputs) {
            pass.material.setUniform(input.uniform, resolveInput(input.source, parity));
        }

        if (pass.target.kind === 'renderTarget') {
            context.renderTo(pass.mesh, {
                target: pool.write(pass.target.name, parity),
                clear: pass.clear ? clearColor : undefined,
            });
        } else {
            context.render(pass.mesh, { view: context.screenView });
        }
    }
}
