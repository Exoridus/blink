import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface LockedPackage {
    version?: string;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    [key: string]: unknown;
}

interface PackageLock {
    packages: Record<string, LockedPackage>;
}

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function assertDestination(destination: string): string {
    if (destination.split(/[/\\]/).includes('..'))
        throw new Error('Export destination must not contain parent traversal');
    const output = resolve(destination);
    const fromOutput = relative(output, repository);
    if (!fromOutput || (!fromOutput.startsWith(`..${sep}`) && fromOutput !== '..' && !isAbsolute(fromOutput))) {
        throw new Error('Export destination must not contain the source repository');
    }
    let ancestor = output;
    while (true) {
        if (existsSync(ancestor) && lstatSync(ancestor).isSymbolicLink()) {
            throw new Error('Export destination must not traverse a symlink');
        }
        const parent = dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
    }
    if (existsSync(output) && (!lstatSync(output).isDirectory() || readdirSync(output).length > 0)) {
        throw new Error('Export destination must be an empty directory');
    }
    return output;
}

function standalonePackage(): { manifest: object; lock: object } {
    const source = JSON.parse(readFileSync(join(repository, 'package-lock.json'), 'utf8')) as PackageLock;
    const names = ['ajv', '@types/node', '@typescript/native'];
    const packages: Record<string, LockedPackage> = {};
    function collect(key: string, development: boolean): void {
        if (packages[key]) return;
        const entry = source.packages[key];
        if (!entry) throw new Error(`Dependency missing from source lockfile: ${key}`);
        packages[key] = { ...entry, dev: development };
        for (const dependency of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
            let parent = key;
            let dependencyKey: string;
            while (true) {
                dependencyKey = `${parent}/node_modules/${dependency}`;
                if (source.packages[dependencyKey]) break;
                const marker = parent.lastIndexOf('/node_modules/');
                if (marker < 0) {
                    dependencyKey = `node_modules/${dependency}`;
                    break;
                }
                parent = parent.slice(0, marker);
            }
            collect(dependencyKey, development);
        }
    }
    for (const name of names) collect(`node_modules/${name}`, name !== 'ajv');
    const version = (name: string): string => {
        const value = packages[`node_modules/${name}`].version;
        if (!value) throw new Error(`Missing dependency version: ${name}`);
        return value;
    };
    const manifest = {
        name: 'blinkfx-spec',
        version: '1.0.0-rc.2',
        private: true,
        type: 'module',
        license: 'MIT',
        engines: { node: '^24.0.0' },
        scripts: {
            check: 'node node_modules/@typescript/native/bin/tsc --noEmit && node conformance/check.ts',
        },
        dependencies: { ajv: version('ajv') },
        devDependencies: {
            '@types/node': version('@types/node'),
            '@typescript/native': `npm:typescript@${version('@typescript/native')}`,
        },
    };
    return {
        manifest,
        lock: {
            name: manifest.name,
            version: manifest.version,
            lockfileVersion: 3,
            requires: true,
            packages: {
                '': {
                    name: manifest.name,
                    version: manifest.version,
                    license: manifest.license,
                    dependencies: manifest.dependencies,
                    devDependencies: manifest.devDependencies,
                    engines: manifest.engines,
                },
                ...Object.fromEntries(Object.entries(packages).sort(([left], [right]) => left.localeCompare(right))),
            },
        },
    };
}

export function exportBlinkFxSpec(destination = join(repository, 'dist', 'blinkfx-spec')): string {
    const output = assertDestination(destination);
    const { manifest, lock } = standalonePackage();
    const put = (name: string, contents: string): void => {
        mkdirSync(dirname(join(output, name)), { recursive: true });
        writeFileSync(join(output, name), contents.replaceAll('\r\n', '\n'));
    };
    const copyTree = (source: string, target: string): void => {
        for (const entry of readdirSync(source, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) throw new Error(`Symlink is not a specification artifact: ${entry.name}`);
            const name = join(target, entry.name);
            if (entry.isDirectory()) copyTree(join(source, entry.name), name);
            else put(name, readFileSync(join(source, entry.name), 'utf8'));
        }
    };
    for (const name of ['schemas', 'types', 'examples', 'conformance']) {
        copyTree(join(repository, 'docs', 'blinkfx', name), name);
    }
    for (const name of ['README.md', 'specification.md', 'custom-effects.md', 'scripting.md', 'converters.md']) {
        let text = readFileSync(join(repository, 'docs', 'blinkfx', name), 'utf8').replaceAll('\r\n', '\n');
        text = text
            .replaceAll('(schemas/v1/', '(../../schemas/v1/')
            .replaceAll('(types/', '(../../types/')
            .replaceAll('(examples/', '(../../examples/')
            .replaceAll("from './types/scene-runtime'", "from '../../types/scene-runtime'")
            .replace(
                /\[([^\]]+)\]\(\.\.\/architecture\/[^)]+\)/g,
                '$1 (application implementation planning, outside this specification bundle)'
            )
            .replace(
                'This directory is the initial, extractable contract bundle for a separate\nBlinkFX specification repository.',
                'This directory contains the exported BlinkFX specification contract bundle.'
            );
        put(join('spec', 'v1', name), text);
    }
    put('package.json', `${JSON.stringify(manifest, null, 2)}\n`);
    put('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
    put(
        'tsconfig.json',
        `${JSON.stringify(
            {
                compilerOptions: {
                    target: 'ES2022',
                    module: 'ESNext',
                    moduleResolution: 'bundler',
                    strict: true,
                    noEmit: true,
                    noUnusedLocals: true,
                    noImplicitReturns: true,
                    skipLibCheck: true,
                    types: ['node'],
                    allowImportingTsExtensions: true,
                },
                include: ['conformance/**/*.ts', 'types/**/*.d.ts'],
            },
            null,
            2
        )}\n`
    );
    put('.gitignore', 'node_modules/\n');
    put('.gitattributes', '* text=auto eol=lf\n');
    put(
        '.editorconfig',
        'root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 4\n'
    );
    put(
        '.github/workflows/conformance.yml',
        `name: Specification conformance
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  conformance:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npm run check
`
    );
    put('README.md', exportReadme);
    put('LICENSE', mitLicense);
    put('conformance/check.ts', conformanceRunner);
    return output;
}

