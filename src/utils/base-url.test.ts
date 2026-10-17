import { afterEach, describe, expect, it, vi } from 'vitest';

import { assetUrl } from './base-url';

describe('assetUrl', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('resolves against the domain root by default', () => {
        expect(assetUrl('effects/catalog.json')).toBe('/effects/catalog.json');
    });

    it('resolves against a sub-path base', () => {
        vi.stubEnv('BASE_URL', '/dev/blink/');
        expect(assetUrl('effects/catalog.json')).toBe('/dev/blink/effects/catalog.json');
    });

    it('tolerates a leading slash so absolute catalog entries keep working', () => {
        vi.stubEnv('BASE_URL', '/dev/blink/');
        expect(assetUrl('/effects/catalog.json')).toBe('/dev/blink/effects/catalog.json');
    });
});
