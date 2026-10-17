import { describe, expect, it } from 'vitest';

import { KEYBOARD_TEXTURE_HEIGHT, KEYBOARD_TEXTURE_WIDTH, KeyboardBinder } from '../KeyboardBinder';

const ROW_DOWN = 0;
const ROW_TRANSITIONED = 1;
const ROW_TOGGLE = 2;

/** Reads the R channel texel for one (row, key code) cell out of a latched texture payload. */
function texel(data: Uint8Array, row: number, code: number): number {
    return data[(row * KEYBOARD_TEXTURE_WIDTH + code) * 4];
}

describe('KeyboardBinder - texture shape', () => {
    it('is a 256x3 rgba8 buffer with every channel but R at zero', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.snapshot();

        expect(binder.textureData).toHaveLength(KEYBOARD_TEXTURE_WIDTH * KEYBOARD_TEXTURE_HEIGHT * 4);
        const offset = (ROW_DOWN * KEYBOARD_TEXTURE_WIDTH + 65) * 4;
        expect(binder.textureData[offset]).toBe(255);
        expect(binder.textureData[offset + 1]).toBe(0);
        expect(binder.textureData[offset + 2]).toBe(0);
        expect(binder.textureData[offset + 3]).toBe(0);
    });

    it('starts as all zero before any key event or snapshot', () => {
        const binder = new KeyboardBinder();

        expect(binder.textureData.every(byte => byte === 0)).toBe(true);
    });
});

describe('KeyboardBinder - row 0, down now', () => {
    it('marks a key down while it is held', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_DOWN, 65)).toBe(255);
        expect(texel(binder.textureData, ROW_DOWN, 64)).toBe(0);
    });

    it('clears row 0 once the key is released', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.keyUp(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_DOWN, 65)).toBe(0);
    });
});

describe('KeyboardBinder - row 1, transitioned to down since the previous rendered frame', () => {
    it('marks the frame a key transitions to down', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_TRANSITIONED, 65)).toBe(255);
    });

    it('clears row 1 on the next rendered frame even while the key is still held', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.snapshot();
        binder.snapshot();

        expect(texel(binder.textureData, ROW_TRANSITIONED, 65)).toBe(0);
        expect(texel(binder.textureData, ROW_DOWN, 65)).toBe(255);
    });

    it('does not mark a transition for a key that was already down', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.snapshot();

        binder.keyDown(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_TRANSITIONED, 65)).toBe(0);
    });

    it('marks the transition once even if the key goes down, up and down again within one frame', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.keyUp(65);
        binder.keyDown(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_TRANSITIONED, 65)).toBe(255);
        expect(texel(binder.textureData, ROW_DOWN, 65)).toBe(255);
    });
});

describe('KeyboardBinder - row 2, persistent toggle', () => {
    it('flips the toggle bit on a down transition', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_TOGGLE, 65)).toBe(255);
    });

    it('does not flip the toggle bit on release', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.keyUp(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_TOGGLE, 65)).toBe(255);
    });

    it('flips back on the next down transition', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.keyUp(65);
        binder.keyDown(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_TOGGLE, 65)).toBe(0);
    });

    it('does not flip again for a repeated keyDown while already down', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.keyDown(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_TOGGLE, 65)).toBe(255);
    });

    it('flips twice, net back to its prior value, for two down transitions inside one frame', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.keyUp(65);
        binder.keyDown(65);
        binder.keyUp(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_TOGGLE, 65)).toBe(0);
    });
});

describe('KeyboardBinder - key independence', () => {
    it('tracks each key code independently', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.keyDown(66);
        binder.keyUp(65);
        binder.snapshot();

        expect(texel(binder.textureData, ROW_DOWN, 65)).toBe(0);
        expect(texel(binder.textureData, ROW_DOWN, 66)).toBe(255);
        expect(texel(binder.textureData, ROW_TRANSITIONED, 65)).toBe(255);
        expect(texel(binder.textureData, ROW_TRANSITIONED, 66)).toBe(255);
    });
});

describe('KeyboardBinder - out-of-range key codes', () => {
    it('ignores codes outside 0-255 without throwing or corrupting the texture', () => {
        const binder = new KeyboardBinder();

        expect(() => {
            binder.keyDown(-1);
            binder.keyDown(256);
            binder.keyDown(1000);
        }).not.toThrow();
        binder.snapshot();

        expect(binder.textureData.every(byte => byte === 0)).toBe(true);
    });
});

describe('KeyboardBinder - frame snapshot boundary', () => {
    it('does not let events between two snapshots change the frame already latched', () => {
        const binder = new KeyboardBinder();

        binder.keyDown(65);
        binder.snapshot();
        const firstFrame = binder.textureData;

        binder.keyDown(66);

        expect(binder.textureData).toBe(firstFrame);
        expect(texel(binder.textureData, ROW_DOWN, 66)).toBe(0);

        binder.snapshot();

        expect(texel(binder.textureData, ROW_DOWN, 66)).toBe(255);
        // The reference captured before the second snapshot must remain the frozen first frame.
        expect(texel(firstFrame, ROW_DOWN, 66)).toBe(0);
    });
});
