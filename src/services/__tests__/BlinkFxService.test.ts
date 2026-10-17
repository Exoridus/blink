import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlinkEffectIR } from '../../runtime/ir/types';
import { BlinkFxService } from '../BlinkFxService';

const CATALOG = {
    packages: [
        '/effects/plasma.blinkfx/manifest.json',
        '/effects/aurora.blinkfx/manifest.json',
        '/effects/audio_indicators.blinkfx/manifest.json',
    ],
};

const PLASMA_MANIFEST = {
    format: 'blinkfx/1',
    id: 'com.codexo.plasma',
    title: 'Plasma',
    description: 'Simple plasma.',
    shaders: { glsl: 'shaders/main.frag.glsl' },
};

const AURORA_MANIFEST = {
    format: 'blinkfx/1',
    id: 'com.codexo.aurora',
    title: 'Aurora',
    description: 'Aurora effect.',
    shaders: { glsl: 'shaders/main.frag.glsl' },
};

const INDICATORS_MANIFEST = {
    format: 'blinkfx/1',
    id: 'com.codexo.audio_indicators',
    title: 'Audio Indicators',
    description: 'Audio debug dashboard.',
    shaders: { glsl: 'shaders/main.frag.glsl' },
};

function makeCatalogFetch(manifests: Record<string, unknown>) {
    return async (url: string | URL | Request) => {
        const path = typeof url === 'string' ? url : url.toString();
        if (path.includes('catalog.json')) {
            return { ok: true, status: 200, json: async () => CATALOG } as Response;
        }
        for (const [key, value] of Object.entries(manifests)) {
            if (path.includes(key)) {
                return { ok: true, status: 200, json: async () => value } as Response;
            }
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
    };
}

function makeFailFetch(status: number) {
    return async () => ({ ok: false, status, json: async () => ({}) }) as Response;
}

describe('BlinkFxService', () => {
    let service: BlinkFxService;

    beforeEach(() => {
        vi.unstubAllGlobals();
        service = new BlinkFxService();
    });

    describe('getPackageList', () => {
        it('loads packages from catalog', async () => {
            vi.stubGlobal(
                'fetch',
                makeCatalogFetch({
                    'plasma.blinkfx/manifest.json': PLASMA_MANIFEST,
                    'aurora.blinkfx/manifest.json': AURORA_MANIFEST,
                    'audio_indicators.blinkfx/manifest.json': INDICATORS_MANIFEST,
                })
            );

            const list = await service.getPackageList();
            expect(list).toHaveLength(3);
            expect(list[0].id).toBe('com.codexo.plasma');
            expect(list[1].id).toBe('com.codexo.aurora');
            expect(list[2].id).toBe('com.codexo.audio_indicators');
            expect(list[0].basePath).toBe('/effects/plasma.blinkfx');
        });

        it('catalog order determines package order', async () => {
            vi.stubGlobal(
                'fetch',
                makeCatalogFetch({
                    'plasma.blinkfx/manifest.json': PLASMA_MANIFEST,
                    'aurora.blinkfx/manifest.json': AURORA_MANIFEST,
                    'audio_indicators.blinkfx/manifest.json': INDICATORS_MANIFEST,
                })
            );

            const list = await service.getPackageList();
            expect(list[0].id).toBe('com.codexo.plasma');
            expect(list[2].id).toBe('com.codexo.audio_indicators');
        });

        it('skips packages with invalid manifests', async () => {
            vi.stubGlobal(
                'fetch',
                makeCatalogFetch({
                    'plasma.blinkfx/manifest.json': PLASMA_MANIFEST,
                    'aurora.blinkfx/manifest.json': { invalid: true },
                    'audio_indicators.blinkfx/manifest.json': INDICATORS_MANIFEST,
                })
            );

            const list = await service.getPackageList();
            expect(list).toHaveLength(2);
            expect(list[0].id).toBe('com.codexo.plasma');
            expect(list[1].id).toBe('com.codexo.audio_indicators');
        });

        it('skips packages that fail to fetch', async () => {
            const fetch = makeCatalogFetch({
                'plasma.blinkfx/manifest.json': PLASMA_MANIFEST,
                'audio_indicators.blinkfx/manifest.json': INDICATORS_MANIFEST,
            });
            vi.stubGlobal('fetch', fetch);

            const list = await service.getPackageList();
            expect(list).toHaveLength(2);
        });

        it('throws when catalog fetch fails', async () => {
            vi.stubGlobal('fetch', makeFailFetch(500));
            await expect(service.getPackageList()).rejects.toThrow('catalog');
        });

        it('caches package list after first load', async () => {
            let calls = 0;
            vi.stubGlobal('fetch', async (url: string | URL | Request) => {
                calls++;
                const path = typeof url === 'string' ? url : url.toString();
                if (path.includes('catalog.json')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            packages: ['/effects/plasma.blinkfx/manifest.json'],
                        }),
                    } as Response;
                }
                return { ok: true, status: 200, json: async () => PLASMA_MANIFEST } as Response;
            });

            const list1 = await service.getPackageList();
            const list2 = await service.getPackageList();
            expect(list1).toBe(list2);
            expect(calls).toBe(3);
        });
    });

    describe('loadPackage', () => {
        it('loads a package by id', async () => {
            vi.stubGlobal(
                'fetch',
                makeCatalogFetch({
                    'plasma.blinkfx/manifest.json': PLASMA_MANIFEST,
                })
            );

            const ir: BlinkEffectIR = await service.loadPackage('com.codexo.plasma');

            expect(ir.format).toBe('blinkfx-ir/1');
            expect(ir.metadata.id).toBe('com.codexo.plasma');
            expect(ir.metadata.title).toBe('Plasma');
            expect(ir.passes).toHaveLength(1);
            expect(ir.passes[0].target).toEqual({ kind: 'screen' });
        });

        it('throws for unknown package id', async () => {
            vi.stubGlobal(
                'fetch',
                makeCatalogFetch({
                    'plasma.blinkfx/manifest.json': PLASMA_MANIFEST,
                })
            );

            await expect(service.loadPackage('com.unknown.pkg')).rejects.toThrow('BlinkFX package not found');
        });

        it('throws when manifest fetch fails for loadPackage', async () => {
            let plasmaLoadCount = 0;
            const fetch = async (url: string | URL | Request) => {
                const path = typeof url === 'string' ? url : url.toString();
                if (path.includes('catalog.json')) {
                    return { ok: true, status: 200, json: async () => CATALOG } as Response;
                }
                // All non-plasma manifests: succeed immediately
                if (!path.includes('plasma.blinkfx')) {
                    return { ok: true, status: 200, json: async () => AURORA_MANIFEST } as Response;
                }
                // Plasma manifest: succeed on catalog load (call 1), fail on loadPackage (call 2)
                plasmaLoadCount++;
                if (plasmaLoadCount === 1) {
                    return { ok: true, status: 200, json: async () => PLASMA_MANIFEST } as Response;
                }
                return { ok: false, status: 404, json: async () => ({}) } as Response;
            };
            vi.stubGlobal('fetch', fetch);

            await expect(service.loadPackage('com.codexo.plasma')).rejects.toThrow('Failed to load package manifest');
        });

        it('loads package with controls', async () => {
            const manifestWithControls = {
                format: 'blinkfx/1',
                id: 'com.test.controls',
                title: 'Controls Test',
                description: '',
                shaders: { glsl: 'shaders/main.frag.glsl' },
                controls: [
                    { name: 'speed', type: 'float', default: 1.0 },
                    { name: 'enabled', type: 'bool', default: true },
                    { name: 'tint', type: 'color', default: [1.0, 0.5, 0.2, 1.0] },
                ],
            };

            vi.stubGlobal(
                'fetch',
                makeCatalogFetch({
                    'plasma.blinkfx/manifest.json': manifestWithControls,
                })
            );

            const ir = await service.loadPackage('com.test.controls');
            expect(ir.controls).toHaveLength(3);
            expect(ir.controls[0].type).toBe('float');
        });
    });
});
