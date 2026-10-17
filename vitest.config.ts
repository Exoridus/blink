import { defineConfig } from 'vitest/config';

export default defineConfig({
    define: { __APP_VERSION__: JSON.stringify('test') },
    test: {
        include: ['src/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
        exclude: ['**/private/**', 'scripts/__tests__/node/**'],
    },
});
