import { describe, expect, it } from 'vitest';

import { readSsfScene } from '../../../../../scripts/lib/ssfDirectory';
import { convertSsfScene } from '../../convert/convertSsfScene';
import { privateCorpusPath } from './corpusPaths';

describe('unchanged workshop media sampling', () => {
    it.each([
        ['3d_tunnel_cam_template.synScene', 'mirror'],
        ['_workshop_end_goal.synScene', 'repeat'],
    ])('preserves media sampling from the unchanged %s workshop fixture', (directory, wrap) => {
        const source = readSsfScene(
            privateCorpusPath('synesthesia', 'workshop', 'fixtures', 'Syn Workshop Scenes', directory)
        );
        const result = convertSsfScene(source);
        expect((source.sceneJson as { MEDIA: unknown }).MEDIA).toEqual([{ FILTER: 'linear', WRAP: wrap }]);
        expect(result.manifest.inputs?.find(input => input.name === 'syn_Media')?.sampling).toEqual({
            filter: 'linear',
            wrap,
        });
    });
});
