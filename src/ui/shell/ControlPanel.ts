import './controlPanel.scss';

import type { UniformValue } from '@codexo/exojs';

import type {
    BlinkBangControl,
    BlinkBoolControl,
    BlinkColorControl,
    BlinkControlSpec,
    BlinkEnumControl,
    BlinkFloatControl,
    BlinkIntControl,
    BlinkPoint2DControl,
    BlinkPresetRef,
} from '../../runtime/ir/types';
import { createKnob, createPointPad } from './controlWidgets';
import type { ShellHost, ShellRuntimeState, Unsubscribe } from './ShellHost';
import { ShellOverlay } from './ShellOverlay';

const PANEL_ID = 'control-panel';
const PANEL_TITLE = 'Steuerung';
const NO_CONTROLS_MESSAGE = 'Dieser Effekt hat keine Steuerelemente.';
const RESET_LABEL = 'Zurücksetzen';
const RESET_TITLE = 'Auf Standardwert zurücksetzen';
const BANG_LABEL = 'Auslösen';
const PRESET_LABEL = 'Preset';
const PRESET_APPLY_LABEL = 'Anwenden';

// A range/number pair needs a bound on both sides to be meaningful at all. Widening
// the missing side from the value - not from the given bound - guarantees
// min <= value <= max always holds, so an absent bound never yields a broken range.
const FALLBACK_RADIUS = 10;
const FLOAT_STEP_DIVISIONS = 100;
const MIN_FLOAT_STEP = 0.0001;
const DEFAULT_INT_STEP = 1;
const HEX_BYTE_MAX = 255;

function describeError(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.length > 0 ? error.message : fallback;
}

function resolveBounds(min: number | null, max: number | null, value: number): { min: number; max: number } {
    const lo = min ?? value - FALLBACK_RADIUS;
    const hi = max ?? value + FALLBACK_RADIUS;
    return { min: Math.min(lo, value), max: Math.max(hi, value) };
}

