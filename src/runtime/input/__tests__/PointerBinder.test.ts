import { describe, expect, it } from 'vitest';

import { PointerBinder } from '../PointerBinder';

describe('PointerBinder - initial state', () => {
    it('reports an inactive, centered-at-origin pointer before any event arrives', () => {
        const binder = new PointerBinder(1080);

        binder.snapshot();

        expect(binder.state).toEqual({
            position: [0, 0],
            pressOrigin: [0, 0],
            down: 0,
            active: 0,
        });
    });
});

describe('PointerBinder - coordinate conversion', () => {
    it('flips a top-left-origin y into bottom-left output-space pixels using the output height', () => {
        const binder = new PointerBinder(1080);

        binder.pointerMoved(640, 0);
        binder.snapshot();

        expect(binder.state.position).toEqual([640, 1080]);
    });

    it('leaves x untouched by the flip', () => {
        const binder = new PointerBinder(200);

        binder.pointerMoved(37, 200);
        binder.snapshot();

        expect(binder.state.position).toEqual([37, 0]);
    });

    it('maps the vertical center to itself regardless of height', () => {
        const binder = new PointerBinder(100);

        binder.pointerMoved(0, 50);
        binder.snapshot();

        expect(binder.state.position).toEqual([0, 50]);
    });

    it('uses the current output height after a resize, not the height at construction', () => {
        const binder = new PointerBinder(100);

        binder.setOutputHeight(1000);
        binder.pointerMoved(10, 0);
        binder.snapshot();

        expect(binder.state.position).toEqual([10, 1000]);
    });
});

describe('PointerBinder - press origin', () => {
    it('captures the press origin at press and holds it for the duration of the press', () => {
        const binder = new PointerBinder(200);

        binder.pointerPressed(50, 50);
        binder.snapshot();
        expect(binder.state.pressOrigin).toEqual([50, 150]);

        binder.pointerMoved(90, 90);
        binder.snapshot();

        expect(binder.state.position).toEqual([90, 110]);
        expect(binder.state.pressOrigin).toEqual([50, 150]);
    });

    it('keeps the press origin at the last press after release, until the next press', () => {
        const binder = new PointerBinder(200);

        binder.pointerPressed(50, 50);
        binder.pointerReleased();
        binder.snapshot();

        expect(binder.state.pressOrigin).toEqual([50, 150]);
    });
});

describe('PointerBinder - down and active flags', () => {
    it('sets down while the primary button is held and clears it on release', () => {
        const binder = new PointerBinder(200);

        binder.pointerPressed(10, 10);
        binder.snapshot();
        expect(binder.state.down).toBe(1);

        binder.pointerReleased();
        binder.snapshot();
        expect(binder.state.down).toBe(0);
    });

    it('marks the pointer active as soon as any event is known', () => {
        const binder = new PointerBinder(200);

        binder.pointerMoved(10, 10);
        binder.snapshot();

        expect(binder.state.active).toBe(1);
    });
});

describe('PointerBinder - a pointer leaving', () => {
    it('clears active and down when the pointer leaves, since a release outside cannot be observed', () => {
        const binder = new PointerBinder(200);

        binder.pointerPressed(10, 10);
        binder.pointerLeft();
        binder.snapshot();

        expect(binder.state.active).toBe(0);
        expect(binder.state.down).toBe(0);
    });

    it('retains the last known position and press origin after the pointer leaves', () => {
        const binder = new PointerBinder(200);

        binder.pointerPressed(10, 10);
        binder.pointerLeft();
        binder.snapshot();

        expect(binder.state.position).toEqual([10, 190]);
        expect(binder.state.pressOrigin).toEqual([10, 190]);
    });
});

describe('PointerBinder - frame snapshot boundary', () => {
    it('does not let events between two snapshots change the frame already latched', () => {
        const binder = new PointerBinder(200);

        binder.pointerMoved(10, 10);
        binder.snapshot();
        const firstFrame = binder.state;

        binder.pointerMoved(99, 99);

        expect(binder.state).toBe(firstFrame);
        expect(binder.state.position).toEqual([10, 190]);

        binder.snapshot();

        expect(binder.state.position).toEqual([99, 101]);
        // The reference captured before the second snapshot must remain the frozen first frame.
        expect(firstFrame.position).toEqual([10, 190]);
    });
});

describe('PointerBinder - button families', () => {
    it('keeps right and middle presses separate from native primary state and origin', () => {
        const binder = new PointerBinder(200);
        binder.pointerPressed(10, 20, 2);
        binder.snapshot();
        expect(binder.buttons).toEqual([0, 1, 0]);
        expect(binder.state.down).toBe(0);
        expect(binder.state.pressOrigin).toEqual([0, 0]);
        binder.pointerPressed(30, 40, 1);
        binder.snapshot();
        expect(binder.buttons).toEqual([0, 1, 1]);
        binder.pointerPressed(50, 60);
        binder.snapshot();
        expect(binder.buttons).toEqual([1, 1, 1]);
        expect(binder.state.down).toBe(1);
        expect(binder.state.pressOrigin).toEqual([50, 140]);
        binder.pointerReleased(2);
        binder.snapshot();
        expect(binder.buttons).toEqual([1, 0, 1]);
        expect(binder.state.down).toBe(1);
        binder.pointerReleased(1);
        binder.pointerReleased();
        binder.snapshot();
        expect(binder.buttons).toEqual([0, 0, 0]);
    });

    it('latches button chords from browser masks without changing the preceding snapshot', () => {
        const binder = new PointerBinder(200);
        binder.pointerMoved(10, 20, 2);
        binder.snapshot();
        const first = binder.buttons;
        expect(first).toEqual([0, 1, 0]);
        binder.pointerMoved(30, 40, 7);
        expect(binder.buttons).toBe(first);
        binder.snapshot();
        expect(binder.buttons).toEqual([1, 1, 1]);
        expect(binder.state.pressOrigin).toEqual([30, 160]);
        binder.pointerMoved(50, 60, 5);
        binder.snapshot();
        expect(binder.buttons).toEqual([1, 0, 1]);
        expect(binder.state.pressOrigin).toEqual([30, 160]);
        expect(first).toEqual([0, 1, 0]);
        binder.pointerLeft();
        binder.snapshot();
        expect(binder.buttons).toEqual([0, 0, 0]);
        expect(binder.state.down).toBe(0);
        expect(binder.state.active).toBe(0);
    });
});
