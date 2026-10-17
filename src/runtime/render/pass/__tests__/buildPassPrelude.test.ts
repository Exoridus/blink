import { describe, expect, it } from 'vitest';

import { buildPassPrelude } from '../buildPassPrelude';

describe('buildPassPrelude', () => {
    it('always declares the bl_pass uniform', () => {
        expect(buildPassPrelude([])).toContain('uniform int bl_pass;');
    });

    it('declares one sampler2D per input', () => {
        const source = buildPassPrelude(['backbuffer', 'helper']);
        expect(source).toContain('uniform sampler2D backbuffer;');
        expect(source).toContain('uniform sampler2D helper;');
    });

    it('emits no sampler lines when there are no inputs', () => {
        expect(buildPassPrelude([])).not.toContain('sampler2D');
    });
});