const exportReadme = `# BlinkFX specification candidate

This standalone bundle contains the unreleased Final Candidate R2, version
1.0.0-rc.2, for the blinkfx/1 package contract. It is a local export, not a
published specification release. The source contract in the Blink repository
remains authoritative until a separate specification release is approved.

- [Specification and contract index](spec/v1/README.md)
- [Manifest schema](schemas/v1/manifest.schema.json)
- [Manifest declarations](types/manifest.d.ts)
- [Native script declarations](types/scene-runtime.d.ts)
- [Minimal package](examples/minimal/manifest.json)

Use Node 24, then run npm ci and npm run check. The check uses Ajv Draft 2020-12
against the valid and invalid manifest fixtures, semantic manifest checks, and
the minimal example's file references. It uses no application engine or ExoJS.

Semantic checks cover duplicate names, control bounds and enum membership,
package-relative path syntax, declared shader and resource references, current
frame target ordering, persistent history references, and sampler duplicates.
Only the minimal example includes package files; manifest fixtures are not full
packages. These checks do not execute shaders or scripts, inspect archives,
parse sizing expressions, test include files or symlink containment in arbitrary
packages, validate host capabilities, or prove GPU, audio or numerical parity.
Runtime implementations must satisfy the remaining normative rules separately.

The specification bundle is licensed under MIT. Original source scenes,
third-party effect collections, private research and application code are not
included and do not acquire a new license through this export. The Blink
application's license is unchanged. Review release identifiers, ownership and
runtime conformance coverage before publishing a permanent release.
`;

const mitLicense = `MIT License

Copyright (c) 2026 Dieter Giesler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const conformanceRunner = String.raw`import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { BlinkFxGlslShader, BlinkFxManifest } from '../types/manifest.d.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema: object = JSON.parse(readFileSync(join(root, 'schemas/v1/manifest.schema.json'), 'utf8')) as object;
const validate = new Ajv2020({ allErrors: true, strict: false }).compile<BlinkFxManifest>(schema);

