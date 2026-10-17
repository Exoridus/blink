import type { BlinkScriptEvent } from '../ir/types';
import type { BlinkScriptControlValue } from './types';

/**
 * Threshold separating "off" from "on" for a scalar or vector control value.
 *
 * Matches the SSF-derived event vocabulary this ABI's `events` field shares:
 * the SSF conversion plan documents edge/level events as centered on 0.5.
 */
const ON_THRESHOLD = 0.5;

/**
 * A vector-valued control (color, point2d) has no single scalar to threshold.
 * Treating it as "on" when any component crosses the threshold is this
 * module's own extension of the scalar rule - the source material only
 * defines the threshold for single values.
 */
function isOnValue(value: BlinkScriptControlValue): boolean {
    if (typeof value === 'number') {
        return value >= ON_THRESHOLD;
    }
    for (let i = 0; i < value.length; i += 1) {
        if (value[i] >= ON_THRESHOLD) {
            return true;
        }
    }
    return false;
}

function valuesEqual(a: BlinkScriptControlValue, b: BlinkScriptControlValue): boolean {
    if (typeof a === 'number' || typeof b === 'number') {
        return a === b;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Whether an event binding's declared transition occurred between two
 * consecutive observations of a control's value.
 *
 * `whileOn`/`whileOff` are level-triggered: they match every frame the
 * condition holds rather than only on the edge into it.
 */
export function matchesEventTransition(
    on: BlinkScriptEvent,
    previousValue: BlinkScriptControlValue,
    currentValue: BlinkScriptControlValue
): boolean {
    switch (on) {
        case 'change':
            return !valuesEqual(previousValue, currentValue);
        case 'offToOn':
            return !isOnValue(previousValue) && isOnValue(currentValue);
        case 'onToOff':
            return isOnValue(previousValue) && !isOnValue(currentValue);
        case 'whileOn':
            return isOnValue(currentValue);
        case 'whileOff':
            return !isOnValue(currentValue);
    }
}
