import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import MarkdownIt from 'markdown-it';

import { normalizeBase } from './lib/staticBuild.ts';

const roots = ['README.md', 'blinkfx', 'architecture', 'development'];
const markdown = new MarkdownIt({ html: false, linkify: true });
const defaultLink =
    markdown.renderer.rules.link_open ??
    ((tokens, index, options, env, renderer) => renderer.renderToken(tokens, index, options));
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    const href = tokens[index].attrGet('href') as string | null;
    if (href && !/^(?:https?:|mailto:|#)/.test(href))
        tokens[index].attrSet('href', href.replace(/README\.md(?=#|$)/, 'index.html').replace(/\.md(?=#|$)/, '.html'));
    return defaultLink(tokens, index, options, env, renderer);
};
const escape = (value: string) => markdown.utils.escapeHtml(value);

export function buildDocs(destination: string, base: string) {
    base = normalizeBase(base);
    mkdirSync(destination, { recursive: true });
    const files: string[] = [];
    function collect(path: string) {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            const file = join(path, entry.name);
            if (entry.isDirectory()) collect(file);
            else files.push(file);
        }
    }
    for (const root of roots) {
        const path = join('docs', root);
        if (root.endsWith('.md')) files.push(path);
        else collect(path);
    }
    const navigation = `<a href="${base}index.html">Documentation</a> <a href="${base}blinkfx/index.html">BlinkFX</a> <a href="${base}architecture/cli.html">CLI</a> <a href="${base}architecture/control-protocol.html">Control protocol</a> <a href="${base}../">Application</a>`;
    writeFileSync(
        join(destination, 'style.css'),
        'body{max-width:72rem;margin:2rem auto;padding:0 1.5rem;font:17px/1.6 system-ui;color:#20232a}nav{display:flex;gap:1rem;flex-wrap:wrap}pre{overflow:auto;padding:1rem;background:#f1f3f5}code{font-size:.9em}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #ddd;padding:.4rem .7rem}a{color:#3157a4}h1,h2,h3{line-height:1.2}'
    );
    for (const file of files) {
        const name = relative('docs', file).replaceAll('\\', '/');
        const out = name.replace(/README\.md$/, 'index.html').replace(/\.md$/, '.html');
        if (!file.endsWith('.md')) {
            mkdirSync(dirname(join(destination, out)), { recursive: true });
            cpSync(file, join(destination, out));
            continue;
        }
        const source = readFileSync(file, 'utf8');
        const title = /^#\s+(.+)$/m.exec(source)?.[1] ?? 'Blink';
        mkdirSync(dirname(join(destination, out)), { recursive: true });
        writeFileSync(
            join(destination, out),
            `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><link rel="stylesheet" href="${base}style.css"></head><body><nav>${navigation.replace('blinkfx/README.html', 'blinkfx/index.html')}</nav><main>${markdown.render(source)}</main></body></html>`
        );
    }
    console.log(`Documentation: ${files.filter(file => file.endsWith('.md')).length} pages at ${base}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    buildDocs(resolve('dist/docs'), normalizeBase(process.env.BLINK_DOCS_BASE ?? '/docs/'));
}
