import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ControlValueStore } from '../../../../runtime/render/ControlValueStore';
import { mapControls } from '../../convert/controls';
import { SsfControlProcessor } from '../../profile/SsfControlProcessor';
import { privateCorpusPath } from './corpusPaths';

describe('unchanged source control gallery', () => {
    it('publishes the supplied 42-control gallery defaults and its smooth counter transition', () => {
        const scene = JSON.parse(
            readFileSync(
                privateCorpusPath(
                    'synesthesia',
                    'builtin',
                    'local',
                    'Synesthesia_Control_Gallery.synScene',
                    'scene.json'
                ),
                'utf8'
            )
        ) as { CONTROLS: Record<string, unknown>[] };
        expect(scene.CONTROLS).toHaveLength(42);
        const mapped = mapControls(scene.CONTROLS, new Set());
        const controls = mapped.controls as ConstructorParameters<typeof SsfControlProcessor>[0];
        const store = new ControlValueStore();
        store.loadDefaults(controls, mapped.sources);
        const processor = new SsfControlProcessor(controls, mapped.sources);
        const defaults = processor.process(store.values, 0);
        expect(defaults).toMatchObject(
            Object.fromEntries([
                ['Drop_First', 0],
                ['Drop_Last', 2],
                ['Drop_Named_Values', 0.5],
                ['Drop_Smooth', 1],
                ['Bang_Counter', 0],
                ['Bang_Counter_Smooth', 0],
            ])
        );
        expect(defaults.Drop_Values_Only).toBeCloseTo(0.3, 6);
        store.queueBang('Bang_Counter_Smooth');
        store.beginFrame();
        expect(processor.process(store.values, 1 / 60).Bang_Counter_Smooth).toBeCloseTo(0.18, 6);
        store.endFrame();
    });
});