function resolveFloatStep(step: number | null, min: number, max: number): number {
    return step ?? Math.max((max - min) / FLOAT_STEP_DIVISIONS, MIN_FLOAT_STEP);
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function componentToHex(component: number): string {
    return Math.round(clamp01(component) * HEX_BYTE_MAX)
        .toString(16)
        .padStart(2, '0');
}

function hexToComponent(hex: string): number {
    return parseInt(hex, 16) / HEX_BYTE_MAX;
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function hexToRgb(hex: string): readonly [number, number, number] {
    return [hexToComponent(hex.slice(1, 3)), hexToComponent(hex.slice(3, 5)), hexToComponent(hex.slice(5, 7))];
}

type ControlValues = Readonly<Record<string, UniformValue>>;

// `state.controlValues` carries the render-side encoding (see controlUniformMapper.ts),
// not the author-facing one a widget writes through applyControl - float/int pass
// through as plain numbers, but bool, enum, color and point2d each need converting
// back before a widget can show them. A name absent from the map (no value has ever
// been written for it) falls back to the control's own declared default.

function numberValue(values: ControlValues, name: string, fallback: number): number {
    const raw = values[name];
    return typeof raw === 'number' ? raw : fallback;
}

function boolValue(values: ControlValues, name: string, fallback: boolean): boolean {
    const raw = values[name];
    return typeof raw === 'number' ? raw !== 0 : fallback;
}

/** `enum` values arrive as the option's index, never the option string; an index the
 * control no longer declares (or no value at all) falls back to the default option. */
function enumValue(values: ControlValues, name: string, options: readonly string[], fallback: string): string {
    const raw = values[name];
    return typeof raw === 'number' ? (options[raw] ?? fallback) : fallback;
}

/** `color` and `point2d` values arrive as packed `Float32Array`s, not the author-facing
 * tuple; anything else (missing, or the wrong shape) falls back to the declared default. */
function colorValue(
    values: ControlValues,
    name: string,
    fallback: readonly [number, number, number, number]
): readonly [number, number, number, number] {
    const raw = values[name];
    return raw instanceof Float32Array && raw.length >= 3
        ? [raw[0], raw[1], raw[2], raw.length > 3 ? raw[3] : fallback[3]]
        : fallback;
}

function point2dValue(
    values: ControlValues,
    name: string,
    fallback: readonly [number, number]
): readonly [number, number] {
    const raw = values[name];
    return raw instanceof Float32Array && raw.length === 2 ? [raw[0], raw[1]] : fallback;
}

/**
 * Groups controls by their `group` field, preserving first-appearance order for both
 * the groups themselves and the controls within them. Ungrouped controls (`group ===
 * null`) collect under one shared `null` bucket rather than each standing alone.
 */
function groupControls(controls: readonly BlinkControlSpec[]): Map<string | null, BlinkControlSpec[]> {
    const groups = new Map<string | null, BlinkControlSpec[]>();
    for (const control of controls) {
        const bucket = groups.get(control.group);
        if (bucket === undefined) {
            groups.set(control.group, [control]);
        } else {
            bucket.push(control);
        }
    }
    return groups;
}

function createRow(control: BlinkControlSpec): { row: HTMLElement; labelRow: HTMLElement } {
    const row = document.createElement('div');
    row.className = 'control-panel__control';
    row.dataset.controlName = control.name;
    row.dataset.controlType = control.type;

    const labelRow = document.createElement('div');
    labelRow.className = 'control-panel__label-row';

    const label = document.createElement('span');
    label.className = 'control-panel__label';
    label.textContent = control.label ?? control.name;
    if (control.description !== null) {
        label.title = control.description;
    }
    labelRow.appendChild(label);
    row.appendChild(labelRow);

    return { row, labelRow };
}

/**
 * Shows the active effect's controls and presets with presentation hints from source metadata.
 * Local edits support undo of raw settings; state pushes repaint from the host's snapshots.
 * Group locks prevent manual edits only and are cleared when another effect becomes active.
 */
export class ControlPanel extends ShellOverlay {
    private readonly host: ShellHost;
    private state: ShellRuntimeState | null = null;
    private currentValues: Record<string, UniformValue> = {};
    private readonly lockedGroups = new Set<string | null>();
    private readonly history: Array<Record<string, UniformValue>> = [];
    private writing = false;
    private toolbarElement!: HTMLElement;

    private statusElement!: HTMLElement;
    private presetsElement!: HTMLElement;
    private groupsElement!: HTMLElement;
    private unsubscribe: Unsubscribe | null = null;

    // Guards a preset apply's continuation against writing into a row that a later
    // state push already discarded (handleState rebuilds unconditionally, e.g. after
    // an effect switch elsewhere), and against writing after unmount.
    private renderGeneration = 0;
    private destroyed = false;

    public constructor(host: ShellHost) {
        super(PANEL_ID, PANEL_TITLE, { startCollapsed: true });
        this.host = host;
    }

    protected renderBody(body: HTMLElement): void {
        this.statusElement = document.createElement('div');
        this.statusElement.className = 'control-panel__status';

        this.presetsElement = document.createElement('div');
        this.presetsElement.className = 'control-panel__presets';

        this.toolbarElement = document.createElement('div');
        this.toolbarElement.className = 'control-panel__toolbar';

        this.groupsElement = document.createElement('div');
        this.groupsElement.className = 'control-panel__groups';

        body.append(this.statusElement, this.presetsElement, this.toolbarElement, this.groupsElement);

        this.unsubscribe = this.host.subscribeState(this.handleState);
    }

    public unmount(): void {
        this.destroyed = true;
        this.unsubscribe?.();
        this.unsubscribe = null;
        super.unmount();
    }

    /**
     * Discards every widget and rebuilds from the pushed control set. A control panel still
     * showing the previous effect's controls is worse than a briefly empty one, so this never
     * tries to diff or reuse the old DOM.
     */
    private readonly handleState = (state: ShellRuntimeState): void => {
        this.renderGeneration += 1;
        if (this.state?.activeEffectId !== state.activeEffectId) {
            this.lockedGroups.clear();
            this.history.length = 0;
        } else if (!this.writing) this.history.length = 0;
        this.state = state;
        this.currentValues = { ...state.controlValues };
        this.setStatus('');
        this.presetsElement.replaceChildren(...this.buildPresets(state.presets));
        this.renderControls();
    };

    private source(control: BlinkControlSpec): Record<string, unknown> {
        return (this.state?.controlSources?.[control.name] ?? {}) as Record<string, unknown>;
    }

    private family(control: BlinkControlSpec): string {
        const type = this.source(control).type;
        return typeof type === 'string' ? type.split(/\s+/)[0] : '';
    }

    private dropdownLabels(control: BlinkControlSpec): string[] {
        const source = this.source(control);
        if (Array.isArray(source.labels)) return source.labels.map(String);
        return Array.isArray(source.values) ? source.values.map(String) : [];
    }

    private defaultValue(control: BlinkControlSpec): UniformValue {
        if (control.type === 'bang') return 0;
        if (control.type === 'bool') return control.default ? 1 : 0;
        if (control.type === 'enum') return control.options.indexOf(control.default);
        return control.default;
    }

    private renderControls(): void {
        this.groupsElement.replaceChildren();
        this.toolbarElement.replaceChildren();
        if (this.state === null || this.state.controls.length === 0) {
            this.setStatus(NO_CONTROLS_MESSAGE);
            return;
        }
        const controls = this.state.controls;
        const allLocked = controls.every(control => this.lockedGroups.has(control.group));
        this.toolbarElement.append(
            this.actionButton('lock', allLocked ? 'Entsperren' : 'Alle sperren', () => {
                for (const control of controls) {
                    if (allLocked) this.lockedGroups.delete(control.group);
                    else this.lockedGroups.add(control.group);
                }
                this.renderControls();
            }),
            this.actionButton('reset', 'Zurücksetzen', () => this.changeMany(controls, false)),
            this.actionButton('randomize', 'Zufall', () => this.changeMany(controls, true))
        );
        const undo = this.actionButton('undo', 'Rückgängig', () => this.undo());
        undo.disabled = this.history.length === 0;
        this.toolbarElement.append(undo);
        let index = 0;
        for (const [group, specs] of groupControls(controls)) {
            const container = this.buildGroup(group, specs, this.currentValues);
            container.style.setProperty(
                '--group-color',
                `hsl(${[210, 28, 140, 280, 8, 48, 180][index++ % 7]} 75% 60%)`
            );
            this.groupsElement.appendChild(container);
        }
    }

    private actionButton(action: string, label: string, invoke: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.action = action;
        button.textContent = label;
        button.addEventListener('click', invoke);
        return button;
    }

    private actionIcon(action: string): string {
        const paths: Record<string, string> = {
            locked: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
            unlocked: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0"/>',
            reset: '<path d="M4 4v5h5M4 9a8 8 0 1 1 0 6"/>',
            randomize: '<path d="M3 5h3l12 14h3M3 19h3L18 5h3M18 2l3 3-3 3M18 16l3 3-3 3"/>',
        };
        return `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[action] ?? ''}</svg>`;
    }

    private randomValue(control: BlinkControlSpec): UniformValue {
        if (control.type === 'bool') return Math.random() < 0.5 ? 0 : 1;
        if (control.type === 'enum') return Math.floor(Math.random() * control.options.length);
        if (control.type === 'color') return [Math.random(), Math.random(), Math.random(), control.default[3]];
        if (control.type === 'point2d') {
            const component = (axis: number): number => {
                const min = control.min?.[axis] ?? 0;
                return min + Math.random() * ((control.max?.[axis] ?? 1) - min);
            };
            return [component(0), component(1)];
        }
        if (control.type === 'bang') return 0;
        if (this.family(control) === 'dropdown') return Math.floor(Math.random() * this.dropdownLabels(control).length);
        const bounds = resolveBounds(control.min, control.max, control.default);
        if (this.family(control) === 'toggle') return Math.random() < 0.5 ? bounds.min : bounds.max;
        const value = bounds.min + Math.random() * (bounds.max - bounds.min);
        return control.type === 'int' ? Math.round(value) : value;
    }

    private snapshot(controls: readonly BlinkControlSpec[]): Record<string, UniformValue> {
        return Object.fromEntries(
            controls.map(control => [control.name, this.currentValues[control.name] ?? this.defaultValue(control)])
        );
    }

    private changeMany(controls: readonly BlinkControlSpec[], random: boolean): void {
        const editable = controls.filter(
            control =>
                control.type !== 'bang' &&
                !this.lockedGroups.has(control.group) &&
                (!random || this.family(control) !== 'bang')
        );
        if (editable.length === 0) return;
        const durable = editable.filter(control => this.family(control) !== 'bang');
        if (durable.length > 0) this.history.push(this.snapshot(durable));
        for (const control of editable) {
            if (random) this.applyControl(control.name, this.randomValue(control), false);
            else this.resetControl(control, false);
        }
        this.renderControls();
    }

    private undo(): void {
        const previous = this.history.pop();
        if (previous === undefined) return;
        for (const [name, value] of Object.entries(previous)) this.applyControl(name, value, false);
        this.renderControls();
    }

    /**
     * Builds the preset selector, or nothing when the effect ships none - `.control-panel__presets`
     * then stays childless and, per shell.scss, takes up no space, so an effect without presets
     * renders exactly as one without this feature would.
     */
    private buildPresets(presets: readonly BlinkPresetRef[]): readonly HTMLElement[] {
        if (presets.length === 0) {
            return [];
        }

        const label = document.createElement('span');
        label.className = 'control-panel__label';
        label.textContent = PRESET_LABEL;

        const select = document.createElement('select');
        select.className = 'control-panel__preset-select';
        select.setAttribute('aria-label', PRESET_LABEL);
        for (const preset of presets) {
            const option = document.createElement('option');
            option.value = preset.name;
            option.textContent = preset.name;
            select.appendChild(option);
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'control-panel__preset-apply';
        button.textContent = PRESET_APPLY_LABEL;

        const generation = this.renderGeneration;
        button.addEventListener('click', () => {
            // Disabling happens synchronously inside applyPreset, before its first await, so a
            // second click landing in the same tick already sees button.disabled and is a no-op
            // - this check is the authoritative guard, disabling the widgets is the visible one.
            if (button.disabled) {
                return;
            }
            void this.applyPreset(select.value, generation, select, button);
        });

        return [label, select, button];
    }

    private async applyPreset(
        name: string,
        generation: number,
        select: HTMLSelectElement,
        button: HTMLButtonElement
    ): Promise<void> {
        select.disabled = true;
        button.disabled = true;

        try {
            await this.host.applyPreset(name);
            if (this.destroyed || generation !== this.renderGeneration) {
                return;
            }
            this.setStatus('');
        } catch (error) {
            if (this.destroyed || generation !== this.renderGeneration) {
                return;
            }
            this.setStatus(describeError(error, `Preset "${name}" konnte nicht angewendet werden.`), true);
        } finally {
            if (!this.destroyed && generation === this.renderGeneration) {
                select.disabled = false;
                button.disabled = false;
            }
        }
    }

    private buildGroup(group: string | null, specs: readonly BlinkControlSpec[], values: ControlValues): HTMLElement {
        const container = document.createElement('div');
        container.className = 'control-panel__group';
        container.dataset.controlGroup = group ?? '';
        const families = new Set(specs.map(spec => this.family(spec) || spec.type));
        if (families.size === 1) container.dataset.controlFamily = [...families][0];
        const locked = this.lockedGroups.has(group);
        container.classList.toggle('control-panel__group--locked', locked);

        if (group !== null) {
            const heading = document.createElement('h3');
            heading.className = 'control-panel__group-title';
            heading.textContent = group;
            container.appendChild(heading);
        }

        const actions = document.createElement('div');
        actions.className = 'control-panel__group-actions';
        const lock = this.actionButton('lock', '', () => {
            if (locked) this.lockedGroups.delete(group);
            else this.lockedGroups.add(group);
            this.renderControls();
        });
        lock.innerHTML = this.actionIcon(locked ? 'locked' : 'unlocked');
        lock.setAttribute('aria-label', locked ? 'Gruppe entsperren' : 'Gruppe sperren');
        lock.setAttribute('aria-pressed', String(locked));
        lock.title = 'Manuelle Änderungen an dieser Gruppe sperren';
        const reset = this.actionButton('reset', '', () => this.changeMany(specs, false));
        reset.innerHTML = this.actionIcon('reset');
        reset.setAttribute('aria-label', 'Gruppe zurücksetzen');
        reset.disabled = locked;
        const randomize = this.actionButton('randomize', '', () => this.changeMany(specs, true));
        randomize.innerHTML = this.actionIcon('randomize');
        randomize.setAttribute('aria-label', 'Gruppe zufällig einstellen');
        randomize.disabled = locked;
        actions.append(lock, reset, randomize);
        container.append(actions);
        const widgets = document.createElement('div');
        widgets.className = 'control-panel__group-controls';
        for (const spec of specs) {
            const widget = this.buildControl(spec, values);
            for (const input of widget.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
                'input, select, button'
            )) {
                input.disabled = locked;
                if (!input.hasAttribute('aria-label')) input.setAttribute('aria-label', spec.label ?? spec.name);
            }
            for (const input of widget.querySelectorAll<HTMLElement>('[tabindex]')) {
                input.setAttribute('aria-disabled', String(locked));
                input.tabIndex = locked ? -1 : 0;
            }
            widgets.append(widget);
        }
        container.append(widgets);

        return container;
    }

    private buildControl(control: BlinkControlSpec, values: ControlValues): HTMLElement {
        const family = this.family(control);
        if (control.type === 'float' && family === 'bang') return this.buildBang(control);
        if (control.type === 'float' && family === 'toggle') return this.buildFloatToggle(control, values);
        if (control.type === 'float' && family === 'dropdown') return this.buildFloatDropdown(control, values);
        switch (control.type) {
            case 'float':
                return this.buildFloat(control, values);
            case 'int':
                return this.buildInt(control, values);
            case 'bool':
                return this.buildBool(control, values);
            case 'color':
                return this.buildColor(control, values);
            case 'enum':
                return this.buildEnum(control, values);
            case 'point2d':
                return this.buildPoint2d(control, values);
            case 'bang':
                return this.buildBang(control);
        }
    }

    private buildFloat(control: BlinkFloatControl, values: ControlValues): HTMLElement {
        const initial = numberValue(values, control.name, control.default);
        const bounds = resolveBounds(control.min, control.max, initial);
        const step = resolveFloatStep(control.step, bounds.min, bounds.max);

        const range = document.createElement('input');
        range.type = 'range';
        range.className = 'control-panel__range';
        range.min = String(bounds.min);
        range.max = String(bounds.max);
        range.step = String(step);
        range.value = String(initial);

        const number = document.createElement('input');
        number.type = 'number';
        number.className = 'control-panel__number';
        number.min = String(bounds.min);
        number.max = String(bounds.max);
        number.step = String(step);
        number.value = String(initial);

        const dial =
            this.family(control) === 'knob'
                ? createKnob({
                      label: control.label ?? control.name,
                      ...bounds,
                      step,
                      value: initial,
                      onChange: value => commit(String(value)),
                  })
                : null;
        const commit = (raw: string): void => {
            if (raw.trim() === '') return;
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) {
                return;
            }
            const value = Math.min(bounds.max, Math.max(bounds.min, parsed));
            range.value = String(value);
            number.value = String(value);
            dial?.setValue(value);
            this.applyControl(control.name, value);
        };

        range.addEventListener('input', () => commit(range.value));
        number.addEventListener('input', () => commit(number.value));

        const { row, labelRow } = createRow(control);
        labelRow.appendChild(
            this.buildResetButton(() => {
                range.value = String(control.default);
                number.value = String(control.default);
                dial?.setValue(control.default);
                this.resetControl(control);
            })
        );

        const widgets = document.createElement('div');
        widgets.className = 'control-panel__widgets';
        row.dataset.controlWidget = dial === null ? 'slider' : 'knob';
        if (dial === null) widgets.append(range, number);
        else widgets.append(number, dial.element);
        row.appendChild(widgets);
        return row;
    }

    private buildInt(control: BlinkIntControl, values: ControlValues): HTMLElement {
        const initial = numberValue(values, control.name, control.default);
        const bounds = resolveBounds(control.min, control.max, initial);
        const step = control.step ?? DEFAULT_INT_STEP;

        const range = document.createElement('input');
        range.type = 'range';
        range.className = 'control-panel__range';
        range.min = String(bounds.min);
        range.max = String(bounds.max);
        range.step = String(step);
        range.value = String(initial);

        const number = document.createElement('input');
        number.type = 'number';
        number.className = 'control-panel__number';
        number.min = String(bounds.min);
        number.max = String(bounds.max);
        number.step = String(step);
        number.value = String(initial);

        const commit = (raw: string): void => {
            if (raw.trim() === '') return;
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) {
                return;
            }
            const rounded = Math.min(bounds.max, Math.max(bounds.min, Math.round(parsed)));
            range.value = String(rounded);
            number.value = String(rounded);
            this.applyControl(control.name, rounded);
        };

        range.addEventListener('input', () => commit(range.value));
        number.addEventListener('input', () => commit(number.value));

        const { row, labelRow } = createRow(control);
        labelRow.appendChild(
            this.buildResetButton(() => {
                range.value = String(control.default);
                number.value = String(control.default);
                this.resetControl(control);
            })
        );

        const widgets = document.createElement('div');
        widgets.className = 'control-panel__widgets';
        widgets.append(range, number);
        row.appendChild(widgets);
        return row;
    }

    private buildBool(control: BlinkBoolControl, values: ControlValues): HTMLElement {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'control-panel__checkbox';
        checkbox.checked = boolValue(values, control.name, control.default);

        checkbox.addEventListener('change', () => {
            this.applyControl(control.name, checkbox.checked ? 1 : 0);
        });

        const { row, labelRow } = createRow(control);
        labelRow.appendChild(
            this.buildResetButton(() => {
                checkbox.checked = control.default;
                this.resetControl(control);
            })
        );
        row.appendChild(checkbox);
        return row;
    }

    private buildColor(control: BlinkColorControl, values: ControlValues): HTMLElement {
        const [defaultR, defaultG, defaultB, defaultA] = control.default;
        const [initialR, initialG, initialB, initialA] = colorValue(values, control.name, control.default);

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'control-panel__color';
        colorInput.value = rgbToHex(initialR, initialG, initialB);

        const alphaInput = document.createElement('input');
        alphaInput.type = 'range';
        alphaInput.className = 'control-panel__alpha';
        alphaInput.min = '0';
        alphaInput.max = '1';
        alphaInput.step = '0.01';
        alphaInput.value = String(initialA);

        // The picker quantizes RGB to eight bits; alpha edits must preserve the
        // source components until an RGB edit explicitly replaces them.
        let rgb: readonly [number, number, number] = [initialR, initialG, initialB];
        const commit = (): void => {
            const value: readonly [number, number, number, number] = [...rgb, Number(alphaInput.value)];
            this.applyControl(control.name, value);
        };

        colorInput.addEventListener('input', () => {
            rgb = hexToRgb(colorInput.value);
            commit();
        });
        alphaInput.addEventListener('input', commit);

        const { row, labelRow } = createRow(control);
        labelRow.appendChild(
            this.buildResetButton(() => {
                rgb = [defaultR, defaultG, defaultB];
                colorInput.value = rgbToHex(defaultR, defaultG, defaultB);
                alphaInput.value = String(defaultA);
                this.resetControl(control);
            })
        );

        const widgets = document.createElement('div');
        widgets.className = 'control-panel__widgets';
        widgets.append(colorInput);
        if (this.family(control) !== 'color') widgets.append(alphaInput);
        row.appendChild(widgets);
        return row;
    }

    private buildEnum(control: BlinkEnumControl, values: ControlValues): HTMLElement {
        const select = document.createElement('select');
        select.className = 'control-panel__select';
        for (const option of control.options) {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option;
            select.appendChild(optionElement);
        }
        select.value = enumValue(values, control.name, control.options, control.default);

        // The shader never sees the option string - only its index - per spec section 6.
        select.addEventListener('change', () => {
            this.applyControl(control.name, control.options.indexOf(select.value));
        });

        const { row, labelRow } = createRow(control);
        labelRow.appendChild(
            this.buildResetButton(() => {
                select.value = control.default;
                this.resetControl(control);
            })
        );
        row.appendChild(select);
        return row;
    }

    private buildFloatToggle(control: BlinkFloatControl, values: ControlValues): HTMLElement {
        const bounds = resolveBounds(control.min, control.max, control.default);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'control-panel__checkbox';
        checkbox.checked = numberValue(values, control.name, control.default) > (bounds.min + bounds.max) / 2;
        checkbox.addEventListener('change', () =>
            this.applyControl(control.name, checkbox.checked ? bounds.max : bounds.min)
        );
        const { row, labelRow } = createRow(control);
        row.dataset.controlWidget = 'toggle';
        labelRow.append(
            this.buildResetButton(() => {
                checkbox.checked = control.default > (bounds.min + bounds.max) / 2;
                this.resetControl(control);
            })
        );
        row.append(checkbox);
        return row;
    }

    private buildFloatDropdown(control: BlinkFloatControl, values: ControlValues): HTMLElement {
        const select = document.createElement('select');
        select.className = 'control-panel__select';
        for (const [index, label] of this.dropdownLabels(control).entries()) {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = label;
            select.append(option);
        }
        select.value = String(Math.round(numberValue(values, control.name, control.default)));
        select.addEventListener('change', () => this.applyControl(control.name, Number(select.value)));
        const { row, labelRow } = createRow(control);
        row.dataset.controlWidget = 'dropdown';
        labelRow.append(
            this.buildResetButton(() => {
                select.value = String(control.default);
                this.resetControl(control);
            })
        );
        row.append(select);
        return row;
    }

    private buildPoint2d(control: BlinkPoint2DControl, values: ControlValues): HTMLElement {
        const [defaultX, defaultY] = control.default;
        const [initialX, initialY] = point2dValue(values, control.name, control.default);
        const boundsX = resolveBounds(control.min?.[0] ?? null, control.max?.[0] ?? null, initialX);
        const boundsY = resolveBounds(control.min?.[1] ?? null, control.max?.[1] ?? null, initialY);

        const xInput = document.createElement('input');
        xInput.type = 'number';
        xInput.className = 'control-panel__point-x';
        xInput.min = String(boundsX.min);
        xInput.max = String(boundsX.max);
        xInput.value = String(Number(initialX.toFixed(4)));

        const yInput = document.createElement('input');
        yInput.type = 'number';
        yInput.className = 'control-panel__point-y';
        yInput.min = String(boundsY.min);
        yInput.max = String(boundsY.max);
        yInput.value = String(Number(initialY.toFixed(4)));

        const commit = (): void => {
            if (xInput.value === '' || yInput.value === '') return;
            const x = Number(xInput.value);
            const y = Number(yInput.value);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return;
            }
            const value: readonly [number, number] = [
                Math.min(boundsX.max, Math.max(boundsX.min, x)),
                Math.min(boundsY.max, Math.max(boundsY.min, y)),
            ];
            xInput.value = String(value[0]);
            yInput.value = String(value[1]);
            xRange.value = xInput.value;
            yRange.value = yInput.value;
            pad.setValue(...value);
            this.applyControl(control.name, value);
        };

        const axisRange = (
            name: string,
            input: HTMLInputElement,
            bounds: { min: number; max: number }
        ): HTMLInputElement => {
            const range = document.createElement('input');
            range.type = 'range';
            range.className = `control-panel__point-${name}-range`;
            range.min = String(bounds.min);
            range.max = String(bounds.max);
            range.step = String(resolveFloatStep(null, bounds.min, bounds.max));
            range.value = input.value;
            range.setAttribute('aria-label', `${control.label ?? control.name} ${name.toUpperCase()}`);
            input.step = range.step;
            input.setAttribute('aria-label', `${control.label ?? control.name} ${name.toUpperCase()}`);
            range.addEventListener('input', () => {
                input.value = range.value;
                commit();
            });
            return range;
        };
        const xRange = axisRange('x', xInput, boundsX);
        const yRange = axisRange('y', yInput, boundsY);
        const pad = createPointPad({
            label: control.label ?? control.name,
            x: boundsX,
            y: boundsY,
            value: [initialX, initialY],
            onChange: (x, y) => {
                xInput.value = String(x);
                yInput.value = String(y);
                commit();
            },
        });
        xInput.addEventListener('input', commit);
        yInput.addEventListener('input', commit);

        const { row, labelRow } = createRow(control);
        labelRow.appendChild(
            this.buildResetButton(() => {
                xInput.value = String(defaultX);
                yInput.value = String(defaultY);
                xRange.value = xInput.value;
                yRange.value = yInput.value;
                pad.setValue(defaultX, defaultY);
                this.resetControl(control);
            })
        );

        const widgets = document.createElement('div');
        widgets.className = 'control-panel__widgets';
        row.dataset.controlWidget = 'xy';
        const axes = document.createElement('div');
        axes.className = 'control-panel__xy-axes';
        axes.append(xInput, xRange, yInput, yRange);
        widgets.append(pad.element, axes);
        row.appendChild(widgets);
        return row;
    }

    /** Fires the host's event path; source counter and envelope state remain owned by the host. */
    private buildBang(control: BlinkBangControl | BlinkFloatControl): HTMLElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'control-panel__bang';
        button.textContent = BANG_LABEL;

        button.addEventListener('click', () => {
            this.applyBang(control.name);
        });

        const { row } = createRow(control);
        row.dataset.controlWidget = 'bang';
        row.appendChild(button);
        return row;
    }

    private buildResetButton(onReset: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'control-panel__reset';
        button.textContent = RESET_LABEL;
        button.title = RESET_TITLE;
        button.addEventListener('click', onReset);
        return button;
    }

    private resetControl(control: BlinkControlSpec, record = true): void {
        if (this.lockedGroups.has(control.group)) return;
        if (this.host.resetControl === undefined) {
            this.applyControl(control.name, this.defaultValue(control), record);
            return;
        }
        const previous = this.snapshot([control]);
        this.writing = true;
        try {
            this.host.resetControl(control.name);
            this.currentValues[control.name] = this.defaultValue(control);
            if (record && this.family(control) !== 'bang') this.history.push(previous);
            this.renderControls();
            this.setStatus('');
        } catch (error) {
            this.setStatus(describeError(error, `"${control.name}" konnte nicht zurückgesetzt werden.`), true);
        } finally {
            this.writing = false;
        }
    }

    private applyControl(name: string, value: UniformValue, record = true): void {
        const control = this.state?.controls.find(spec => spec.name === name);
        if (control === undefined || this.lockedGroups.has(control.group)) return;
        const previous = this.snapshot([control]);
        this.writing = true;
        try {
            this.host.setControl(name, value);
            if (record && this.family(control) !== 'bang') {
                this.history.push(previous);
                if (this.history.length > 50) this.history.shift();
            }
            this.currentValues[name] = value;
            const undo = this.toolbarElement.querySelector<HTMLButtonElement>('[data-action="undo"]');
            if (undo !== null) undo.disabled = this.history.length === 0;
            this.setStatus('');
        } catch (error) {
            this.setStatus(describeError(error, `"${name}" konnte nicht gesetzt werden.`), true);
        } finally {
            this.writing = false;
        }
    }

    // Every other widget's write goes through applyControl's try/catch; a bang has no value
    // to write but must get the same protection, or a throwing host.fireBang would escape
    // this click handler instead of reaching the status element like every other failure.
    private applyBang(name: string): void {
        const control = this.state?.controls.find(spec => spec.name === name);
        if (control === undefined || this.lockedGroups.has(control.group)) return;
        this.writing = true;
        try {
            this.host.fireBang(name);
            this.setStatus('');
        } catch (error) {
            this.setStatus(describeError(error, `"${name}" konnte nicht ausgelöst werden.`), true);
        } finally {
            this.writing = false;
        }
    }

    private setStatus(message: string, isError = false): void {
        this.statusElement.textContent = message;
        this.statusElement.classList.toggle('control-panel__status--error', isError);
    }
}
