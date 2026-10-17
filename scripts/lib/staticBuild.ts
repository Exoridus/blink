import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { prepareDemoAudio, readDemoAudio } from './demoAudio.ts';

interface StaticManifest {
    thumbnail?: string;
    script?: { entry?: string };
    assets?: { path: string }[];
    presets?: { path: string }[];
    shaders?: Record<string, string | Record<string, string | Record<string, string>>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function preparePreviews(source: string, destination: string, ids: ReadonlySet<string>): void {
    const previews: Record<string, { path: string; fingerprint: string; source: string }> = {};
    const index = join(source, 'effects', 'previews', 'manifest.json');
    if (existsSync(index)) {
        assertNoSymlinks(join(source, 'effects', 'previews'));
        const manifest: unknown = JSON.parse(readFileSync(index, 'utf8'));
        if (!isRecord(manifest) || manifest.version !== 1 || !isRecord(manifest.previews))
            throw new Error('Invalid preview manifest');
        for (const [id, entry] of Object.entries(manifest.previews)) {
            if (!ids.has(id)) continue;
            if (
                !isRecord(entry) ||
                typeof entry.path !== 'string' ||
                !/^effects\/previews\/[A-Za-z0-9._-]+\.png$/.test(entry.path)
            )
                throw new Error(`Invalid public preview path for ${id}`);
            if (typeof entry.fingerprint !== 'string' || typeof entry.source !== 'string')
                throw new Error(`Invalid public preview metadata for ${id}`);
            const file = requireFile(source, entry.path);
            assertNoSymlinks(file);
            cpSync(file, join(destination, entry.path));
            previews[id] = { path: entry.path, fingerprint: entry.fingerprint, source: entry.source };
        }
    }
    writeFileSync(
        join(destination, 'effects', 'previews', 'manifest.json'),
        JSON.stringify({ version: 1, previews }, null, 2)
    );
}

export function normalizeBase(value: string) {
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(value)) {
        throw new Error(`Invalid build base: ${value}`);
    }
    return value.endsWith('/') ? value : `${value}/`;
}

function assertNoSymlinks(directory: string): void {
    if (lstatSync(directory).isSymbolicLink()) throw new Error(`Symlink is not a public asset: ${directory}`);
    if (!lstatSync(directory).isDirectory()) return;
    for (const name of readdirSync(directory)) assertNoSymlinks(join(directory, name));
}

export function preparePublicAssets(source: string, destination: string, packages: string[]) {
    if (!Array.isArray(packages) || packages.length === 0) throw new Error('Public package list is empty');
    for (const directory of [source, join(source, 'effects')]) {
        if (lstatSync(directory).isSymbolicLink()) throw new Error(`Symlink is not a public asset: ${directory}`);
    }
    const roots = packages.map(name => {
        if (!/^[A-Za-z0-9_-]+\.blinkfx$/.test(name)) throw new Error(`Invalid public package: ${name}`);
        const directory = join(source, 'effects', name);
        assertNoSymlinks(directory);
        const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as {
            license?: string;
            id?: string;
        };
        if (manifest.license !== 'MIT') throw new Error(`Public package is not declared MIT: ${name}`);
        return { name, directory, id: manifest.id };
    });
    mkdirSync(join(destination, 'effects'), { recursive: true });
    mkdirSync(join(destination, 'effects', 'previews'), { recursive: true });
    preparePreviews(source, destination, new Set(roots.flatMap(({ id }) => (typeof id === 'string' ? [id] : []))));
    for (const { name, directory } of roots) cpSync(directory, join(destination, 'effects', name), { recursive: true });
    prepareDemoAudio(source, destination);
    const favicon = join(source, 'favicon.ico');
    if (existsSync(favicon)) {
        assertNoSymlinks(favicon);
        cpSync(favicon, join(destination, 'favicon.ico'));
    }
    writeFileSync(
        join(destination, 'effects', 'catalog.json'),
        JSON.stringify(
            {
                packages: roots.map(({ name }) => `effects/${name}/manifest.json`),
            },
            null,
            2
        )
    );
}

function requireFile(root: string, relativePath: string) {
    const file = resolve(root, relativePath);
    if (!file.startsWith(`${resolve(root)}${sep}`) || !existsSync(file) || !lstatSync(file).isFile()) {
        throw new Error(`Static asset missing or outside build: ${relativePath}`);
    }
    return file;
}

export function checkStaticBuild(root: string, base: string) {
    readDemoAudio(root);
    base = normalizeBase(base);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map(match => match[1])
        .filter(url => !/^(?:https?:|data:|#)/.test(url));
    if (!urls.some(url => url.endsWith('.js'))) throw new Error('Missing bundled entry script');
    for (const url of urls) {
        if (!url.startsWith(base)) throw new Error(`Entry asset violates build base ${base}: ${url}`);
        requireFile(root, url.slice(base.length));
    }
    const catalog = JSON.parse(readFileSync(requireFile(root, 'effects/catalog.json'), 'utf8')) as {
        packages: (string | { scene: string; files: string[] })[];
    };
    if (!Array.isArray(catalog.packages) || catalog.packages.length === 0) throw new Error('Empty effect catalog');
    for (const entry of catalog.packages) {
        const path = typeof entry === 'string' ? entry : entry.scene;
        const manifest = JSON.parse(readFileSync(requireFile(root, path), 'utf8')) as StaticManifest;
        const directory = path.slice(0, path.lastIndexOf('/') + 1);
        if (typeof entry !== 'string') {
            for (const file of entry.files) requireFile(root, `${directory}${file}`);
            continue;
        }
        const files = [
            manifest.thumbnail,
            manifest.script?.entry,
            ...(manifest.assets ?? []).map(asset => asset.path),
            ...(manifest.presets ?? []).map(preset => preset.path),
        ];
        for (const backend of Object.values(manifest.shaders ?? {})) {
            if (typeof backend === 'string') files.push(backend);
            else
                for (const program of Object.values(backend)) {
                    if (typeof program === 'string') files.push(program);
                    else files.push(...Object.values(program));
                }
        }
        for (const file of files.filter(Boolean)) requireFile(root, `${directory}${file}`);
    }
    return { base, packages: catalog.packages.length, entryAssets: urls.length };
}
