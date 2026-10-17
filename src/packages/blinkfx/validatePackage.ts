import { expandShaderIncludes } from '../../runtime/shader/expandIncludes';
import type { BlinkFxGlslShader, BlinkFxManifest, BlinkFxPass, BlinkFxRenderTarget } from './manifest';
import type { PackageFiles } from './packageReader';
import { validateBlinkFxManifest } from './validate';
import { validateManifestReferences } from './validateReferences';

export interface PackageFinding {
    readonly severity: 'error' | 'warning';
    readonly code: string;
    readonly message: string;
}

/**
 * Static cost of a package, measured against the reference output size, so a package that
 * cannot run well is found before it is loaded.
 */
export interface PackageBudget {
    readonly passes: number;
    /** Most textures any one pass binds. A mesh material holds at most seven. */
    readonly maxTextureBindings: number;
    /** Render-target memory at the reference size, persistent targets counted twice. */
    readonly targetBytes: number;
    readonly largestShaderBytes: number;
    readonly totalBytes: number;
}

export interface PackageValidation {
    readonly manifest: BlinkFxManifest | null;
    readonly findings: readonly PackageFinding[];
    readonly valid: boolean;
    readonly budget: PackageBudget | null;
}

/** Reference output the render-target budget is computed at. */
export const REFERENCE_SIZE = { width: 1920, height: 1080 } as const;

/** The most textures one mesh material can bind, a limit of the render backend. */
export const MAX_TEXTURE_BINDINGS = 7;

const LIMITS = {
    passes: 16,
    targetBytes: 512 * 1024 * 1024,
    shaderBytes: 256 * 1024,
    totalBytes: 64 * 1024 * 1024,
} as const;

const BYTES_PER_PIXEL: Readonly<Record<NonNullable<BlinkFxRenderTarget['format']>, number>> = {
    rgba8: 4,
    rgba16f: 8,
    rgba32f: 16,
};

function shaderPaths(manifest: BlinkFxManifest): string[] {
    const paths: string[] = [];
    const add = (value: string | BlinkFxGlslShader | undefined): void => {
        if (value === undefined) return;
        if (typeof value === 'string') paths.push(value);
        else if ('audio' in value) paths.push(value.audio);
        else {
            paths.push(value.fragment);
            if (value.vertex !== undefined) paths.push(value.vertex);
        }
    };
    for (const set of [manifest.shaders.glsl, manifest.shaders.wgsl]) {
        if (typeof set === 'string') paths.push(set);
        else if (set !== undefined) Object.values(set).forEach(add);
    }
    return paths;
}

function referencedPaths(manifest: BlinkFxManifest): Array<{ path: string; what: string }> {
    return [
        ...shaderPaths(manifest).map(path => ({ path, what: 'shader' })),
        ...(manifest.assets ?? []).map(asset => ({ path: asset.path, what: `asset "${asset.name}"` })),
        ...(manifest.presets ?? []).map(preset => ({ path: preset.path, what: `preset "${preset.name}"` })),
        ...(manifest.script === undefined ? [] : [{ path: manifest.script.entry, what: 'script' }]),
        ...(manifest.thumbnail === undefined ? [] : [{ path: manifest.thumbnail, what: 'thumbnail' }]),
    ];
}

function targetBytes(target: BlinkFxRenderTarget): number {
    const dimension = (value: number | string | undefined, screen: number): number => {
        if (typeof value === 'number') return value;
        return Math.max(Math.round(screen * (target.scale ?? 1)), 1);
    };
    const pixels = dimension(target.width, REFERENCE_SIZE.width) * dimension(target.height, REFERENCE_SIZE.height);
    return pixels * BYTES_PER_PIXEL[target.format ?? 'rgba8'] * (target.persistent === true ? 2 : 1);
}

function budgetOf(manifest: BlinkFxManifest, files: PackageFiles): PackageBudget {
    const passes: readonly BlinkFxPass[] = manifest.passes ?? [];
    const targets = passes.flatMap(pass => (typeof pass.target === 'object' ? [pass.target] : []));
    const sizes = shaderPaths(manifest).map(path => files.read(path)?.length ?? 0);
    return {
        passes: passes.length,
        maxTextureBindings: Math.max(0, ...passes.map(pass => pass.inputs?.length ?? 0)),
        targetBytes: targets.reduce((sum, target) => sum + targetBytes(target), 0),
        largestShaderBytes: Math.max(0, ...sizes),
        totalBytes: files.list().reduce((sum, path) => sum + (files.read(path)?.length ?? 0), 0),
    };
}

function budgetFindings(budget: PackageBudget, maxTextureBindings: number): PackageFinding[] {
    const findings: PackageFinding[] = [];
    const megabytes = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);
    if (budget.maxTextureBindings > maxTextureBindings) {
        findings.push({
            severity: 'error',
            code: 'budget-texture-bindings',
            message: `a pass binds ${budget.maxTextureBindings} textures; the render backend holds at most ${maxTextureBindings}`,
        });
    }
    if (budget.passes > LIMITS.passes) {
        findings.push({
            severity: 'warning',
            code: 'budget-passes',
            message: `${budget.passes} passes; more than ${LIMITS.passes} is costly to run every frame`,
        });
    }
    if (budget.targetBytes > LIMITS.targetBytes) {
        findings.push({
            severity: 'warning',
            code: 'budget-target-memory',
            message: `render targets take ${megabytes(budget.targetBytes)} MiB at ${REFERENCE_SIZE.width}x${REFERENCE_SIZE.height}`,
        });
    }
    if (budget.largestShaderBytes > LIMITS.shaderBytes) {
        findings.push({
            severity: 'warning',
            code: 'budget-shader-size',
            message: `a shader is ${megabytes(budget.largestShaderBytes)} MiB of source`,
        });
    }
    if (budget.totalBytes > LIMITS.totalBytes) {
        findings.push({
            severity: 'warning',
            code: 'budget-package-size',
            message: `the package is ${megabytes(budget.totalBytes)} MiB`,
        });
    }
    return findings;
}

