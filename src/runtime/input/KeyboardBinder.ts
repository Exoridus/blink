/** Native v1 keyboard texture dimensions (format spec 7.6): one column per compatibility key code. */
export const KEYBOARD_TEXTURE_WIDTH = 256;
export const KEYBOARD_TEXTURE_HEIGHT = 3;

const ROW_DOWN = 0;
const ROW_TRANSITIONED = 1;
const ROW_TOGGLE = 2;

const TEXTURE_BYTE_LENGTH = KEYBOARD_TEXTURE_WIDTH * KEYBOARD_TEXTURE_HEIGHT * 4;

function isValidCode(code: number): boolean {
    return Number.isInteger(code) && code >= 0 && code < KEYBOARD_TEXTURE_WIDTH;
}

/**
 * Tracks host keyboard state and produces the 256x3 rgba8 keyboard texture the
 * spec describes: row 0 down now, row 1 transitioned to down since the
 * previous rendered frame, row 2 a persistent toggle flipped on each down
 * transition. Only the R channel carries state; G/B/A stay zero.
 *
 * Events are injected by the caller (`keyDown`/`keyUp`) rather than read from
 * the DOM or ExoJS, so the binder has no engine or browser dependency. Codes
 * outside 0-255 are silently ignored: the spec defines the texture only over
 * that range, and a host forwarding raw platform key codes should not be able
 * to crash a frame over one it doesn't recognize.
 *
 * Events update live per-key state immediately; `snapshot()` is the only
 * point that packs and publishes `textureData`, so every pass and script
 * reading it within one frame sees the same bytes regardless of when events
 * arrived. Row 1 is defined against that boundary: it is a key's live
 * down-transition since the *previous* snapshot, cleared once the current one
 * has read it - not a per-event flag a caller could poll mid-frame.
 */
export class KeyboardBinder {
    private readonly isDown = new Uint8Array(KEYBOARD_TEXTURE_WIDTH);
    private readonly toggle = new Uint8Array(KEYBOARD_TEXTURE_WIDTH);
    private readonly pendingTransition = new Uint8Array(KEYBOARD_TEXTURE_WIDTH);

    private _textureData = new Uint8Array(TEXTURE_BYTE_LENGTH);

    public keyDown(code: number): void {
        if (!isValidCode(code)) {
            return;
        }
        // A down transition is the up->down edge, not the level: a repeated keyDown while already
        // held (auto-repeat) must not re-mark the transition or flip the toggle again.
        if (this.isDown[code] === 0) {
            this.pendingTransition[code] = 1;
            this.toggle[code] ^= 1;
        }
        this.isDown[code] = 1;
    }

    public keyUp(code: number): void {
        if (!isValidCode(code)) {
            return;
        }
        this.isDown[code] = 0;
    }

    /** Latches and packs the frame's keyboard texture. Call once, at the start of the frame, before anything samples. */
    public snapshot(): void {
        const data = new Uint8Array(TEXTURE_BYTE_LENGTH);
        for (let code = 0; code < KEYBOARD_TEXTURE_WIDTH; code++) {
            data[(ROW_DOWN * KEYBOARD_TEXTURE_WIDTH + code) * 4] = this.isDown[code] === 1 ? 255 : 0;
            data[(ROW_TRANSITIONED * KEYBOARD_TEXTURE_WIDTH + code) * 4] = this.pendingTransition[code] === 1 ? 255 : 0;
            data[(ROW_TOGGLE * KEYBOARD_TEXTURE_WIDTH + code) * 4] = this.toggle[code] === 1 ? 255 : 0;
            // Consumed: a transition reported in this frame must not still be reported next frame.
            this.pendingTransition[code] = 0;
        }
        this._textureData = data;
    }

    /**
     * The 256x3 rgba8 payload latched by the most recent `snapshot()`, unaffected by events since.
     * A plain `Uint8Array`; the caller uploads it as a texture.
     */
    public get textureData(): Uint8Array {
        return this._textureData;
    }
}
