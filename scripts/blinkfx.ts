import { corpusRoot } from './lib/workspacePaths.ts';
// The BlinkFX command line.
//
//   npm run blinkfx -- <command> [options]
//
//   inspect  <package> [--json]                     what a package declares
//   validate <package>... [--json]                  manifest, references, files, includes, budgets
//   convert  <input>... --out <dir> [--format auto|ssf|isf|shadertoy] [--skip-scripts] [--license <text>]
//   pack     <directory> [--out <file.blinkfx>]     directory -> archive
//   unpack   <file.blinkfx> --out <directory>       archive -> directory
//   report   <directory>                            summarize a convert run's report.json
//   doctor                                          check the tools this repository's workflows need
//
// A package is an unpacked directory or a `.blinkfx` archive. Exit status is 0 on success, 1 when
// a package is invalid or a conversion fails, 2 on a usage error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import type { BlinkFxManifest } from '../src/packages/blinkfx/manifest';
import { writePackageArchive } from '../src/packages/blinkfx/packageReader';
import { type PackageBudget, validatePackage } from '../src/packages/blinkfx/validatePackage';
import type { ConversionReport } from '../src/packages/convert/report';
import type { SourceFormat } from './lib/convertBatch';
import { convertBatch, discoverJobs, summarize } from './lib/convertBatch';
import { openPackage, writeFiles } from './lib/packageDirectory';

interface Options {
    readonly positional: string[];
    readonly flags: ReadonlyMap<string, string | true>;
}

const VALUE_FLAGS = new Set(['out', 'format', 'license']);

function parse(args: readonly string[]): Options {
    const positional: string[] = [];
    const flags = new Map<string, string | true>();
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('--')) {
            positional.push(arg);
            continue;
        }
        const name = arg.slice(2);
        if (VALUE_FLAGS.has(name)) {
            const value = args[++i];
            if (value === undefined) usage(`--${name} needs a value`);
            flags.set(name, value);
        } else {
            flags.set(name, true);
        }
    }
    return { positional, flags };
}

function usage(message: string): never {
    console.error(`blinkfx: ${message}`);
    console.error('usage: blinkfx <inspect|validate|convert|pack|unpack|report|doctor> ... (see scripts/blinkfx.ts)');
    process.exit(2);
}

const flagText = (options: Options, name: string): string | undefined => {
    const value = options.flags.get(name);
    return typeof value === 'string' ? value : undefined;
};

// ── inspect ──────────────────────────────────────────────────────────────────

function describePasses(manifest: BlinkFxManifest): string[] {
    return (manifest.passes ?? []).map(pass => {
        const target = pass.target === undefined || pass.target === 'screen' ? 'screen' : `target ${pass.target.name}`;
        const inputs = (pass.inputs ?? []).map(input =>
            typeof input === 'string' ? input : `${input.uniform} <- ${input.source}`
        );
        return `  ${pass.name}: ${pass.shader} -> ${target}${inputs.length > 0 ? `   [${inputs.join(', ')}]` : ''}`;
    });
}

const section = (title: string, entries: readonly string[]): string[] =>
    entries.length > 0 ? [title, ...entries] : [];

function describeHeader(manifest: BlinkFxManifest): string[] {
    const version = manifest.version === undefined ? '' : `   version: ${manifest.version}`;
    const author = manifest.author === undefined ? '' : `   author: ${manifest.author}`;
    const visual = manifest.outputs?.visual === false ? '' : 'visual ';
    const audio =
        manifest.outputs?.audio === undefined ? '' : `audio (${manifest.outputs.audio.abi ?? 'blink-audio/1'})`;
    const lines = [
        `${manifest.title}  (${manifest.id})`,
        `  kind: ${manifest.kind ?? 'generator'}${version}${author}`,
        `  outputs: ${visual}${audio}`.trimEnd(),
    ];
    if (manifest.compatibility !== undefined) {
        const { source, profile, mode, converter } = manifest.compatibility;
        lines.push(
            `  compatibility: ${source?.format ?? '?'} ${source?.version ?? ''} via ${profile ?? '-'} (${mode ?? '-'}), converter ${converter ?? '-'}`
        );
    }
    return lines;
}

