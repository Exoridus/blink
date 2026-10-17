import { parseSizeExpression, SizeExpressionError } from '../../runtime/ir/sizeExpression';
import type { BlinkFxManifest } from './manifest';
import { validateManifestReferences } from './validateReferences';

type BlinkFxControlType = 'float' | 'int' | 'bool' | 'color' | 'enum' | 'point2d' | 'bang';

type ValidationResult = { valid: true } | { valid: false; errors: string[] };

function fail(errors: string[]): ValidationResult {
    return { valid: false, errors };
}

function ok(): ValidationResult {
    return { valid: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
    return isString(value) && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(isString);
}

function isStringRecord(value: unknown): value is Record<string, string> {
    if (!isRecord(value)) {
        return false;
    }
    return Object.values(value).every(isString);
}

const VALID_CONTROL_TYPES = new Set(['float', 'int', 'bool', 'color', 'enum', 'point2d', 'bang']);

function validateControl(control: unknown, index: number): string[] {
    const errors: string[] = [];
    const prefix = `controls[${index}]`;

    if (!isRecord(control)) {
        errors.push(`${prefix}: must be an object`);
        return errors;
    }

    if (!isNonEmptyString(control.name)) {
        errors.push(`${prefix}.name: must be a non-empty string`);
    }

    if (!isString(control.type) || !VALID_CONTROL_TYPES.has(control.type)) {
        errors.push(`${prefix}.type: must be one of ${[...VALID_CONTROL_TYPES].join(', ')}`);
        return errors;
    }

    const type = control.type as BlinkFxControlType;

    switch (type) {
        case 'float':
        case 'int': {
            if (typeof control.default !== 'number') {
                errors.push(`${prefix}.default: must be a number`);
            }
            if (control.min !== undefined && typeof control.min !== 'number') {
                errors.push(`${prefix}.min: must be a number`);
            }
            if (control.max !== undefined && typeof control.max !== 'number') {
                errors.push(`${prefix}.max: must be a number`);
            }
            if (control.step !== undefined && typeof control.step !== 'number') {
                errors.push(`${prefix}.step: must be a number`);
            }
            break;
        }
        case 'bool': {
            if (typeof control.default !== 'boolean') {
                errors.push(`${prefix}.default: must be a boolean`);
            }
            break;
        }
        case 'color': {
            if (
                !Array.isArray(control.default) ||
                control.default.length !== 4 ||
                control.default.some(v => typeof v !== 'number')
            ) {
                errors.push(`${prefix}.default: must be [number, number, number, number]`);
            }
            break;
        }
        case 'enum': {
            if (!isString(control.default)) {
                errors.push(`${prefix}.default: must be a string`);
            }
            if (!Array.isArray(control.options) || !control.options.every(isString)) {
                errors.push(`${prefix}.options: must be a string array`);
            }
            break;
        }
        case 'point2d': {
            if (
                !Array.isArray(control.default) ||
                control.default.length !== 2 ||
                control.default.some(v => typeof v !== 'number')
            ) {
                errors.push(`${prefix}.default: must be [number, number]`);
            }
            break;
        }
        case 'bang': {
            break;
        }
    }

    if (control.label !== undefined && !isString(control.label)) {
        errors.push(`${prefix}.label: must be a string`);
    }
    if (control.description !== undefined && !isString(control.description)) {
        errors.push(`${prefix}.description: must be a string`);
    }
    if (control.group !== undefined && !isString(control.group)) {
        errors.push(`${prefix}.group: must be a string`);
    }

    return errors;
}

function validateSampling(sampling: unknown, prefix: string): string[] {
    if (!isRecord(sampling)) return [`${prefix}: must be an object`];
    const errors: string[] = [];
    if (sampling.filter !== undefined && !['nearest', 'linear', 'mipmap'].includes(sampling.filter as string)) {
        errors.push(`${prefix}.filter: must be one of nearest, linear, mipmap`);
    }
    if (sampling.wrap !== undefined && !['clamp', 'repeat', 'mirror'].includes(sampling.wrap as string)) {
        errors.push(`${prefix}.wrap: must be one of clamp, repeat, mirror`);
    }
    return errors;
}

function validateAsset(asset: unknown, index: number): string[] {
    const errors: string[] = [];
    const prefix = `assets[${index}]`;

    if (!isRecord(asset)) {
        errors.push(`${prefix}: must be an object`);
        return errors;
    }

    if (!isNonEmptyString(asset.name)) {
        errors.push(`${prefix}.name: must be a non-empty string`);
    }

    if (asset.type !== 'texture2d') {
        errors.push(`${prefix}.type: must be "texture2d"`);
    }

    if (asset.sampling !== undefined) errors.push(...validateSampling(asset.sampling, `${prefix}.sampling`));

    if (!isNonEmptyString(asset.path)) {
        errors.push(`${prefix}.path: must be a non-empty string`);
    }

    return errors;
}

const VALID_INPUT_TYPES = new Set(['image', 'audio', 'audioFFT', 'audioTexture', 'pointer', 'keyboard']);

function validateInput(input: unknown, index: number, seenNames: Set<string>): string[] {
    const errors: string[] = [];
    const prefix = `inputs[${index}]`;

    if (!isRecord(input)) {
        errors.push(`${prefix}: must be an object`);
        return errors;
    }

    if (!isNonEmptyString(input.name)) {
        errors.push(`${prefix}.name: must be a non-empty string`);
    } else if (seenNames.has(input.name)) {
        errors.push(`${prefix}.name: "${input.name}" is already used`);
    } else {
        seenNames.add(input.name);
    }

    if (!isString(input.type) || !VALID_INPUT_TYPES.has(input.type)) {
        errors.push(`${prefix}.type: must be one of ${[...VALID_INPUT_TYPES].join(', ')}`);
    }

    if (input.sampling !== undefined) {
        errors.push(...validateSampling(input.sampling, `${prefix}.sampling`));
        if (input.type !== 'image') errors.push(`${prefix}.sampling: only permitted when type is "image"`);
    }

    if (input.required !== undefined && typeof input.required !== 'boolean') {
        errors.push(`${prefix}.required: must be a boolean`);
    }

    if (input.samples !== undefined) {
        if (typeof input.samples !== 'number' || !Number.isInteger(input.samples) || input.samples <= 0) {
            errors.push(`${prefix}.samples: must be a positive integer`);
        }
    }

    if (input.representation !== undefined) {
        if (input.representation !== 'spectrum-waveform') {
            errors.push(`${prefix}.representation: must be "spectrum-waveform"`);
        } else if (input.type !== 'audioTexture') {
            errors.push(`${prefix}.representation: only permitted when type is "audioTexture"`);
        }
    }

    return errors;
}

function validatePass(pass: unknown, index: number): string[] {
    const errors: string[] = [];
    const prefix = `passes[${index}]`;

    if (!isRecord(pass)) {
        errors.push(`${prefix}: must be an object`);
        return errors;
    }

    if (!isNonEmptyString(pass.name)) {
        errors.push(`${prefix}.name: must be a non-empty string`);
    }

    if (!isNonEmptyString(pass.shader)) {
        errors.push(`${prefix}.shader: must be a non-empty string`);
    }

    if (pass.inputs !== undefined) {
        if (!Array.isArray(pass.inputs)) {
            errors.push(`${prefix}.inputs: must be an array`);
        } else {
            pass.inputs.forEach((input: unknown, i: number) => {
                if (isString(input)) {
                    return;
                }
                if (!isRecord(input)) {
                    errors.push(`${prefix}.inputs[${i}]: must be a string or a { source, uniform } object`);
                    return;
                }
                if (!isNonEmptyString(input.source)) {
                    errors.push(`${prefix}.inputs[${i}].source: must be a non-empty string`);
                }
                if (!isNonEmptyString(input.uniform)) {
                    errors.push(`${prefix}.inputs[${i}].uniform: must be a non-empty string`);
                }
            });
        }
    }

    if (pass.clear !== undefined && typeof pass.clear !== 'boolean') {
        errors.push(`${prefix}.clear: must be a boolean`);
    }

    if (pass.target !== undefined && pass.target !== 'screen') {
        if (isRecord(pass.target)) {
            errors.push(...validateRenderTarget(pass.target, `${prefix}.target`));
        } else {
            errors.push(`${prefix}.target: must be "screen" or a render target object`);
        }
    }

    return errors;
}

const DESCRIPTOR_KEYS = ['fragment', 'vertex', 'audio'] as const;

function validateGlslDescriptor(value: unknown, where: string): string[] {
    if (isString(value)) {
        return [];
    }
    if (!isRecord(value)) {
        return [`${where}: must be a path string, a { fragment, vertex? } object or an { audio } object`];
    }

    const errors: string[] = [];
    for (const key of Object.keys(value)) {
        if (!(DESCRIPTOR_KEYS as readonly string[]).includes(key)) {
            errors.push(`${where}: unknown key "${key}"`);
        }
    }
    const hasAudio = value.audio !== undefined;
    if (hasAudio && (value.fragment !== undefined || value.vertex !== undefined)) {
        errors.push(`${where}: "audio" cannot be combined with "fragment" or "vertex"`);
    }
    if (!hasAudio && value.fragment === undefined) {
        errors.push(`${where}.fragment: required (a { vertex } object needs the fragment stage it pairs with)`);
    }
    for (const key of DESCRIPTOR_KEYS) {
        if (value[key] !== undefined && !isNonEmptyString(value[key])) {
            errors.push(`${where}.${key}: must be a non-empty string`);
        }
    }
    return errors;
}

function validateGlslShaders(glsl: unknown): string[] {
    if (isString(glsl)) {
        return [];
    }
    if (!isRecord(glsl)) {
        return ['shaders.glsl: must be a string or a record of named shaders'];
    }
    return Object.entries(glsl).flatMap(([name, value]) => validateGlslDescriptor(value, `shaders.glsl.${name}`));
}

const TARGET_FORMATS = new Set(['rgba8', 'rgba16f', 'rgba32f']);

function validateDimension(value: unknown, where: string): string[] {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? [] : [`${where}: must be a positive finite number`];
    }
    if (typeof value === 'string') {
        try {
            parseSizeExpression(value);
            return [];
        } catch (error) {
            if (error instanceof SizeExpressionError) {
                return [`${where}: invalid size expression "${value}" (${error.message})`];
            }
            throw error;
        }
    }
    return [`${where}: must be a number or a size expression string`];
}

