import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { openPackage } from '../../../../scripts/lib/packageDirectory';
import { loadBlinkFx } from '../loader';
import { validatePackage } from '../validatePackage';

const EFFECTS = join(process.cwd(), 'public', 'effects');
const previews = existsSync(EFFECTS)
    ? readdirSync(EFFECTS).filter(
          name =>
              name.endsWith('.blinkfx') &&
              (
                  JSON.parse(readFileSync(join(EFFECTS, name, 'manifest.json'), 'utf8')) as { license?: string }
              ).license?.startsWith('Third-party preview:') === true
      )
    : [];

describe('community preview packages', () => {
    describe.each(previews)('%s', name => {
        it('validates without an error and loads into the IR', async () => {
            const result = await validatePackage(openPackage(join(EFFECTS, name)));

            expect(result.findings.filter(finding => finding.severity === 'error')).toEqual([]);
            expect(result.manifest).not.toBeNull();
            expect(() => loadBlinkFx(result.manifest!, `effects/${name}`)).not.toThrow();
        });
    });
});
