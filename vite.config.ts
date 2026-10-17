import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
    version: string;
};

export default defineConfig({
    // Public base path. The app is served from the domain root in dev, but from
    // a sub-path in production, so this has to be settable per build. Runtime
    // path strings are resolved against it via `assetUrl` in src/utils/base-url.
    base: process.env.BLINK_BASE ?? '/',

    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
        port: 8080,
        host: '127.0.0.1',
        fs: {
            deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.workspace/**', '**/.superpowers/**'],
        },
    },
    build: {
        target: 'es2020',
        sourcemap: true,
        rollupOptions: {
            output: {
                entryFileNames: 'assets/[hash].js',
                chunkFileNames: 'assets/[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            },
        },
    },
});