function validateRenderTarget(target: Record<string, unknown>, prefix: string): string[] {
    const errors: string[] = [];

    if (!isNonEmptyString(target.name)) {
        errors.push(`${prefix}.name: must be a non-empty string`);
    }
    for (const key of ['width', 'height'] as const) {
        if (target[key] !== undefined) {
            errors.push(...validateDimension(target[key], `${prefix}.${key}`));
        }
    }
    if (target.scale !== undefined) {
        if (typeof target.scale !== 'number' || !Number.isFinite(target.scale) || target.scale <= 0) {
            errors.push(`${prefix}.scale: must be a positive finite number`);
        }
        if (target.width !== undefined || target.height !== undefined) {
            errors.push(`${prefix}: use either "scale" or "width"/"height", not both`);
        }
    }
    if (target.format !== undefined && !(typeof target.format === 'string' && TARGET_FORMATS.has(target.format))) {
        errors.push(`${prefix}.format: must be one of rgba8, rgba16f, rgba32f`);
    }
    if (target.sampling !== undefined) errors.push(...validateSampling(target.sampling, `${prefix}.sampling`));

    if (target.persistent !== undefined && typeof target.persistent !== 'boolean') {
        errors.push(`${prefix}.persistent: must be a boolean`);
    }

    return errors;
}