function semanticErrors(manifest: BlinkFxManifest, packageRoot?: string): string[] {
    const errors: string[] = [];
    function unique(label: string, names: readonly string[]): void {
        if (new Set(names).size !== names.length) errors.push('Duplicate ' + label);
    }
    function path(value: string): void {
        if (!value || value.startsWith('/') || value.includes('\\') || /[:?#\u0000]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) {
            errors.push('Invalid package path: ' + value);
        } else if (packageRoot && !existsSync(join(packageRoot, value))) {
            errors.push('Missing package file: ' + value);
        }
    }
    for (const field of ['controls', 'inputs', 'assets', 'presets', 'passes'] as const) {
        unique(field, (manifest[field] ?? []).map(item => item.name));
    }
    for (const control of manifest.controls ?? []) {
        if (control.type === 'float' || control.type === 'int') {
            if (!Number.isFinite(control.default) || (control.min !== undefined && control.default < control.min) || (control.max !== undefined && control.default > control.max)) errors.push('Control bounds: ' + control.name);
        }
        if (control.type === 'enum' && !control.options.includes(control.default)) errors.push('Enum default: ' + control.name);
        if (control.type === 'point2d') {
            for (const index of [0, 1] as const) {
                if ((control.min && control.default[index] < control.min[index]) || (control.max && control.default[index] > control.max[index])) errors.push('Point bounds: ' + control.name);
            }
        }
    }
    const visualKeys = new Set<string>();
    const audioKeys = new Set<string>();
    const backends: (string | Readonly<Record<string, BlinkFxGlslShader>> | undefined)[] = [manifest.shaders.glsl, manifest.shaders.wgsl];
    for (const backend of backends) {
        if (backend === undefined) continue;
        if (typeof backend === 'string') { path(backend); visualKeys.add('main'); }
        else for (const [key, program] of Object.entries(backend)) {
            if (typeof program === 'string') { path(program); visualKeys.add(key); }
            else if ('audio' in program) { path(program.audio); audioKeys.add(key); }
            else { path(program.fragment); if (program.vertex) path(program.vertex); visualKeys.add(key); }
        }
    }
    for (const item of [...(manifest.assets ?? []), ...(manifest.presets ?? [])]) path(item.path);
    if (manifest.thumbnail) path(manifest.thumbnail);
    if (manifest.script) path(manifest.script.entry);
    if (manifest.outputs?.audio && !audioKeys.has(manifest.outputs.audio.shader)) errors.push('Missing audio shader');
    const targets = new Map((manifest.passes ?? []).flatMap(pass => typeof pass.target === 'object' ? [[pass.target.name, pass.target] as const] : []));
    unique('target', (manifest.passes ?? []).flatMap(pass => typeof pass.target === 'object' ? [pass.target.name] : []));
    const produced = new Set<string>();
    const assets = new Set((manifest.assets ?? []).map(asset => asset.name));
    const inputs = new Set((manifest.inputs ?? []).map(input => input.name));
    const passes = manifest.passes ?? (manifest.outputs?.visual === false ? [] : [{ name: 'main', shader: 'main' }]);
    for (const pass of passes) {
        if (!visualKeys.has(pass.shader)) errors.push('Missing visual shader: ' + pass.shader);
        unique('sampler', (pass.inputs ?? []).flatMap(input => typeof input === 'string' ? [] : [input.uniform]));
        if (typeof pass.target === 'object' && pass.target.scale !== undefined && (pass.target.width !== undefined || pass.target.height !== undefined)) errors.push('Mixed target sizing');
        for (const binding of pass.inputs ?? []) {
            let source = typeof binding === 'string' ? binding : binding.source;
            if (source === 'blink.audio.spectrum' || source === 'blink.audio.levelTrail') continue;
            if (source.startsWith('asset.')) { if (!assets.has(source.slice(6))) errors.push('Unknown asset: ' + source); continue; }
            if (source.startsWith('input.')) { if (!inputs.has(source.slice(6))) errors.push('Unknown input: ' + source); continue; }
            if (source.startsWith('target.')) source = source.slice(7);
            else if (assets.has(source)) continue;
            if (source.endsWith('.previous')) {
                if (!targets.get(source.slice(0, -9))?.persistent) errors.push('Nonpersistent history: ' + source);
            } else if (!produced.has(source)) errors.push('Target order: ' + source);
            else if (typeof pass.target === 'object' && pass.target.name === source) errors.push('Target read/write alias: ' + source);
        }
        if (typeof pass.target === 'object') produced.add(pass.target.name);
    }
    return errors;
}

let count = 0;
for (const category of ['valid', 'invalid']) {
    for (const name of readdirSync(join(root, 'conformance', category)).filter(name => name.endsWith('.json')).sort()) {
        const data: unknown = JSON.parse(readFileSync(join(root, 'conformance', category, name), 'utf8'));
        assert.equal(validate(data), category === 'valid', name + ': ' + JSON.stringify(validate.errors));
        if (validate(data)) assert.deepEqual(semanticErrors(data), [], name);
        count++;
    }
}
const minimal: unknown = JSON.parse(readFileSync(join(root, 'examples/minimal/manifest.json'), 'utf8'));
assert.ok(validate(minimal), JSON.stringify(validate.errors));
assert.deepEqual(semanticErrors(minimal, join(root, 'examples/minimal')), []);
assert.ok(semanticErrors({ ...minimal, controls: [{ name: 'x', type: 'enum', default: 'missing', options: ['a'] }] }).length);
assert.ok(semanticErrors({ ...minimal, shaders: { glsl: '../escape.glsl' } }).length);
assert.ok(semanticErrors({ ...minimal, passes: [{ name: 'main', shader: 'main', inputs: ['target.later'] }] }).length);
assert.ok(semanticErrors({ ...minimal, passes: [{ name: 'main', shader: 'main', inputs: ['target.history.previous'] }] }).length);
assert.ok(semanticErrors({ ...minimal, controls: [{ name: 'x', type: 'float', default: 2, max: 1 }] }).length);
assert.ok(semanticErrors({ ...minimal, assets: [{ name: 'same', type: 'texture2d', path: 'a.png' }, { name: 'same', type: 'texture2d', path: 'b.png' }] }).length);
assert.ok(semanticErrors({ ...minimal, passes: [{ name: 'main', shader: 'main', inputs: [{ source: 'blink.audio.spectrum', uniform: 'u' }, { source: 'blink.audio.spectrum', uniform: 'u' }] }] }).length);
console.log('Manifest fixtures passed: ' + count + '; semantic checks and minimal package passed. GPU/runtime conformance is not covered.');
`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    console.log(`BlinkFX specification exported: ${exportBlinkFxSpec(process.argv[2])}`);
}
