interface ScalarOptions {
    readonly label: string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly value: number;
    readonly onChange: (value: number) => void;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function capture(element: HTMLElement, event: PointerEvent): void {
    if (typeof element.setPointerCapture === 'function') element.setPointerCapture(event.pointerId);
}

export function createKnob(options: ScalarOptions): { element: HTMLElement; setValue: (value: number) => void } {
    const element = document.createElement('div');
    element.className = 'control-panel__knob';
    element.tabIndex = 0;
    element.setAttribute('role', 'slider');
    element.setAttribute('aria-label', options.label);
    element.setAttribute('aria-valuemin', String(options.min));
    element.setAttribute('aria-valuemax', String(options.max));
    const indicator = document.createElement('span');
    indicator.className = 'control-panel__knob-indicator';
    element.append(indicator);
    let value = options.value;
    let drag: { id: number; y: number; value: number } | null = null;
    const enabled = (): boolean => element.getAttribute('aria-disabled') !== 'true';
    const setValue = (next: number): void => {
        value = clamp(next, options.min, options.max);
        const ratio = options.max === options.min ? 0 : (value - options.min) / (options.max - options.min);
        element.style.setProperty('--knob-angle', `${-135 + ratio * 270}deg`);
        element.style.setProperty('--knob-fill', `${ratio * 270}deg`);
        element.setAttribute('aria-valuenow', String(value));
    };
    const commit = (next: number): void => {
        if (!enabled()) return;
        const snapped = options.min + Math.round((next - options.min) / options.step) * options.step;
        setValue(Number(clamp(snapped, options.min, options.max).toFixed(8)));
        options.onChange(value);
    };
    element.addEventListener('pointerdown', event => {
        if (!enabled() || event.button !== 0) return;
        event.preventDefault();
        element.focus();
        drag = { id: event.pointerId, y: event.clientY, value };
        capture(element, event);
    });
    element.addEventListener('pointermove', event => {
        if (drag === null) return;
        if (drag.id !== event.pointerId) return;
        commit(drag.value + ((drag.y - event.clientY) / 150) * (options.max - options.min));
    });
    const endDrag = (): void => {
        drag = null;
    };
    element.addEventListener('pointerup', endDrag);
    element.addEventListener('pointercancel', endDrag);
    element.addEventListener('lostpointercapture', endDrag);
    element.addEventListener('keydown', event => {
        const deltas = new Map([
            ['ArrowUp', 1],
            ['ArrowRight', 1],
            ['ArrowDown', -1],
            ['ArrowLeft', -1],
            ['PageUp', 10],
            ['PageDown', -10],
        ]);
        if (event.key === 'Home') commit(options.min);
        else if (event.key === 'End') commit(options.max);
        else if (deltas.has(event.key)) commit(value + (deltas.get(event.key) ?? 0) * options.step);
        else return;
        event.preventDefault();
    });
    setValue(value);
    return { element, setValue };
}

interface PointOptions {
    readonly label: string;
    readonly x: { min: number; max: number };
    readonly y: { min: number; max: number };
    readonly value: readonly [number, number];
    readonly onChange: (x: number, y: number) => void;
}

export function createPointPad(options: PointOptions): {
    element: HTMLElement;
    setValue: (x: number, y: number) => void;
} {
    const element = document.createElement('div');
    element.className = 'control-panel__xy-pad';
    element.tabIndex = 0;
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', `${options.label} XY`);
    const dot = document.createElement('span');
    dot.className = 'control-panel__xy-dot';
    element.append(dot);
    let current = options.value;
    let dragging: number | null = null;
    const enabled = (): boolean => element.getAttribute('aria-disabled') !== 'true';
    const setValue = (x: number, y: number): void => {
        current = [clamp(x, options.x.min, options.x.max), clamp(y, options.y.min, options.y.max)];
        const xRatio =
            options.x.max === options.x.min ? 0 : (current[0] - options.x.min) / (options.x.max - options.x.min);
        const yRatio =
            options.y.max === options.y.min ? 0 : (current[1] - options.y.min) / (options.y.max - options.y.min);
        dot.style.left = `${xRatio * 100}%`;
        dot.style.bottom = `${yRatio * 100}%`;
    };
    const commit = (x: number, y: number): void => {
        if (!enabled()) return;
        setValue(x, y);
        options.onChange(current[0], current[1]);
    };
    const move = (event: PointerEvent): void => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        commit(
            options.x.min + ((event.clientX - rect.left) / rect.width) * (options.x.max - options.x.min),
            options.y.min + (1 - (event.clientY - rect.top) / rect.height) * (options.y.max - options.y.min)
        );
    };
    element.addEventListener('pointerdown', event => {
        if (!enabled() || event.button !== 0) return;
        event.preventDefault();
        element.focus();
        dragging = event.pointerId;
        capture(element, event);
        move(event);
    });
    element.addEventListener('pointermove', event => {
        if (dragging !== null && dragging === event.pointerId) move(event);
    });
    const endDrag = (event: PointerEvent): void => {
        if (dragging === event.pointerId) dragging = null;
    };
    element.addEventListener('pointerup', endDrag);
    element.addEventListener('pointercancel', endDrag);
    element.addEventListener('lostpointercapture', endDrag);
    element.addEventListener('keydown', event => {
        const xStep = (options.x.max - options.x.min) / 100;
        const yStep = (options.y.max - options.y.min) / 100;
        if (event.key === 'ArrowLeft') commit(current[0] - xStep, current[1]);
        else if (event.key === 'ArrowRight') commit(current[0] + xStep, current[1]);
        else if (event.key === 'ArrowUp') commit(current[0], current[1] + yStep);
        else if (event.key === 'ArrowDown') commit(current[0], current[1] - yStep);
        else return;
        event.preventDefault();
    });
    setValue(...current);
    return { element, setValue };
}
