import { collectControlRefs, parseSizeExpression } from '../../runtime/ir/sizeExpression';
import { parseSourceRef, resolveLegacySourceName, sourceRefResourceName } from '../../runtime/ir/sourceRef';
import type { BlinkFxManifest, BlinkFxPass, BlinkFxPassInput, BlinkFxRenderTarget } from './manifest';

/**
 * Cross-reference validation over a shape-valid manifest: every reference must
 * resolve inside the package, pass order must be acyclic within the frame, and
 * sampler names must not collide inside a pass. Errors are reported with their
 * manifest path so a package author can find them.
 */
export function validateManifestReferences(manifest: BlinkFxManifest): string[] {
    const errors: string[] = [];

    const shaderKeys = new Set<string>();
    for (const backend of [manifest.shaders.glsl, manifest.shaders.wgsl]) {
        if (typeof backend === 'string') {
            shaderKeys.add('main');
        } else if (backend !== undefined) {
            for (const key of Object.keys(backend)) {
                shaderKeys.add(key);
            }
        }
    }

    const assetNames = new Set<string>();
    (manifest.assets ?? []).forEach((asset, i) => {
        if (assetNames.has(asset.name)) {
            errors.push(`assets[${i}].name: "${asset.name}" is already used`);
        }
        assetNames.add(asset.name);
        if (escapesPackage(asset.path)) {
            errors.push(`assets[${i}].path: "${asset.path}" escapes the package root`);
        }
    });

    // Every path the runtime later fetches has to stay inside the package, not just asset paths:
    // a script entry is handed to the module loader and a preset path to fetch, so a traversing
    // one would reach outside the package as readily as an asset would (spec section 21).
    if (manifest.script !== undefined && escapesPackage(manifest.script.entry)) {
        errors.push(`script.entry: "${manifest.script.entry}" escapes the package root`);
    }

    (manifest.presets ?? []).forEach((preset, i) => {
        if (escapesPackage(preset.path)) {
            errors.push(`presets[${i}].path: "${preset.path}" escapes the package root`);
        }
    });

    const audioShader = manifest.outputs?.audio?.shader;
    if (audioShader !== undefined && !shaderKeys.has(audioShader)) {
        errors.push(`outputs.audio.shader: "${audioShader}" is not declared in shaders.glsl or shaders.wgsl`);
    }

    const persistentTargets = new Set<string>();
    const allTargets = new Set<string>();
    for (const pass of manifest.passes ?? []) {
        if (pass.target !== undefined && pass.target !== 'screen') {
            allTargets.add(pass.target.name);
            if (pass.target.persistent === true) {
                persistentTargets.add(pass.target.name);
            }
        }
    }

    const inputNames = new Set((manifest.inputs ?? []).map(input => input.name));
    const known = { targets: allTargets, assets: assetNames };
    const producedSoFar = new Set<string>();
    const passNames = new Set<string>();

    (manifest.passes ?? []).forEach((pass, p) => {
        if (passNames.has(pass.name)) {
            errors.push(`passes[${p}].name: "${pass.name}" is already used`);
        }
        passNames.add(pass.name);

        if (!shaderKeys.has(pass.shader)) {
            errors.push(`passes[${p}].shader: "${pass.shader}" is not declared in shaders.glsl or shaders.wgsl`);
        }

        const boundUniforms = new Set<string>();
        (pass.inputs ?? []).forEach((raw: BlinkFxPassInput, i) => {
            const where = `passes[${p}].inputs[${i}]`;
            const rawText = typeof raw === 'string' ? raw : raw.source;
            const ref = typeof raw === 'string' ? resolveLegacySourceName(raw, known) : parseSourceRef(raw.source);

            if (ref === null) {
                errors.push(`${where}: "${rawText}" does not resolve to a declared resource`);
                return;
            }

            const uniform = typeof raw === 'string' ? sourceRefResourceName(ref) : raw.uniform;
            if (boundUniforms.has(uniform)) {
                errors.push(`${where}.uniform: "${uniform}" is already bound in this pass`);
            }
            boundUniforms.add(uniform);

            switch (ref.kind) {
                case 'asset':
                    if (!assetNames.has(ref.name)) {
                        errors.push(`${where}: asset "${ref.name}" is not declared`);
                    }
                    break;
                case 'hostInput':
                    if (!inputNames.has(ref.name)) {
                        errors.push(`${where}: input "${ref.name}" is not declared`);
                    }
                    break;
                case 'target':
                    if (!allTargets.has(ref.name)) {
                        errors.push(`${where}: target "${ref.name}" is not declared`);
                    } else if (ref.previous) {
                        if (!persistentTargets.has(ref.name)) {
                            errors.push(`${where}: "${rawText}" requires target "${ref.name}" to be persistent`);
                        }
                    } else if (!producedSoFar.has(ref.name) && !isOwnTarget(pass, ref.name)) {
                        errors.push(`${where}: "${rawText}" is not produced before this pass`);
                    }
                    break;
                case 'blinkAudio':
                    break;
            }
        });

        if (pass.target !== undefined && pass.target !== 'screen') {
            producedSoFar.add(pass.target.name);
        }
    });

    errors.push(...validateTargetSizing(manifest), ...validateShaderPaths(manifest), ...validateShaderStages(manifest));

    return errors;
}

