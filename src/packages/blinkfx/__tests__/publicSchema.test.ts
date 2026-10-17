import { readFileSync, readdirSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import schema from '../../../../docs/blinkfx/schemas/v1/manifest.schema.json';
import { validateBlinkFxManifest } from '../validate';

const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);

describe('public BlinkFX schema conformance', () => {
    for (const kind of ['valid', 'invalid'] as const) {
        const directory = `docs/blinkfx/conformance/${kind}`;
        for (const file of readdirSync(directory)) {
            it(`${kind}: ${file}`, () => {
                const manifest = JSON.parse(readFileSync(`${directory}/${file}`, 'utf8')) as unknown;
                expect(validate(manifest), JSON.stringify(validate.errors)).toBe(kind === 'valid');
                expect(validateBlinkFxManifest(manifest).valid).toBe(kind === 'valid');
            });
        }
    }
    const release = JSON.parse(readFileSync('public/release-effects.json', 'utf8')) as { packages: string[] };
    for (const name of release.packages) {
        it(`accepts release example ${name}`, () => {
            const manifest = JSON.parse(readFileSync(`public/effects/${name}/manifest.json`, 'utf8')) as unknown;
            expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
            expect(validateBlinkFxManifest(manifest).valid).toBe(true);
        });
    }
    it('manifest declarations remain synchronized with the implementation snapshot', () => {
        const normalize = (value: string): string => value.replace(/\r\n/g, '\n');
        expect(normalize(readFileSync('docs/blinkfx/types/manifest.d.ts', 'utf8'))).toBe(
            normalize(readFileSync('src/packages/blinkfx/manifest.ts', 'utf8'))
        );
    });
});
