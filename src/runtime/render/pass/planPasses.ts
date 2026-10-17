import type { BlinkSourceRef } from '../../ir/sourceRef';
import { formatSourceRef } from '../../ir/sourceRef';
import type { BlinkEffectIR, BlinkPassTarget, BlinkRenderTargetSpec } from '../../ir/types';

export interface PassInputPlan {
    uniform: string;
    source: BlinkSourceRef;
}

export interface PassPlan {
    name: string;
    shaderKey: string;
    target: BlinkPassTarget;
    inputs: PassInputPlan[];
    clear: boolean;
    passIndex: number;
}

export interface EffectPassPlan {
    passes: PassPlan[];
    renderTargets: readonly BlinkRenderTargetSpec[];
}

/**
 * Resolve a BlinkEffectIR into an ordered pass plan. Target references are
 * checked against the declared render targets; a pass reading its own target
 * without an explicit ".previous" is the July feedback shorthand and resolves to
 * the previous frame. Asset, host-input and Blink audio sources pass through for
 * the runtime's resource resolver to bind.
 */
export function planPasses(effect: BlinkEffectIR): EffectPassPlan {
    const targetNames = new Set(effect.renderTargets.map(rt => rt.name));

    const passes: PassPlan[] = effect.passes.map((pass, index) => {
        const ownTarget = pass.target.kind === 'renderTarget' ? pass.target.name : null;

        const inputs: PassInputPlan[] = pass.inputs.map(({ source, uniform }) => {
            if (source.kind !== 'target') {
                return { uniform, source };
            }
            if (!targetNames.has(source.name)) {
                throw new Error(
                    `planPasses: effect "${effect.metadata.id}" pass "${pass.name}" reads ` +
                        `"${formatSourceRef(source)}", which is not a declared render target`
                );
            }
            const previous = source.previous || source.name === ownTarget;
            return { uniform, source: { ...source, previous } };
        });

        return {
            name: pass.name,
            shaderKey: pass.shader,
            target: pass.target,
            inputs,
            clear: pass.clear,
            passIndex: index,
        };
    });

    return { passes, renderTargets: effect.renderTargets };
}