function validatePreset(preset: unknown, index: number): string[] {
    const errors: string[] = [];
    const prefix = `presets[${index}]`;

    if (!isRecord(preset)) {
        errors.push(`${prefix}: must be an object`);
        return errors;
    }

    if (!isNonEmptyString(preset.name)) {
        errors.push(`${prefix}.name: must be a non-empty string`);
    }

    if (!isNonEmptyString(preset.path)) {
        errors.push(`${prefix}.path: must be a non-empty string`);
    }

    return errors;
}

const VALID_FEATURES = new Set([
    'float-targets',
    'persistent-feedback',
    'dynamic-target-size',
    'external-image-inputs',
    'pointer-input',
    'keyboard-input',
    'audio-waveform-input',
    'audio-fft-input',
    'audio-texture-input',
    'audio-generation',
    'audio-spectrum',
    'audio-level-trail',
    'script:blink/1',
    'script:ssf/1',
    'sync-final-pass-readback',
]);

const VALID_BACKENDS = new Set(['webgl2', 'webgpu']);
const VALID_FALLBACK_STRATEGIES = new Set(['fail', 'disable', 'rgba8', 'approximate']);

function validateOutputs(outputs: unknown): string[] {
    const errors: string[] = [];

    if (!isRecord(outputs)) {
        errors.push('outputs: must be an object');
        return errors;
    }

    if (outputs.visual !== undefined && typeof outputs.visual !== 'boolean') {
        errors.push('outputs.visual: must be a boolean');
    }

    if (outputs.audio !== undefined) {
        if (!isRecord(outputs.audio)) {
            errors.push('outputs.audio: must be an object');
        } else {
            if (!isNonEmptyString(outputs.audio.shader)) {
                errors.push('outputs.audio.shader: must be a non-empty string');
            }
            if (outputs.audio.abi !== undefined && !isNonEmptyString(outputs.audio.abi)) {
                errors.push('outputs.audio.abi: must be a non-empty string');
            }
            if (
                outputs.audio.channels !== undefined &&
                (typeof outputs.audio.channels !== 'number' ||
                    !Number.isInteger(outputs.audio.channels) ||
                    outputs.audio.channels < 1)
            ) {
                errors.push('outputs.audio.channels: must be a positive integer');
            }
            if (
                outputs.audio.sampleRate !== undefined &&
                outputs.audio.sampleRate !== 'device' &&
                (typeof outputs.audio.sampleRate !== 'number' || outputs.audio.sampleRate <= 0)
            ) {
                errors.push('outputs.audio.sampleRate: must be a positive number or "device"');
            }
        }
    }

    return errors;
}

