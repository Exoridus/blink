/**
 * One frame's worth of `pointer` host-input values, ready to upload as the
 * `bl_pointer*` uniform block (format spec 7.5). `down` and `active` are
 * already 0 or 1, matching the uniform's float encoding.
 */
export interface PointerFrameState {
    readonly position: readonly [number, number];
    readonly pressOrigin: readonly [number, number];
    readonly down: number;
    readonly active: number;
}

const DOM_BUTTON_INDICES = new Map<number, 0 | 1 | 2>([
    [0, 0],
    [2, 1],
    [1, 2],
]);

const INITIAL_FRAME: PointerFrameState = {
    position: [0, 0],
    pressOrigin: [0, 0],
    down: 0,
    active: 0,
};

/**
 * Tracks the host's primary pointing device and produces the `pointer`
 * host-input snapshot the spec describes.
 *
 * Events are injected by the caller (`pointerMoved`, `pointerPressed`, ...)
 * rather than read from the DOM or ExoJS, so the binder has no engine or
 * browser dependency. `x`/`y` on every method are root output-space pixels
 * with a top-left origin - the coordinate frame browser pointer events use -
 * and the binder converts them to the bottom-left origin the shader ABI
 * requires; it never rescales them per pass.
 *
 * Events update live state immediately; `snapshot()` is the only point that
 * publishes it to `state`, so every pass and script reading `state` within one
 * frame sees the same values regardless of when events arrived.
 */
export class PointerBinder {
    private outputHeight: number;

    private livePosition: [number, number] = [0, 0];
    private livePressOrigin: [number, number] = [0, 0];
    private liveDown = 0;
    private liveActive = 0;
    private liveButtons: [number, number, number] = [0, 0, 0];
    private frameButtons: readonly [number, number, number] = [0, 0, 0];

    private _state: PointerFrameState = INITIAL_FRAME;

    public constructor(outputHeight: number) {
        this.outputHeight = outputHeight;
    }

    /** Call whenever the root output resolution changes; affects the next event's y-flip. */
    public setOutputHeight(height: number): void {
        this.outputHeight = height;
    }

    /** A supplied DOM `buttons` mask also synchronizes chords reported as pointer moves. */
    public pointerMoved(x: number, y: number, buttons?: number): void {
        this.livePosition = [x, this.flipY(y)];
        this.liveActive = 1;
        if (buttons !== undefined) this.syncButtons(buttons);
    }

    /** Uses DOM button ids: 0 primary/left, 1 middle, 2 right; omitted means primary. */
    public pointerPressed(x: number, y: number, button = 0): void {
        const point: [number, number] = [x, this.flipY(y)];
        this.livePosition = point;
        if (button === 0) this.livePressOrigin = point;
        this.setButton(button, 1);
        this.liveActive = 1;
    }

    /** Releases one DOM button; a supplied mask synchronizes the remaining held buttons. */
    public pointerReleased(button = 0, buttons?: number): void {
        this.setButton(button, 0);
        if (buttons !== undefined) this.syncButtons(buttons);
    }

    /**
     * The pointer has left the surface. The host can no longer observe further
     * moves or a matching release, so `down` is forced to 0 here rather than
     * left holding a "held" state a later event could never clear; `position`
     * and `pressOrigin` keep their last known values, since nothing contradicts
     * them. The spec's 7.5 is silent on leave behavior - this is Blink's choice.
     */
    public pointerLeft(): void {
        this.liveActive = 0;
        this.liveDown = 0;
        this.liveButtons = [0, 0, 0];
    }

    /** Latches the frame's pointer values. Call once, at the start of the frame, before anything samples. */
    public snapshot(): void {
        this.frameButtons = [...this.liveButtons];
        this._state = {
            position: this.livePosition,
            pressOrigin: this.livePressOrigin,
            down: this.liveDown,
            active: this.liveActive,
        };
    }

    /** The values latched by the most recent `snapshot()`, unaffected by events since. */
    public get state(): PointerFrameState {
        return this._state;
    }

    /** Latched left, right and middle states, each encoded as 0 or 1. */
    public get buttons(): readonly [number, number, number] {
        return this.frameButtons;
    }

    private setButton(button: number, value: number): void {
        const index = DOM_BUTTON_INDICES.get(button);
        if (index !== undefined) this.liveButtons[index] = value;
        this.liveDown = this.liveButtons[0];
    }

    private syncButtons(buttons: number): void {
        const primary = (buttons & 1) === 0 ? 0 : 1;
        if (primary === 1 && this.liveDown === 0) this.livePressOrigin = this.livePosition;
        this.liveButtons = [primary, (buttons & 2) === 0 ? 0 : 1, (buttons & 4) === 0 ? 0 : 1];
        this.liveDown = primary;
    }

    private flipY(y: number): number {
        return this.outputHeight - y;
    }
}
