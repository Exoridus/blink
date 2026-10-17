import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    globalIgnores([
        'dist/**',
        'node_modules/**',
        'coverage/**',
        '.workspace/**',
        '.superpowers/**',
        'converted-corpus*/**',
        'public/**',
        'test/fixtures/**',
        'docs/**',
        '**/*.d.ts',
    ]),
    js.configs.recommended,
    {
        rules: {
            'no-redeclare': ['error', { builtinGlobals: false }],
            'no-useless-escape': 'warn',
            'no-eval': 'error',
            'no-new-func': 'error',
        },
    },
    {
        files: ['**/*.{js,mjs,ts,mts}'],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node, ...globals.es2024 },
        },
    },
    {
        files: ['**/*.{ts,mts}'],
        extends: [...tseslint.configs.recommended],
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
        },
    },
    {
        files: ['src/**/*.ts', 'scripts/**/*.ts'],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
        rules: { '@typescript-eslint/no-floating-promises': 'error' },
    },
    { files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-floating-promises': 'warn' } },
    {
        // Sandbox tests construct hostile function values to verify that they cannot cross the realm boundary.
        files: ['src/packages/ssf/script/__tests__/SsfScriptRuntime.test.ts'],
        rules: { 'no-new-func': 'off' },
    },
]);
