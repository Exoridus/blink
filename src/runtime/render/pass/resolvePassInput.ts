import type { UniformValue } from '@codexo/exojs';

import type { BlinkSourceRef } from '../../ir/sourceRef';
import type { RenderTargetPool } from './RenderTargetPool';

/**
 * Non-render-target resources a pass can sample. A resource that is not ready
 * yet (an asset still decoding, a host input with no live producer) returns
 * undefined and is bound to the dummy texture, so a pass never samples a
 * texture it is also writing.
 */
export interface PassResourceStore {
    asset(name: string): UniformValue | undefined;
    hostInput(name: string): UniformValue | undefined;
    blinkAudio(surface: 'spectrum' | 'levelTrail'): UniformValue | undefined;
}

export function resolvePassInput(
    source: BlinkSourceRef,
    pool: RenderTargetPool,
    parity: number,
    store: PassResourceStore,
    fallback: UniformValue
): UniformValue {
    switch (source.kind) {
        case 'target':
            return pool.read(source.name, source.previous, parity);
        case 'asset':
            return store.asset(source.name) ?? fallback;
        case 'hostInput':
            return store.hostInput(source.name) ?? fallback;
        case 'blinkAudio':
            return store.blinkAudio(source.surface) ?? fallback;
    }
}
