import { loadBlinkFx } from '../packages/blinkfx/loader';
import { MemoryPackageFiles } from '../packages/blinkfx/packageReader';
import { validatePackage } from '../packages/blinkfx/validatePackage';
import { convertSsfScene } from '../packages/ssf/convert/convertSsfScene';
import { readSsfDirectory } from '../packages/ssf/package';
import type { BlinkEffectIR } from '../runtime/ir/types';
import { mountPackage } from '../runtime/package/packageMount';
import { normalizePackagePath } from '../runtime/shader/expandIncludes';

export interface SsfCatalogEntry {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
    readonly collection?: 'builtin' | 'community';
    readonly scene: string;
    readonly files: readonly string[];
}

/** Converts a catalogued scene at activation and serves its generated files through the package mount. */
export async function loadSsfScene(root: string, paths: readonly string[], id?: string): Promise<BlinkEffectIR> {
    const names = paths.map(path => {
        const normalized = normalizePackagePath(path);
        if (normalized === null || normalized !== path)
            throw new Error(`SSF file "${path}" is outside the scene directory`);
        return path;
    });
    const entries = await Promise.all(
        names.map(async path => {
            const response = await fetch(`${root}/${path.split('/').map(encodeURIComponent).join('/')}`);
            if (!response.ok) throw new Error(`Failed to load SSF file: ${root}/${path} (${response.status})`);
            return [path, new Uint8Array(await response.arrayBuffer())] as const;
        })
    );
    const slug = decodeURIComponent(root.split('/').at(-1) ?? 'scene').replace(/\.synScene$/, '');
    const converted = convertSsfScene(readSsfDirectory(new Map(entries), id?.split('.').at(-1) ?? slug));
    if (converted.report.status === 'failed') {
        throw new Error(
            `SSF conversion failed: ${converted.report.issues
                .filter(issue => issue.severity === 'error')
                .map(issue => issue.message)
                .join('; ')}`
        );
    }
    const encoder = new TextEncoder();
    const files = new MemoryPackageFiles(
        new Map(
            [...converted.files].map(([path, value]) => [
                path,
                typeof value === 'string' ? encoder.encode(value) : value,
            ])
        )
    );
    const validation = await validatePackage(files, { maxTextureBindings: 16 });
    if (!validation.valid)
        throw new Error(
            `Invalid converted SSF package: ${validation.findings.map(finding => finding.message).join('; ')}`
        );
    const effect = loadBlinkFx(converted.manifest, root);
    mountPackage(root, files);
    return effect;
}