function describeManifest(manifest: BlinkFxManifest): string[] {
    const controls = (manifest.controls ?? []).map(control => `  ${control.name}: ${control.type}`);
    const inputs = (manifest.inputs ?? []).map(
        input => `  ${input.name}: ${input.type}${input.required === false ? ' (optional)' : ''}`
    );
    const assets = (manifest.assets ?? []).map(asset => `  ${asset.name}: ${asset.path}`);
    const features = manifest.requirements?.features;
    return [
        ...describeHeader(manifest),
        ...section(`controls (${controls.length}):`, controls),
        ...section('inputs:', inputs),
        ...section('assets:', assets),
        ...section('passes:', describePasses(manifest)),
        ...(manifest.script === undefined
            ? []
            : [`script: ${manifest.script.entry} (${manifest.script.abi ?? 'blink/1'})`]),
        ...(features === undefined ? [] : [`requires: ${features.join(', ')}`]),
    ];
}

function describeBudget(budget: PackageBudget): string {
    return (
        `budget: ${budget.passes} passes, <= ${budget.maxTextureBindings} textures per pass, ` +
        `${(budget.targetBytes / (1024 * 1024)).toFixed(1)} MiB of targets at 1920x1080, ${(budget.totalBytes / 1024).toFixed(0)} KiB`
    );
}

async function inspect(options: Options): Promise<number> {
    const [path] = options.positional;
    if (path === undefined) usage('inspect needs a package');
    const validation = await validatePackage(openPackage(resolve(path)));

    if (options.flags.has('json')) {
        console.log(
            JSON.stringify(
                { manifest: validation.manifest, findings: validation.findings, budget: validation.budget },
                null,
                2
            )
        );
        return validation.valid ? 0 : 1;
    }
    if (validation.manifest === null) {
        printFindings(validation.findings);
        return 1;
    }
    console.log(describeManifest(validation.manifest).join('\n'));
    if (validation.budget !== null) console.log(describeBudget(validation.budget));
    printFindings(validation.findings);
    return validation.valid ? 0 : 1;
}

function printFindings(findings: ReadonlyArray<{ severity: string; code: string; message: string }>): void {
    for (const finding of findings)
        console.log(`${finding.severity.toUpperCase().padEnd(7)} ${finding.code}: ${finding.message}`);
}

// ── validate ─────────────────────────────────────────────────────────────────

async function validate(options: Options): Promise<number> {
    if (options.positional.length === 0) usage('validate needs at least one package');
    const results = [];
    let failed = 0;
    for (const path of options.positional) {
        const validation = await validatePackage(openPackage(resolve(path)));
        results.push({ path, valid: validation.valid, findings: validation.findings, budget: validation.budget });
        if (!validation.valid) failed++;
        if (!options.flags.has('json')) {
            console.log(`${validation.valid ? 'ok  ' : 'FAIL'} ${path}`);
            printFindings(validation.findings);
        }
    }
    if (options.flags.has('json')) console.log(JSON.stringify(results, null, 2));
    return failed === 0 ? 0 : 1;
}

// ── convert / report ─────────────────────────────────────────────────────────

function printSummary(entries: readonly ConversionReport[]): void {
    const { statuses, issues } = summarize(entries);
    console.log(`${entries.length} converted:`, statuses);
    for (const [code, count] of issues.slice(0, 15)) console.log(`  ${String(count).padStart(4)}  ${code}`);
}

function convert(options: Options): number {
    const out = flagText(options, 'out');
    if (options.positional.length === 0 || out === undefined) usage('convert needs inputs and --out <dir>');
    const format = (flagText(options, 'format') ?? 'auto') as SourceFormat | 'auto';
    if (!['auto', 'ssf', 'isf', 'shadertoy'].includes(format)) usage(`unknown format "${format}"`);

    const jobs = options.positional.flatMap(input => discoverJobs(resolve(input), format));
    if (jobs.length === 0) usage('no convertible input found');

    const entries = convertBatch(jobs, resolve(out), {
        skipScripts: options.flags.has('skip-scripts'),
        license: flagText(options, 'license'),
    });
    printSummary(entries);
    return entries.some(entry => entry.status === 'failed') ? 1 : 0;
}