function validateRequirements(requirements: unknown): string[] {
    const errors: string[] = [];

    if (!isRecord(requirements)) {
        errors.push('requirements: must be an object');
        return errors;
    }

    if (requirements.features !== undefined) {
        if (!isStringArray(requirements.features)) {
            errors.push('requirements.features: must be a string array');
        } else {
            // A misspelled identifier must not pass as a requirement nothing enforces: an unknown
            // feature would be checked against nothing and the package would load as if it had asked
            // for nothing.
            for (const feature of requirements.features) {
                if (!VALID_FEATURES.has(feature)) {
                    errors.push(`requirements.features: unknown feature "${feature}"`);
                }
            }
        }
    }

    if (requirements.backends !== undefined) {
        if (!isStringArray(requirements.backends)) {
            errors.push('requirements.backends: must be a string array');
        } else {
            for (const backend of requirements.backends) {
                if (!VALID_BACKENDS.has(backend)) {
                    errors.push(`requirements.backends: unknown backend "${backend}"`);
                }
            }
        }
    }

    return errors;
}

function validateFallbacks(fallbacks: unknown): string[] {
    const errors: string[] = [];

    if (!isRecord(fallbacks)) {
        errors.push('fallbacks: must be an object');
        return errors;
    }

    for (const [feature, strategy] of Object.entries(fallbacks)) {
        if (feature !== 'script' && !VALID_FEATURES.has(feature)) {
            errors.push(`fallbacks: unknown feature "${feature}"`);
        }
        if (!isString(strategy) || !VALID_FALLBACK_STRATEGIES.has(strategy)) {
            errors.push(`fallbacks.${feature}: must be one of ${[...VALID_FALLBACK_STRATEGIES].join(', ')}`);
        }
    }

    return errors;
}

