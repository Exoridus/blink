/**
 * A pass input's resource reference, parsed once at load time.
 *
 * Canonical manifest forms are `asset.<name>`, `input.<name>`, `target.<name>`,
 * `target.<name>.previous`, `blink.audio.spectrum` and `blink.audio.levelTrail`.
 * `target.<name>.previous` is only valid for a persistent target; that rule is
 * enforced by reference validation, not by the parser.
 */
export type BlinkSourceRef =
    | { readonly kind: 'target'; readonly name: string; readonly previous: boolean }
    | { readonly kind: 'asset'; readonly name: string }
    | { readonly kind: 'hostInput'; readonly name: string }
    | { readonly kind: 'blinkAudio'; readonly surface: 'spectrum' | 'levelTrail' };

export interface KnownSourceNames {
    readonly targets: ReadonlySet<string>;
    readonly assets: ReadonlySet<string>;
}

const AUDIO_SURFACES = new Set(['spectrum', 'levelTrail']);

/** Parses a canonical source form. Returns null for anything else, including bare names. */
export function parseSourceRef(raw: string): BlinkSourceRef | null {
    if (raw.startsWith('blink.audio.')) {
        const surface = raw.slice('blink.audio.'.length);
        return AUDIO_SURFACES.has(surface)
            ? { kind: 'blinkAudio', surface: surface as 'spectrum' | 'levelTrail' }
            : null;
    }
    if (raw.startsWith('asset.')) {
        const name = raw.slice('asset.'.length);
        return name.length > 0 ? { kind: 'asset', name } : null;
    }
    if (raw.startsWith('input.')) {
        const name = raw.slice('input.'.length);
        return name.length > 0 ? { kind: 'hostInput', name } : null;
    }
    if (raw.startsWith('target.')) {
        const rest = raw.slice('target.'.length);
        const previous = rest.endsWith('.previous');
        const name = previous ? rest.slice(0, -'.previous'.length) : rest;
        return name.length > 0 ? { kind: 'target', name, previous } : null;
    }
    return null;
}

/**
 * Resolves a July-era bare input name against the package's declared targets and
 * assets. Canonical forms are accepted unchanged so a package may mix both.
 */
export function resolveLegacySourceName(raw: string, known: KnownSourceNames): BlinkSourceRef | null {
    const canonical = parseSourceRef(raw);
    if (canonical !== null) {
        return canonical;
    }
    const previous = raw.endsWith('.previous');
    const name = previous ? raw.slice(0, -'.previous'.length) : raw;
    if (known.targets.has(name)) {
        return { kind: 'target', name, previous };
    }
    if (!previous && known.assets.has(name)) {
        return { kind: 'asset', name };
    }
    return null;
}

/** The resource's own name: the uniform a legacy binding gets. */
export function sourceRefResourceName(ref: BlinkSourceRef): string {
    return ref.kind === 'blinkAudio' ? ref.surface : ref.name;
}

export function formatSourceRef(ref: BlinkSourceRef): string {
    switch (ref.kind) {
        case 'asset':
            return `asset.${ref.name}`;
        case 'hostInput':
            return `input.${ref.name}`;
        case 'blinkAudio':
            return `blink.audio.${ref.surface}`;
        case 'target':
            return ref.previous ? `target.${ref.name}.previous` : `target.${ref.name}`;
    }
}