/**
 * A pass reading its own target without ".previous" is the July feedback
 * shorthand; the pass planner resolves it to the previous frame, so it is not a
 * forward reference.
 */
function isOwnTarget(pass: BlinkFxPass, name: string): boolean {
    return pass.target !== undefined && pass.target !== 'screen' && pass.target.name === name;
}

function escapesPackage(path: string): boolean {
    if (path.startsWith('/') || /^[a-z]+:/i.test(path)) {
        return true;
    }
    let depth = 0;
    for (const segment of path.split('/')) {
        if (segment === '..') {
            depth -= 1;
            if (depth < 0) {
                return true;
            }
        } else if (segment !== '.' && segment !== '') {
            depth += 1;
        }
    }
    return false;
}

/** Every stage path is fetched at load time, so each has to stay inside the package. */
function validateShaderPaths(manifest: BlinkFxManifest): string[] {
    const errors: string[] = [];
    const check = (path: string, where: string): void => {
        if (escapesPackage(path)) {
            errors.push(`${where}: "${path}" escapes the package root`);
        }
    };

    for (const backend of ['glsl', 'wgsl'] as const) {
        const set = manifest.shaders[backend];
        if (typeof set === 'string') {
            check(set, `shaders.${backend}`);
        } else if (set !== undefined) {
            for (const [name, shader] of Object.entries(set)) {
                const where = `shaders.${backend}.${name}`;
                if (typeof shader === 'string') {
                    check(shader, where);
                    continue;
                }
                for (const [stage, path] of Object.entries(shader)) {
                    check(path as string, `${where}.${stage}`);
                }
            }
        }
    }
    return errors;
}

/** An `audio` program belongs to the audio-output path; a visual pass cannot execute it. */
function validateShaderStages(manifest: BlinkFxManifest): string[] {
    const glsl = manifest.shaders.glsl;
    if (glsl === undefined || typeof glsl === 'string') {
        return [];
    }
    const audioKeys = new Set(
        Object.entries(glsl)
            .filter(([, shader]) => typeof shader !== 'string' && 'audio' in shader)
            .map(([name]) => name)
    );
    return (manifest.passes ?? []).flatMap((pass, p) =>
        audioKeys.has(pass.shader)
            ? [`passes[${p}].shader: "${pass.shader}" is an audio shader and cannot run as a visual pass`]
            : []
    );
}

function validateTargetSizing(manifest: BlinkFxManifest): string[] {
    const controlTypes = new Map((manifest.controls ?? []).map(control => [control.name, control.type]));
    const errors: string[] = [];
    (manifest.passes ?? []).forEach((pass, p) => {
        if (pass.target !== undefined && pass.target !== 'screen') {
            errors.push(...validateSizeControlRefs(pass.target, `passes[${p}].target`, controlTypes));
        }
    });
    return errors;
}

const SIZING_CONTROL_TYPES = new Set(['float', 'int', 'bool']);

/** A target may only be sized by controls that are declared and numeric or boolean. */
function validateSizeControlRefs(
    target: BlinkFxRenderTarget,
    where: string,
    controlTypes: ReadonlyMap<string, string>
): string[] {
    const errors: string[] = [];
    for (const key of ['width', 'height'] as const) {
        const value = target[key];
        if (typeof value !== 'string') {
            continue;
        }
        for (const name of collectControlRefs(parseSizeExpression(value))) {
            const type = controlTypes.get(name);
            if (type === undefined) {
                errors.push(`${where}.${key}: size expression reads "$${name}", which is not a declared control`);
            } else if (!SIZING_CONTROL_TYPES.has(type)) {
                errors.push(
                    `${where}.${key}: size expression reads "$${name}", which is a ${type} control ` +
                        '(only float, int and bool can size a target)'
                );
            }
        }
    }
    return errors;
}