const VALID_KINDS = new Set(['generator', 'filter', 'transition']);
const VALID_COMPATIBILITY_MODES = new Set(['preserve', 'native']);

function validateCompatibility(compatibility: unknown): string[] {
    const errors: string[] = [];

    if (!isRecord(compatibility)) {
        errors.push('compatibility: must be an object');
        return errors;
    }

    if (compatibility.source !== undefined) {
        if (!isRecord(compatibility.source)) {
            errors.push('compatibility.source: must be an object');
        } else {
            if (!isNonEmptyString(compatibility.source.format)) {
                errors.push('compatibility.source.format: must be a non-empty string');
            }
            if (compatibility.source.version !== undefined && !isString(compatibility.source.version)) {
                errors.push('compatibility.source.version: must be a string');
            }
        }
    }

    if (compatibility.profile !== undefined && !isNonEmptyString(compatibility.profile)) {
        errors.push('compatibility.profile: must be a non-empty string');
    }

    if (
        compatibility.mode !== undefined &&
        (!isString(compatibility.mode) || !VALID_COMPATIBILITY_MODES.has(compatibility.mode))
    ) {
        errors.push(`compatibility.mode: must be one of ${[...VALID_COMPATIBILITY_MODES].join(', ')}`);
    }

    if (compatibility.converter !== undefined && !isString(compatibility.converter)) {
        errors.push('compatibility.converter: must be a string');
    }

    return errors;
}

function validateScript(script: unknown): string[] {
    const errors: string[] = [];

    if (!isRecord(script)) {
        errors.push('script: must be an object');
        return errors;
    }

    if (!isNonEmptyString(script.entry)) {
        errors.push('script.entry: must be a non-empty string');
    }

    if (script.abi !== undefined && !isNonEmptyString(script.abi)) {
        errors.push('script.abi: must be a non-empty string');
    }

    if (script.events !== undefined) {
        if (!Array.isArray(script.events)) {
            errors.push('script.events: must be an array');
        } else {
            script.events.forEach((event: unknown, i: number) => {
                if (!isRecord(event)) {
                    errors.push(`script.events[${i}]: must be an object`);
                    return;
                }
                if (!isNonEmptyString(event.input)) {
                    errors.push(`script.events[${i}].input: must be a non-empty string`);
                }
                const validEvents = new Set(['change', 'offToOn', 'onToOff', 'whileOn', 'whileOff']);
                if (!isString(event.on) || !validEvents.has(event.on)) {
                    errors.push(`script.events[${i}].on: must be one of ${[...validEvents].join(', ')}`);
                }
                if (!isNonEmptyString(event.handler)) {
                    errors.push(`script.events[${i}].handler: must be a non-empty string`);
                }
            });
        }
    }

    return errors;
}

