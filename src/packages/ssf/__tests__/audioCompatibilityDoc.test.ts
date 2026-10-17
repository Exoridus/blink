import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SSF_SCALAR_NAMES } from '../profile/SsfAudioAdapter';

const DOC = readFileSync(join(process.cwd(), 'docs', 'audio-compatibility.md'), 'utf8');

describe('docs/audio-compatibility.md', () => {
    // The document is the published statement of what each signal is; a scalar added to the profile
    // without a row there would ship without one.
    it.each([...SSF_SCALAR_NAMES])('says what %s is', name => {
        expect(DOC).toContain(`\`${name}\``);
    });

    it.each(['raw', 'juiced', 'smooth', 'waveform'])('covers the %s spectrum channel', channel => {
        expect(DOC).toContain(`**${channel}**`);
    });

    it('covers the level trail channels', () => {
        expect(DOC).toContain('**all, bass, mid, high**');
    });
});