function report(options: Options): number {
    const [directory] = options.positional;
    if (directory === undefined) usage('report needs a directory');
    const file = resolve(directory, 'report.json');
    if (!existsSync(file)) usage(`${file} does not exist`);
    const entries = JSON.parse(readFileSync(file, 'utf8')) as Array<ConversionReport & { source?: string }>;
    printSummary(entries);
    for (const entry of entries.filter(candidate => candidate.status === 'failed')) {
        const first = entry.issues.find(issue => issue.severity === 'error');
        console.log(`FAILED ${entry.slug}: ${first?.code ?? '?'}: ${(first?.message ?? '').split('\n')[0]}`);
    }
    return 0;
}

// ── pack / unpack ────────────────────────────────────────────────────────────

function pack(options: Options): number {
    const [directory] = options.positional;
    if (directory === undefined) usage('pack needs a directory');
    const source = resolve(directory);
    const out = resolve(flagText(options, 'out') ?? `${source.replace(/\.blinkfx$/, '')}.blinkfx`);
    if (out === source) usage('the output would overwrite the directory');
    const bytes = writePackageArchive(openPackage(source));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bytes);
    console.log(`${basename(out)}  ${(bytes.length / 1024).toFixed(1)} KiB`);
    return 0;
}

function unpack(options: Options): number {
    const [file] = options.positional;
    const out = flagText(options, 'out');
    if (file === undefined || out === undefined) usage('unpack needs a file and --out <directory>');
    const files = openPackage(resolve(file));
    const entries: Array<[string, Uint8Array]> = files.list().map(path => [path, files.read(path) ?? new Uint8Array()]);
    writeFiles(resolve(out), entries);
    console.log(`${entries.length} files into ${resolve(out)}`);
    return 0;
}

// ── doctor ───────────────────────────────────────────────────────────────────

function doctor(): number {
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
    const check = (name: string, ok: boolean, detail: string): void => {
        checks.push({ name, ok, detail });
    };

    const [major] = process.versions.node.split('.').map(Number);
    check('node', major >= 22, `v${process.versions.node} (22 or newer runs the scripts)`);

    const exoPackage = resolve('node_modules/@codexo/exojs/package.json');
    if (existsSync(exoPackage)) {
        const version = (JSON.parse(readFileSync(exoPackage, 'utf8')) as { version: string }).version;
        const dist = resolve('node_modules/@codexo/exojs/dist/exo.esm.js');
        const hasReadback = existsSync(dist) && readFileSync(dist, 'utf8').includes('async readPixels(e,t={})');
        check('exojs', true, `${version}`);
        check(
            'exojs readPixels',
            hasReadback,
            hasReadback
                ? 'the rendering context reads render textures back (generated audio needs it)'
                : 'missing: generated audio output will not work'
        );
    } else {
        check('exojs', false, 'node_modules/@codexo/exojs is not installed');
    }

    const chromes = [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
    ];
    const chrome = chromes.find(path => existsSync(path));
    check(
        'browser',
        chrome !== undefined,
        chrome ?? 'no Chrome or Edge found; the smoke run needs one (scripts/browser-smoke.ts --chrome <path>)'
    );

    const corpora = ['builtin', 'community'].map(name => resolve(corpusRoot(), 'synesthesia', name, 'reference'));
    const present = corpora.filter(path => existsSync(path));
    check(
        'ssf corpus',
        present.length > 0,
        present.length > 0
            ? `${present.length} of 2 private reference directories`
            : 'absent; portable tests do not need corpora, explicit private tests fail without them'
    );

    for (const { name, ok, detail } of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
    return checks.every(entry => entry.ok || entry.name === 'ssf corpus') ? 0 : 1;
}

// ── main ─────────────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2).filter(arg => arg !== '--');
const parsed = parse(rest);

const commands: Record<string, () => number | Promise<number>> = {
    inspect: () => inspect(parsed),
    validate: () => validate(parsed),
    convert: () => convert(parsed),
    pack: () => pack(parsed),
    unpack: () => unpack(parsed),
    report: () => report(parsed),
    doctor: () => doctor(),
};

if (command === undefined || !Object.hasOwn(commands, command))
    usage(command === undefined ? 'missing command' : `unknown command "${command}"`);
process.exit(await commands[command]());