export function validateBlinkFxManifest(raw: unknown): ValidationResult {
    if (!isRecord(raw)) {
        return fail(['manifest: must be an object']);
    }

    const errors: string[] = [];

    if (raw.format !== 'blinkfx/1') {
        errors.push('format: must be "blinkfx/1"');
    }

    if (!isNonEmptyString(raw.id)) {
        errors.push('id: must be a non-empty string');
    }

    if (!isNonEmptyString(raw.title)) {
        errors.push('title: must be a non-empty string');
    }

    if (raw.version !== undefined && !isString(raw.version)) {
        errors.push('version: must be a string');
    }

    if (raw.kind !== undefined && (!isString(raw.kind) || !VALID_KINDS.has(raw.kind))) {
        errors.push(`kind: must be one of ${[...VALID_KINDS].join(', ')}`);
    }

    if (raw.author !== undefined && !isString(raw.author)) {
        errors.push('author: must be a string');
    }
    if (raw.description !== undefined && !isString(raw.description)) {
        errors.push('description: must be a string');
    }
    if (raw.license !== undefined && !isString(raw.license)) {
        errors.push('license: must be a string');
    }
    if (raw.thumbnail !== undefined && !isString(raw.thumbnail)) {
        errors.push('thumbnail: must be a string');
    }

    if (raw.tags !== undefined) {
        if (!isStringArray(raw.tags)) {
            errors.push('tags: must be a string array');
        }
    }

    if (!isRecord(raw.shaders)) {
        errors.push('shaders: must be an object');
    } else {
        const hasGlsl = raw.shaders.glsl !== undefined;
        const hasWgsl = raw.shaders.wgsl !== undefined;

        if (!hasGlsl && !hasWgsl) {
            errors.push('shaders: must contain at least one of "glsl" or "wgsl"');
        }

        if (hasGlsl) {
            errors.push(...validateGlslShaders(raw.shaders.glsl));
        }

        if (hasWgsl && !isString(raw.shaders.wgsl) && !isStringRecord(raw.shaders.wgsl)) {
            errors.push('shaders.wgsl: must be a string or a record of named shader paths');
        }
    }

    if (raw.controls !== undefined) {
        if (!Array.isArray(raw.controls)) {
            errors.push('controls: must be an array');
        } else {
            raw.controls.forEach((c: unknown, i: number) => {
                errors.push(...validateControl(c, i));
            });
        }
    }

    if (raw.inputs !== undefined) {
        if (!Array.isArray(raw.inputs)) {
            errors.push('inputs: must be an array');
        } else {
            const seenNames = new Set<string>();
            raw.inputs.forEach((i: unknown, index: number) => {
                errors.push(...validateInput(i, index, seenNames));
            });
        }
    }

    if (raw.assets !== undefined) {
        if (!Array.isArray(raw.assets)) {
            errors.push('assets: must be an array');
        } else {
            raw.assets.forEach((a: unknown, i: number) => {
                errors.push(...validateAsset(a, i));
            });
        }
    }

    if (raw.passes !== undefined) {
        if (!Array.isArray(raw.passes)) {
            errors.push('passes: must be an array');
        } else {
            raw.passes.forEach((p: unknown, i: number) => {
                errors.push(...validatePass(p, i));
            });
        }
    }

    if (raw.presets !== undefined) {
        if (!Array.isArray(raw.presets)) {
            errors.push('presets: must be an array');
        } else {
            raw.presets.forEach((p: unknown, i: number) => {
                errors.push(...validatePreset(p, i));
            });
        }
    }

    if (raw.script !== undefined) {
        errors.push(...validateScript(raw.script));
    }

    if (raw.outputs !== undefined) {
        errors.push(...validateOutputs(raw.outputs));
    }

    if (raw.requirements !== undefined) {
        errors.push(...validateRequirements(raw.requirements));
    }

    if (raw.fallbacks !== undefined) {
        errors.push(...validateFallbacks(raw.fallbacks));
    }

    if (raw.compatibility !== undefined) {
        errors.push(...validateCompatibility(raw.compatibility));
    }

    // Tooling-only metadata: the shape of its entries is deliberately unconstrained,
    // so only the container is checked.
    if (raw.diagnostics !== undefined && !isRecord(raw.diagnostics)) {
        errors.push('diagnostics: must be an object');
    }

    if (errors.length === 0) {
        errors.push(...validateManifestReferences(raw as unknown as BlinkFxManifest));
    }

    if (errors.length > 0) {
        return fail(errors);
    }

    return ok();
}
