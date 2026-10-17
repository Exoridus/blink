import type { BlinkFxPackageList, BlinkFxPackageListItem } from '../services/BlinkFxService';

type EffectGroupId = 'blinkfx' | 'builtin' | 'community';

interface EffectGroup {
    readonly id: EffectGroupId;
    readonly label: string;
    readonly packages: BlinkFxPackageList;
}

function collection(pkg: BlinkFxPackageListItem): EffectGroupId {
    if (pkg.sourceFiles === undefined) return 'blinkfx';
    if (pkg.sourceCollection !== undefined) return pkg.sourceCollection;

    const path = new URL(pkg.basePath, 'https://blink.invalid/').pathname.split('/').filter(Boolean);
    const root = path.lastIndexOf('effects');
    return root >= 0 && path.length - root > 2 ? 'community' : 'builtin';
}

/** Groups effects in display order, preserving catalog order within each nonempty collection. */
export function groupEffects(packages: BlinkFxPackageList): readonly EffectGroup[] {
    const groups: EffectGroup[] = [
        { id: 'blinkfx', label: 'BlinkFX (.blinkfx)', packages: packages.filter(pkg => collection(pkg) === 'blinkfx') },
        {
            id: 'builtin',
            label: 'Synesthesia (.synScene)',
            packages: packages.filter(pkg => collection(pkg) === 'builtin'),
        },
        {
            id: 'community',
            label: 'Community (.synScene)',
            packages: packages.filter(pkg => collection(pkg) === 'community'),
        },
    ];
    return groups.filter(group => group.packages.length > 0);
}
