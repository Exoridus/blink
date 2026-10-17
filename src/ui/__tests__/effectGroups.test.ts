import { describe, expect, it } from 'vitest';

import type { BlinkFxPackageList, BlinkFxPackageListItem } from '../../services/BlinkFxService';
import { groupEffects } from '../effectGroups';

const item = (id: string, basePath: string, extra: Partial<BlinkFxPackageListItem> = {}): BlinkFxPackageListItem => ({
    id,
    title: id,
    description: '',
    basePath,
    ...extra,
});

describe('groupEffects', () => {
    it('keeps native and installed packages first, then builtin scenes, then community scenes', () => {
        const packages: BlinkFxPackageList = [
            item('community', '/blink/effects/owner/scene.synScene/', { sourceFiles: [] }),
            item('builtin', 'https://example.com/blink/effects/scene.synScene', { sourceFiles: [] }),
            item('native', '/effects/native'),
            item('installed', 'blinkfx-installed/local', { installed: true }),
        ];
        expect(groupEffects(packages).map(group => group.packages.map(pkg => pkg.id))).toEqual([
            ['native', 'installed'],
            ['builtin'],
            ['community'],
        ]);
        expect(packages.map(pkg => pkg.id)).toEqual(['community', 'builtin', 'native', 'installed']);
    });

    it('uses explicit collection metadata and omits empty groups', () => {
        const packages: BlinkFxPackageList = [
            item('external', '/effects/scene.synScene', { sourceFiles: [], sourceCollection: 'community' }),
            item('shipped', '/effects/owner/scene.synScene', { sourceFiles: [], sourceCollection: 'builtin' }),
        ];
        expect(groupEffects(packages).map(group => group.packages.map(pkg => pkg.id))).toEqual([
            ['shipped'],
            ['external'],
        ]);
    });
});
