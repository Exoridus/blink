import { describe, expect, it, vi } from 'vitest';

import { parseSizeExpression } from '../../../ir/sizeExpression';
import type { BlinkRenderTargetSpec } from '../../../ir/types';
import { RenderTargetPool } from '../RenderTargetPool';

interface FakeTexture {
    width: number;
    height: number;
    format: BlinkRenderTargetSpec['format'];
    destroyed: boolean;
    id: number;
}

let nextId = 0;
function makeFactory() {
    const created: FakeTexture[] = [];
    const factory = (width: number, height: number, format: BlinkRenderTargetSpec['format']) => {
        const tex: FakeTexture = { width, height, format, destroyed: false, id: nextId++ };
        created.push(tex);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tex as any).destroy = () => {
            tex.destroyed = true;
        };
        return tex as unknown as import('@codexo/exojs').RenderTexture;
    };
    return { created, factory };
}

function spec(overrides: Partial<BlinkRenderTargetSpec>): BlinkRenderTargetSpec {
    return { name: 'buf', width: null, height: null, scale: null, format: 'rgba8', persistent: false, ...overrides };
}

const SCREEN = { width: 800, height: 600 };

describe('RenderTargetPool', () => {
    it('applies explicit linear float filtering and mirror wrap to both history textures after allocation and resize', () => {
        const pool = new RenderTargetPool(
            [spec({ format: 'rgba32f', persistent: true, sampling: { filter: 'linear', wrap: 'mirror' } })],
            SCREEN
        );
        for (const parity of [0, 1]) {
            expect(pool.write('buf', parity).scaleMode).toBe(9729);
            expect(pool.write('buf', parity).wrapMode).toBe(33648);
        }
        pool.resize(64, 32);
        expect(pool.write('buf', 0).scaleMode).toBe(9729);
        expect(pool.read('buf', true, 0).wrapMode).toBe(33648);
        pool.dispose();
    });

    it('preserves the backend float default when sampling is absent', () => {
        const pool = new RenderTargetPool([spec({ format: 'rgba32f' })], SCREEN);
        expect(pool.write('buf', 0).scaleMode).toBe(9728);
        expect(pool.write('buf', 0).wrapMode).toBe(33071);
        pool.dispose();
    });

    it('allocates one texture for a transient target and returns it for read and write', () => {
        const { factory } = makeFactory();
        const pool = new RenderTargetPool([spec({ name: 'a', persistent: false })], SCREEN, factory);
        const w = pool.write('a', 0);
        expect(pool.read('a', false, 0)).toBe(w);
        expect(pool.read('a', true, 0)).toBe(w);
    });

    it('ping-pongs two textures for a persistent target by parity', () => {
        const { factory } = makeFactory();
        const pool = new RenderTargetPool([spec({ name: 'fb', persistent: true })], SCREEN, factory);
        const even = pool.write('fb', 0);
        const odd = pool.write('fb', 1);
        expect(even).not.toBe(odd);
        // even frame: read prev = the odd texture, read current = the even texture
        expect(pool.read('fb', true, 0)).toBe(odd);
        expect(pool.read('fb', false, 0)).toBe(even);
        // odd frame: read prev = the even texture
        expect(pool.read('fb', true, 1)).toBe(even);
    });

    it('resolves size from explicit dims, then scale, then screen', () => {
        const { factory } = makeFactory();
        const pool = new RenderTargetPool(
            [spec({ name: 'x', width: 320, height: 240 }), spec({ name: 'y', scale: 0.5 }), spec({ name: 'z' })],
            SCREEN,
            factory
        );
        expect([pool.write('x', 0).width, pool.write('x', 0).height]).toEqual([320, 240]);
        expect([pool.write('y', 0).width, pool.write('y', 0).height]).toEqual([400, 300]);
        expect([pool.write('z', 0).width, pool.write('z', 0).height]).toEqual([800, 600]);
    });

    it('reports the allocated size of a scaled target', () => {
        const { factory } = makeFactory();
        const pool = new RenderTargetPool([spec({ name: 'half', scale: 0.5 })], SCREEN, factory);
        expect(pool.size('half')).toEqual([400, 300]);
    });

    it('reallocates on resize and destroys the old textures', () => {
        const { created, factory } = makeFactory();
        const pool = new RenderTargetPool([spec({ name: 'fb', persistent: true })], SCREEN, factory);
        const before = created.length;
        pool.resize(1024, 768);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(created.slice(0, before).every(t => (t as any).destroyed)).toBe(true);
        expect(pool.write('fb', 0).width).toBe(1024);
    });

    it('reports the reallocated size after resize', () => {
        const { factory } = makeFactory();
        const pool = new RenderTargetPool([spec({ name: 'half', scale: 0.5 })], SCREEN, factory);
        pool.resize(1024, 768);
        expect(pool.size('half')).toEqual([512, 384]);
    });

    it('throws on an unknown target name', () => {
        const { factory } = makeFactory();
        const pool = new RenderTargetPool([spec({ name: 'a' })], SCREEN, factory);
        expect(() => pool.write('missing', 0)).toThrow(/unknown render target/i);
    });

    it('dispose destroys every texture', () => {
        const { created, factory } = makeFactory();
        const pool = new RenderTargetPool(
            [spec({ name: 'fb', persistent: true }), spec({ name: 'a' })],
            SCREEN,
            factory
        );
        pool.dispose();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(created.every(t => (t as any).destroyed)).toBe(true);
    });

    it('passes a requested float format through to the texture factory when supported', () => {
        const { created, factory } = makeFactory();
        new RenderTargetPool([spec({ name: 'hdr', format: 'rgba16f' })], SCREEN, factory, () => true);
        expect(created[0].format).toBe('rgba16f');
    });

    // Eight bits per channel is a different effect, not a quieter version of the same one, so an
    // unsupported float target is an error unless the package asked for the downgrade.
    it('refuses an unsupported float format when no rgba8 fallback was declared', () => {
        const { factory } = makeFactory();
        expect(
            () => new RenderTargetPool([spec({ name: 'hdr', format: 'rgba32f' })], SCREEN, factory, () => false)
        ).toThrow(/rgba32f/);
    });

    it('downgrades an unsupported float format only when the rgba8 fallback is permitted', () => {
        const { created, factory } = makeFactory();
        new RenderTargetPool([spec({ name: 'hdr', format: 'rgba32f' })], SCREEN, factory, () => false, true);
        expect(created[0].format).toBe('rgba8');
    });

    it('never probes or downgrades an rgba8 target', () => {
        const { created, factory } = makeFactory();
        const probe = vi.fn(() => false);
        new RenderTargetPool([spec({ name: 'ldr', format: 'rgba8' })], SCREEN, factory, probe);
        expect(created[0].format).toBe('rgba8');
        expect(probe).not.toHaveBeenCalled();
    });

    it('re-resolves the format on resize (still float when supported)', () => {
        const { created, factory } = makeFactory();
        const pool = new RenderTargetPool(
            [spec({ name: 'hdr', format: 'rgba16f', persistent: true })],
            SCREEN,
            factory,
            () => true
        );
        const before = created.length;
        pool.resize(1024, 768);
        expect(created.slice(before).every(t => t.format === 'rgba16f')).toBe(true);
    });

    describe('size expressions', () => {
        const expr = parseSizeExpression;

        it('evaluates width and height expressions against the screen', () => {
            const { created, factory } = makeFactory();
            const pool = new RenderTargetPool(
                [spec({ width: expr('$WIDTH / 2'), height: expr('floor($HEIGHT / 3)') })],
                SCREEN,
                factory
            );
            expect(pool.size('buf')).toEqual([400, 200]);
            expect([created[0].width, created[0].height]).toEqual([400, 200]);
        });

        it('defaults a missing dimension to the screen dimension', () => {
            const { factory } = makeFactory();
            const pool = new RenderTargetPool(
                [spec({ name: 'w', width: 64 }), spec({ name: 'h', height: expr('$HEIGHT / 2') })],
                SCREEN,
                factory
            );
            expect(pool.size('w')).toEqual([64, 600]);
            expect(pool.size('h')).toEqual([800, 300]);
        });

        it('clamps to an integer of at least 1 and to the backend maximum', () => {
            const { factory } = makeFactory();
            const pool = new RenderTargetPool(
                [spec({ width: expr('0.2'), height: expr('$HEIGHT * 100') })],
                SCREEN,
                factory,
                undefined,
                undefined,
                { maxTextureSize: 4096 }
            );
            expect(pool.size('buf')).toEqual([1, 4096]);
        });

        it('re-evaluates expressions when the screen is resized', () => {
            const { factory } = makeFactory();
            const pool = new RenderTargetPool([spec({ width: expr('$WIDTH / 2'), height: 10 })], SCREEN, factory);
            pool.resize(1000, 500);
            expect(pool.size('buf')).toEqual([500, 10]);
        });

        it('reads control values and reallocates only the targets whose size changed', () => {
            const { created, factory } = makeFactory();
            const pool = new RenderTargetPool(
                [
                    spec({ name: 'dyn', width: expr('$WIDTH * $zoom'), height: 100, persistent: true }),
                    spec({ name: 'fixed', width: 32, height: 32 }),
                ],
                SCREEN,
                factory,
                undefined,
                undefined,
                { controls: { zoom: 0.5 } }
            );
            expect(pool.size('dyn')).toEqual([400, 100]);
            const before = created.length;
            const oldDyn = [pool.write('dyn', 0), pool.write('dyn', 1)];

            expect(pool.updateControls({ zoom: 0.5 })).toEqual([]);
            expect(created.length).toBe(before);

            expect(pool.updateControls({ zoom: 0.25 })).toEqual(['dyn']);
            expect(pool.size('dyn')).toEqual([200, 100]);
            expect(created.length).toBe(before + 2);
            expect((oldDyn[0] as unknown as FakeTexture).destroyed).toBe(true);
            expect((oldDyn[1] as unknown as FakeTexture).destroyed).toBe(true);
            expect(pool.size('fixed')).toEqual([32, 32]);
        });

        it('treats bool controls as 0 or 1 and ignores unrelated control changes', () => {
            const { created, factory } = makeFactory();
            const pool = new RenderTargetPool(
                [spec({ width: expr('64 + 64 * $big'), height: 16 })],
                SCREEN,
                factory,
                undefined,
                undefined,
                { controls: { big: false, other: 1 } }
            );
            expect(pool.size('buf')).toEqual([64, 16]);
            const before = created.length;
            expect(pool.updateControls({ big: false, other: 9 })).toEqual([]);
            expect(pool.updateControls({ big: true, other: 9 })).toEqual(['buf']);
            expect(pool.size('buf')).toEqual([128, 16]);
            expect(created.length).toBe(before + 1);
        });

        it('fails clearly when an expression reads a control that was never supplied', () => {
            const { factory } = makeFactory();
            expect(() => new RenderTargetPool([spec({ width: expr('$zoom'), height: 10 })], SCREEN, factory)).toThrow(
                /target "buf".*zoom/
            );
        });
    });
});
