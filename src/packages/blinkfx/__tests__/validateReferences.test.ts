import { describe, expect, it } from 'vitest';

import type { BlinkFxManifest } from '../manifest';
import { validateManifestReferences } from '../validateReferences';

function manifest(overrides: Partial<BlinkFxManifest>): BlinkFxManifest {
    return {
        format: 'blinkfx/1',
        id: 'com.test.refs',
        title: 'Refs',
        shaders: { glsl: { main: 'shaders/main.frag.glsl' } },
        ...overrides,
    } as BlinkFxManifest;
}

describe('validateManifestReferences', () => {
    it('accepts a valid multipass manifest', () => {
        expect(
            validateManifestReferences(
                manifest({
                    passes: [
                        {
                            name: 'sim',
                            shader: 'main',
                            inputs: ['fb.previous'],
                            target: { name: 'fb', persistent: true },
                        },
                        { name: 'present', shader: 'main', inputs: ['fb'], target: 'screen' },
                    ],
                })
            )
        ).toEqual([]);
    });

    it('rejects a pass whose shader key does not exist', () => {
        expect(
            validateManifestReferences(
                manifest({
                    passes: [{ name: 'main', shader: 'missing', target: 'screen' }],
                })
            )
        ).toEqual(['passes[0].shader: "missing" is not declared in shaders.glsl or shaders.wgsl']);
    });

    it('rejects .previous on a non-persistent target', () => {
        expect(
            validateManifestReferences(
                manifest({
                    passes: [
                        {
                            name: 'sim',
                            shader: 'main',
                            inputs: ['fb.previous'],
                            target: { name: 'fb', persistent: false },
                        },
                    ],
                })
            )
        ).toEqual(['passes[0].inputs[0]: "fb.previous" requires target "fb" to be persistent']);
    });

    it('rejects two inputs binding the same uniform in one pass', () => {
        expect(
            validateManifestReferences(
                manifest({
                    assets: [{ name: 'noise', type: 'texture2d', path: 'assets/noise.png' }],
                    passes: [
                        {
                            name: 'main',
                            shader: 'main',
                            inputs: [
                                { source: 'asset.noise', uniform: 'uTex' },
                                { source: 'blink.audio.spectrum', uniform: 'uTex' },
                            ],
                            target: 'screen',
                        },
                    ],
                })
            )
        ).toEqual(['passes[0].inputs[1].uniform: "uTex" is already bound in this pass']);
    });

    it('rejects a current-frame read of a target produced later in the frame', () => {
        expect(
            validateManifestReferences(
                manifest({
                    passes: [
                        { name: 'present', shader: 'main', inputs: ['fb'], target: 'screen' },
                        { name: 'sim', shader: 'main', target: { name: 'fb', persistent: true } },
                    ],
                })
            )
        ).toEqual(['passes[0].inputs[0]: "fb" is not produced before this pass']);
    });

    it('rejects duplicate pass names and an asset path that escapes the package', () => {
        expect(
            validateManifestReferences(
                manifest({
                    assets: [{ name: 'n', type: 'texture2d', path: '../outside.png' }],
                    passes: [
                        { name: 'a', shader: 'main', target: 'screen' },
                        { name: 'a', shader: 'main', target: 'screen' },
                    ],
                })
            )
        ).toEqual(['assets[0].path: "../outside.png" escapes the package root', 'passes[1].name: "a" is already used']);
    });

    it('accepts a pass input that resolves to a declared host input', () => {
        expect(
            validateManifestReferences(
                manifest({
                    inputs: [{ name: 'mic', type: 'audio' }],
                    passes: [
                        {
                            name: 'main',
                            shader: 'main',
                            inputs: [{ source: 'input.mic', uniform: 'uMic' }],
                            target: 'screen',
                        },
                    ],
                })
            )
        ).toEqual([]);
    });

    it('rejects a pass input naming an undeclared host input', () => {
        expect(
            validateManifestReferences(
                manifest({
                    passes: [
                        {
                            name: 'main',
                            shader: 'main',
                            inputs: [{ source: 'input.mic', uniform: 'uMic' }],
                            target: 'screen',
                        },
                    ],
                })
            )
        ).toEqual(['passes[0].inputs[0]: input "mic" is not declared']);
    });

    it('accepts a pass reading its own persistent target without .previous', () => {
        expect(
            validateManifestReferences(
                manifest({
                    passes: [{ name: 'sim', shader: 'main', inputs: ['fb'], target: { name: 'fb', persistent: true } }],
                })
            )
        ).toEqual([]);
    });
});

describe('size expression control references', () => {
    const controls = [
        { name: 'zoom', type: 'float', default: 2 },
        { name: 'wide', type: 'bool', default: false },
        { name: 'tint', type: 'color', default: [1, 1, 1, 1] },
    ] as unknown as BlinkFxManifest['controls'];

    function sized(width: string) {
        return manifest({
            controls,
            passes: [
                { name: 'a', shader: 'main', target: { name: 'buf', width } },
                { name: 'b', shader: 'main', inputs: ['buf'], target: 'screen' },
            ],
        });
    }

    it('accepts numeric and bool controls', () => {
        expect(validateManifestReferences(sized('$WIDTH / $zoom + $wide'))).toEqual([]);
    });

    it('rejects an undeclared control', () => {
        expect(validateManifestReferences(sized('$WIDTH / $nope'))).toEqual([
            'passes[0].target.width: size expression reads "$nope", which is not a declared control',
        ]);
    });

    it('rejects a control that is not numeric or bool', () => {
        expect(validateManifestReferences(sized('$tint * 2'))).toEqual([
            'passes[0].target.width: size expression reads "$tint", which is a color control (only float, int and bool can size a target)',
        ]);
    });
});

describe('shader descriptor references', () => {
    it('rejects shader stage paths that leave the package', () => {
        expect(
            validateManifestReferences(
                manifest({
                    shaders: { glsl: { main: { fragment: 'ok.frag', vertex: '../outside.vert' } } },
                })
            )
        ).toEqual(['shaders.glsl.main.vertex: "../outside.vert" escapes the package root']);

        expect(
            validateManifestReferences(
                manifest({
                    shaders: { glsl: { main: '/etc/passwd' } },
                })
            )
        ).toEqual(['shaders.glsl.main: "/etc/passwd" escapes the package root']);
    });

    it('rejects a visual pass that names an audio-only shader', () => {
        expect(
            validateManifestReferences(
                manifest({
                    shaders: { glsl: { main: 'a.frag', sound: { audio: 'snd.glsl' } } },
                    passes: [{ name: 'p', shader: 'sound', target: 'screen' }],
                })
            )
        ).toEqual(['passes[0].shader: "sound" is an audio shader and cannot run as a visual pass']);
    });

    it('still lets outputs.audio name an audio shader', () => {
        expect(
            validateManifestReferences(
                manifest({
                    shaders: { glsl: { main: 'a.frag', sound: { audio: 'snd.glsl' } } },
                    outputs: {
                        visual: true,
                        audio: { shader: 'sound', abi: 'blink-audio/1', channels: 2, sampleRate: 'device' },
                    },
                })
            )
        ).toEqual([]);
    });
});