async function expandAll(manifest: BlinkFxManifest, files: PackageFiles): Promise<PackageFinding[]> {
    const findings: PackageFinding[] = [];
    const decoder = new TextDecoder();
    const read = (path: string): Promise<string> => {
        const bytes = files.read(path);
        return bytes === undefined
            ? Promise.reject(new Error(`"${path}" is not in the package`))
            : Promise.resolve(decoder.decode(bytes));
    };
    for (const path of new Set(shaderPaths(manifest))) {
        if (files.read(path) === undefined) continue;
        try {
            await expandShaderIncludes(path, read);
        } catch (error) {
            findings.push({
                severity: 'error',
                code: 'include-invalid',
                message: `${path}: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }
    return findings;
}

/** Names the runtime defines in every WGSL module, which a package program may not define again. */
const RESERVED_WGSL =
    /\b(?:fn\s+(?:vertexMain|bl_fragCoord)|struct\s+(?:BlinkUniforms|BlinkVarying|BlinkVertexInput)|var<uniform>\s+blink)\b/;
const FRAGMENT_ENTRY = /@fragment\s+fn\s+fragmentMain\b/;

function stripWgslComments(source: string): string {
    return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');
}

/**
 * A WGSL program is the fragment stage only: the runtime supplies the vertex stage and the
 * declarations around it. A program without its entry point, or one that defines a name the runtime
 * defines, would fail to compile on the first frame, so it is found here instead.
 */
function wgslFindings(manifest: BlinkFxManifest, files: PackageFiles): PackageFinding[] {
    const set = manifest.shaders.wgsl;
    const paths =
        typeof set === 'string'
            ? [set]
            : Object.values(set ?? {}).filter((value): value is string => typeof value === 'string');
    const findings: PackageFinding[] = [];
    const decoder = new TextDecoder();
    for (const path of new Set(paths)) {
        const bytes = files.read(path);
        if (bytes === undefined) continue;
        const source = stripWgslComments(decoder.decode(bytes));
        if (!FRAGMENT_ENTRY.test(source)) {
            findings.push({
                severity: 'error',
                code: 'wgsl-entry-missing',
                message: `${path}: no "@fragment fn fragmentMain" entry point`,
            });
        }
        const reserved = RESERVED_WGSL.exec(source);
        if (reserved !== null) {
            findings.push({
                severity: 'error',
                code: 'wgsl-redefines-runtime',
                message: `${path}: defines "${reserved[0]}", which the runtime defines in every WGSL module`,
            });
        }
    }
    return findings;
}

export interface PackageValidationOptions {
    /** Maximum bindings supported by the renderer that will execute this package. */
    readonly maxTextureBindings?: number;
}

/**
 * Validates a package as a whole: the manifest's shape and cross-references, that every file it
 * names is present, that shader includes resolve inside the package, and its static budgets.
 * Findings are data; nothing throws for a bad package.
 */
export async function validatePackage(
    files: PackageFiles,
    options: PackageValidationOptions = {}
): Promise<PackageValidation> {
    const findings: PackageFinding[] = [];
    const bytes = files.read('manifest.json');
    if (bytes === undefined) {
        return {
            manifest: null,
            valid: false,
            budget: null,
            findings: [{ severity: 'error', code: 'manifest-missing', message: 'the package has no manifest.json' }],
        };
    }

    let raw: unknown;
    try {
        raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
        return {
            manifest: null,
            valid: false,
            budget: null,
            findings: [
                {
                    severity: 'error',
                    code: 'manifest-json',
                    message: `manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
        };
    }

    const shape = validateBlinkFxManifest(raw);
    if (!shape.valid) {
        return {
            manifest: null,
            valid: false,
            budget: null,
            findings: shape.errors.map(message => ({ severity: 'error' as const, code: 'manifest-invalid', message })),
        };
    }

    const manifest = raw as BlinkFxManifest;
    for (const message of validateManifestReferences(manifest)) {
        findings.push({ severity: 'error', code: 'reference-invalid', message });
    }
    for (const { path, what } of referencedPaths(manifest)) {
        if (files.read(path) === undefined) {
            findings.push({
                severity: 'error',
                code: 'file-missing',
                message: `${what} "${path}" is not in the package`,
            });
        }
    }
    findings.push(...(await expandAll(manifest, files)));
    findings.push(...wgslFindings(manifest, files));

    const budget = budgetOf(manifest, files);
    findings.push(...budgetFindings(budget, options.maxTextureBindings ?? MAX_TEXTURE_BINDINGS));
    return { manifest, findings, valid: !findings.some(finding => finding.severity === 'error'), budget };
}
