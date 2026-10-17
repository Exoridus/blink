// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

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
} from '../../../runtime/ir/types';
import { ControlPanel } from '../ControlPanel';
import type { ShellHost, ShellRuntimeState } from '../ShellHost';

const FLOAT_CONTROL: BlinkFloatControl = {
    name: 'intensity',
    label: 'Intensität',
    description: null,
    group: 'Look',
    type: 'float',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
};

const INT_CONTROL: BlinkIntControl = {
    name: 'count',
    label: 'Anzahl',
    description: null,
    group: 'Look',
    type: 'int',
    default: 3,
    min: 0,
    max: 10,
    step: null,
};

const BOOL_CONTROL: BlinkBoolControl = {
    name: 'mirror',
    label: 'Spiegeln',
    description: null,
    group: null,
    type: 'bool',
    default: false,
};

// 0x80 / 255 is exactly representable, so hex round-trips through the widget
// without floating-point drift and toEqual can compare the sent tuple exactly.
const COLOR_CONTROL: BlinkColorControl = {
    name: 'tint',
    label: 'Farbton',
    description: null,
    group: 'Look',
    type: 'color',
    default: [0, 128 / 255, 1, 0.75],
};

const ENUM_CONTROL: BlinkEnumControl = {
    name: 'mode',
    label: 'Modus',
    description: null,
    group: null,
    type: 'enum',
    default: 'wave',
    options: ['wave', 'pulse', 'noise'],
};

const POINT_CONTROL: BlinkPoint2DControl = {
    name: 'center',
    label: 'Zentrum',
    description: null,
    group: 'Position',
    type: 'point2d',
    default: [0.5, 0.5],
    min: [0, 0],
    max: [1, 1],
};

const BANG_CONTROL: BlinkBangControl = {
    name: 'trigger',
    label: 'Auslösen',
    description: null,
    group: null,
    type: 'bang',
};

const ALL_CONTROLS: BlinkControlSpec[] = [
    FLOAT_CONTROL,
    INT_CONTROL,
    BOOL_CONTROL,
    COLOR_CONTROL,
    ENUM_CONTROL,
    POINT_CONTROL,
    BANG_CONTROL,
];

const SUNRISE_PRESET: BlinkPresetRef = { name: 'Sonnenaufgang', path: '/effects/demo/presets/sunrise.json' };
const STORM_PRESET: BlinkPresetRef = { name: 'Sturm', path: '/effects/demo/presets/storm.json' };
const ALL_PRESETS: BlinkPresetRef[] = [SUNRISE_PRESET, STORM_PRESET];

interface FakeHost extends ShellHost {
    pushState(state: ShellRuntimeState): void;
    stateListenerCount(): number;
}

function createHost(
    overrides: Partial<ShellHost> = {},
    initialState: ShellRuntimeState = {
        activeEffectId: null,
        controls: ALL_CONTROLS,
        presets: [],
        controlValues: {},
        compatibility: null,
    }
): FakeHost {
    const listeners = new Set<(state: ShellRuntimeState) => void>();
    let state = initialState;

    function pushState(next: ShellRuntimeState): void {
        state = next;
        for (const listener of listeners) {
            listener(next);
        }
    }

    const base: FakeHost = {
        listEffects: vi.fn().mockResolvedValue([]),
        subscribeState: vi.fn((listener: (state: ShellRuntimeState) => void) => {
            listeners.add(listener);
            listener(state);
            return () => listeners.delete(listener);
        }),
        subscribeDiagnostics: vi.fn().mockReturnValue(() => undefined),
        switchEffect: vi.fn().mockResolvedValue(undefined),
        setControl: vi.fn(),
        // Honest fake: resolves for a preset the current state actually ships, rejects
        // for anything else - mirroring the real contract instead of always succeeding.
        applyPreset: vi.fn((name: string) => {
            if (state.presets.some(preset => preset.name === name)) {
                return Promise.resolve();
            }
            return Promise.reject(new Error(`unknown preset "${name}"`));
        }),
        fireBang: vi.fn(),
        installPackage: vi.fn(),
        removePackage: vi.fn(),
        pushState,
        stateListenerCount: () => listeners.size,
    };

    return { ...base, ...overrides } as FakeHost;
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function stateWithPresets(presets: readonly BlinkPresetRef[]): ShellRuntimeState {
    return { activeEffectId: null, controls: ALL_CONTROLS, presets, controlValues: {}, compatibility: null };
}

function stateWithValues(controlValues: Record<string, number | Float32Array>): ShellRuntimeState {
    return { activeEffectId: null, controls: ALL_CONTROLS, presets: [], controlValues };
}

// Mirrors ControlPanel's own rgbToHex conversion, so a test can compute the hex string a
// color widget is expected to show without depending on the panel's internals directly.
function expectedHex(r: number, g: number, b: number): string {
    const toByte = (component: number): string =>
        Math.round(Math.min(1, Math.max(0, component)) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function mount(host: ShellHost): { parent: HTMLElement; panel: ControlPanel } {
    const panel = new ControlPanel(host);
    const parent = document.createElement('div');
    panel.mount(parent);
    return { parent, panel };
}

function row(parent: HTMLElement, name: string): HTMLElement {
    const element = parent.querySelector<HTMLElement>(`[data-control-name="${name}"]`);
    if (element === null) {
        throw new Error(`no control row for "${name}"`);
    }
    return element;
}

describe('ControlPanel', () => {
    it('starts collapsed on first mount', () => {
        const { parent } = mount(createHost());
        const root = parent.querySelector('.shell-overlay');
        expect(root?.classList.contains('shell-overlay--collapsed')).toBe(true);
    });

    it('renders a widget for every control type', () => {
        const { parent } = mount(createHost());
        for (const control of ALL_CONTROLS) {
            const element = row(parent, control.name);
            expect(element.dataset.controlType).toBe(control.type);
        }
    });

    it('groups controls by their group, collecting ungrouped controls together', () => {
        const { parent } = mount(createHost());
        const groups = [...parent.querySelectorAll<HTMLElement>('.control-panel__group')];

        const look = groups.find(g => g.querySelector('.control-panel__group-title')?.textContent === 'Look');
        expect(look).toBeDefined();
        expect(look?.querySelectorAll('[data-control-name]').length).toBe(3);

        const position = groups.find(g => g.querySelector('.control-panel__group-title')?.textContent === 'Position');
        expect(position?.querySelectorAll('[data-control-name]').length).toBe(1);

        const ungrouped = groups.find(g => g.querySelector('.control-panel__group-title') === null);
        expect(ungrouped).toBeDefined();
        expect(ungrouped?.querySelectorAll('[data-control-name]').length).toBe(3);
    });

    it('sends a number to host.setControl when a float control changes', () => {
        const setControl = vi.fn();
        const { parent } = mount(createHost({ setControl }));

        const range = row(parent, 'intensity').querySelector<HTMLInputElement>('input[type="range"]')!;
        range.value = '0.75';
        range.dispatchEvent(new Event('input'));

        expect(setControl).toHaveBeenCalledWith('intensity', 0.75);
    });

    it('keeps the float range and number readout in sync', () => {
        const setControl = vi.fn();
        const { parent } = mount(createHost({ setControl }));
        const controlRow = row(parent, 'intensity');

        const number = controlRow.querySelector<HTMLInputElement>('input[type="number"]')!;
        number.value = '0.2';
        number.dispatchEvent(new Event('input'));

        const range = controlRow.querySelector<HTMLInputElement>('input[type="range"]')!;
        expect(range.value).toBe('0.2');
        expect(setControl).toHaveBeenCalledWith('intensity', 0.2);
    });

    it('sends a whole number to host.setControl when an int control changes', () => {
        const setControl = vi.fn();
        const { parent } = mount(createHost({ setControl }));

        const range = row(parent, 'count').querySelector<HTMLInputElement>('input[type="range"]')!;
        range.value = '7';
        range.dispatchEvent(new Event('input'));

        expect(setControl).toHaveBeenCalledWith('count', 7);
    });

    it('defaults an int control step to 1 when the manifest leaves it null', () => {
        const { parent } = mount(createHost());
        const range = row(parent, 'count').querySelector<HTMLInputElement>('input[type="range"]')!;
        expect(range.step).toBe('1');
    });

    it('sends 1 or 0, not a boolean, when a bool control is toggled', () => {
        const setControl = vi.fn();
        const { parent } = mount(createHost({ setControl }));
        const checkbox = row(parent, 'mirror').querySelector<HTMLInputElement>('input[type="checkbox"]')!;

        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        expect(setControl).toHaveBeenCalledWith('mirror', 1);

        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        expect(setControl).toHaveBeenCalledWith('mirror', 0);
    });

    it('sends all four color components, preserving alpha on an RGB-only change', () => {
        const setControl = vi.fn();
        const { parent } = mount(createHost({ setControl }));
        const colorInput = row(parent, 'tint').querySelector<HTMLInputElement>('input[type="color"]')!;

        colorInput.value = '#ff8000';
        colorInput.dispatchEvent(new Event('input'));

        expect(setControl).toHaveBeenCalledWith('tint', [1, 128 / 255, 0, 0.75]);
    });

    it('sends all four color components, preserving RGB on an alpha-only change', () => {
        const setControl = vi.fn();
        const { parent } = mount(createHost({ setControl }));
        const alphaInput = row(parent, 'tint').querySelector<HTMLInputElement>('input[type="range"]')!;

        alphaInput.value = '0.2';
        alphaInput.dispatchEvent(new Event('input'));

        expect(setControl).toHaveBeenCalledWith('tint', [0, 128 / 255, 1, 0.2]);
    });

    it('preserves unquantized RGB components when only alpha changes', () => {
        const setControl = vi.fn();
        const control = { ...COLOR_CONTROL, default: [0.2, 0.7, 1, 0.55] as const };
        const { parent } = mount(
            createHost(
                { setControl },
                {
                    activeEffectId: 'color',
                    controls: [control],
                    presets: [],
                    controlValues: {},
                }
            )
        );
        const alphaInput = row(parent, 'tint').querySelector<HTMLInputElement>('input[type=range]')!;
        alphaInput.value = '0.25';
        alphaInput.dispatchEvent(new Event('input'));
        expect(setControl).toHaveBeenCalledWith('tint', [0.2, 0.7, 1, 0.25]);
    });

    it('sends the option index, not the option string, when an enum control changes', () => {
        const setControl = vi.fn();
        const { parent } = mount(createHost({ setControl }));
        const select = row(parent, 'mode').querySelector<HTMLSelectElement>('select')!;

        select.value = 'noise';
        select.dispatchEvent(new Event('change'));

        expect(setControl).toHaveBeenCalledWith('mode', 2);
        expect(setControl).not.toHaveBeenCalledWith('mode', 'noise');
    });

    it('sends both axes as a pair when a point2d control changes', () => {
        const setControl = vi.fn();
        const { parent } = mount(createHost({ setControl }));
        const controlRow = row(parent, 'center');

        const xInput = controlRow.querySelector<HTMLInputElement>('.control-panel__point-x')!;
        xInput.value = '0.25';
        xInput.dispatchEvent(new Event('input'));

        expect(setControl).toHaveBeenCalledWith('center', [0.25, 0.5]);
    });

    it('fires a bang through host.fireBang, never host.setControl, holding no value and offering no reset', () => {
        const setControl = vi.fn();
        const fireBang = vi.fn();
        const { parent } = mount(createHost({ setControl, fireBang }));
        const controlRow = row(parent, 'trigger');

        expect(controlRow.querySelector('.control-panel__reset')).toBeNull();

        const button = controlRow.querySelector<HTMLButtonElement>('button')!;
        button.click();
        button.click();

        expect(fireBang).toHaveBeenCalledTimes(2);
        expect(fireBang).toHaveBeenNthCalledWith(1, 'trigger');
        expect(fireBang).toHaveBeenNthCalledWith(2, 'trigger');
        expect(setControl).not.toHaveBeenCalledWith('trigger', expect.anything());
        expect(button.hasAttribute('value')).toBe(false);
    });

    it('shows a failure inline when host.fireBang throws, instead of letting it escape the click handler', () => {
        const fireBang = vi.fn<(name: string) => void>(() => {
            throw new Error('bang rejected');
        });
        const { parent } = mount(createHost({ fireBang }));
        const controlRow = row(parent, 'trigger');
        const button = controlRow.querySelector<HTMLButtonElement>('button')!;

        expect(() => button.click()).not.toThrow();

        const status = parent.querySelector('.control-panel__status');
        expect(status?.textContent).toContain('bang rejected');

        // the panel is not stuck: a later click still reaches the host
        fireBang.mockImplementationOnce(() => undefined);
        expect(() => button.click()).not.toThrow();
        expect(fireBang).toHaveBeenCalledTimes(2);
    });

    it('resets a control to its default and notifies the host', () => {
        const setControl = vi.fn();
        const { parent } = mount(createHost({ setControl }));
        const controlRow = row(parent, 'intensity');
        const range = controlRow.querySelector<HTMLInputElement>('input[type="range"]')!;

        range.value = '0.9';
        range.dispatchEvent(new Event('input'));
        setControl.mockClear();

        controlRow.querySelector<HTMLButtonElement>('.control-panel__reset')!.click();

        expect(range.value).toBe('0.5');
        expect(setControl).toHaveBeenCalledWith('intensity', 0.5);
    });

    it('rebuilds every widget from scratch when a new state is pushed after an effect switch', () => {
        const host = createHost();
        const { parent } = mount(host);
        expect(parent.querySelector('[data-control-name="intensity"]')).not.toBeNull();

        const otherEffectControl: BlinkBoolControl = {
            name: 'onlyInNewEffect',
            label: null,
            description: null,
            group: null,
            type: 'bool',
            default: true,
        };
        host.pushState({
            activeEffectId: 'other-effect',
            controls: [otherEffectControl],
            presets: [],
            controlValues: {},
        });

        expect(parent.querySelector('[data-control-name="intensity"]')).toBeNull();
        expect(parent.querySelector('[data-control-name="onlyInNewEffect"]')).not.toBeNull();
    });

    it('unsubscribes from state when unmounted', () => {
        const host = createHost();
        const { panel } = mount(host);
        expect(host.stateListenerCount()).toBe(1);

        panel.unmount();

        expect(host.stateListenerCount()).toBe(0);
    });

    it('shows a message and renders no groups when the effect declares no controls', () => {
        const { parent } = mount(
            createHost({}, { activeEffectId: null, controls: [], presets: [], controlValues: {}, compatibility: null })
        );

        expect(parent.querySelectorAll('.control-panel__group').length).toBe(0);
        const status = parent.querySelector('.control-panel__status');
        expect(status?.textContent?.length).toBeGreaterThan(0);
    });

    it('surfaces a setControl rejection of an unknown control inline instead of throwing', () => {
        const setControl = vi.fn(() => {
            throw new Error('unknown control "intensity"');
        });
        const { parent } = mount(createHost({ setControl }));
        const range = row(parent, 'intensity').querySelector<HTMLInputElement>('input[type="range"]')!;

        expect(() => {
            range.value = '0.9';
            range.dispatchEvent(new Event('input'));
        }).not.toThrow();

        const status = parent.querySelector('.control-panel__status');
        expect(status?.textContent).toContain('unknown control "intensity"');
        expect(status?.classList.contains('control-panel__status--error')).toBe(true);
    });

    it('degrades a null min/max to a range that still contains the default', () => {
        const unbounded: BlinkFloatControl = {
            name: 'freeFloat',
            label: null,
            description: null,
            group: null,
            type: 'float',
            default: 42,
            min: null,
            max: null,
            step: null,
        };
        const { parent } = mount(
            createHost(
                {},
                { activeEffectId: null, controls: [unbounded], presets: [], controlValues: {}, compatibility: null }
            )
        );
        const range = row(parent, 'freeFloat').querySelector<HTMLInputElement>('input[type="range"]')!;

        expect(Number(range.min)).toBeLessThanOrEqual(42);
        expect(Number(range.max)).toBeGreaterThanOrEqual(42);
    });

    describe('presets', () => {
        it('renders no preset selector when the effect ships no presets', () => {
            const { parent } = mount(createHost({}, stateWithPresets([])));

            expect(parent.querySelector('.control-panel__preset-select')).toBeNull();
            expect(parent.querySelector('.control-panel__preset-apply')).toBeNull();
        });

        it('renders one option per preset, in manifest order', () => {
            const { parent } = mount(createHost({}, stateWithPresets(ALL_PRESETS)));

            const select = parent.querySelector<HTMLSelectElement>('.control-panel__preset-select')!;
            const options = [...select.options].map(option => option.value);
            expect(options).toEqual([SUNRISE_PRESET.name, STORM_PRESET.name]);
        });

        it('calls host.applyPreset with the selected preset name when applied', async () => {
            const applyPreset = vi.fn().mockResolvedValue(undefined);
            const { parent } = mount(createHost({ applyPreset }, stateWithPresets(ALL_PRESETS)));

            const select = parent.querySelector<HTMLSelectElement>('.control-panel__preset-select')!;
            select.value = STORM_PRESET.name;
            select.dispatchEvent(new Event('change'));

            parent.querySelector<HTMLButtonElement>('.control-panel__preset-apply')!.click();
            await flush();

            expect(applyPreset).toHaveBeenCalledWith(STORM_PRESET.name);
        });

        it('disables the selector and apply button while an application is in flight, and ignores a second click', async () => {
            let resolveApply: (() => void) | undefined;
            const applyPreset = vi.fn(() => new Promise<void>(resolve => (resolveApply = resolve)));
            const { parent } = mount(createHost({ applyPreset }, stateWithPresets(ALL_PRESETS)));

            const select = parent.querySelector<HTMLSelectElement>('.control-panel__preset-select')!;
            const button = parent.querySelector<HTMLButtonElement>('.control-panel__preset-apply')!;

            button.click();
            button.click();

            expect(select.disabled).toBe(true);
            expect(button.disabled).toBe(true);
            expect(applyPreset).toHaveBeenCalledTimes(1);

            resolveApply?.();
            await flush();

            expect(select.disabled).toBe(false);
            expect(button.disabled).toBe(false);
        });

        it('shows a rejection in the status line and re-enables the control', async () => {
            const applyPreset = vi.fn().mockRejectedValue(new Error('preset failed validation'));
            const { parent } = mount(createHost({ applyPreset }, stateWithPresets(ALL_PRESETS)));

            const select = parent.querySelector<HTMLSelectElement>('.control-panel__preset-select')!;
            const button = parent.querySelector<HTMLButtonElement>('.control-panel__preset-apply')!;

            button.click();
            await flush();

            const status = parent.querySelector('.control-panel__status');
            expect(status?.textContent).toContain('preset failed validation');
            expect(status?.classList.contains('control-panel__status--error')).toBe(true);
            expect(select.disabled).toBe(false);
            expect(button.disabled).toBe(false);
        });

        it('clears the status line on a successful apply', async () => {
            const { parent } = mount(createHost({}, stateWithPresets(ALL_PRESETS)));

            parent.querySelector<HTMLButtonElement>('.control-panel__preset-apply')!.click();
            await flush();

            const status = parent.querySelector('.control-panel__status');
            expect(status?.textContent).toBe('');
        });

        it('rebuilds the preset selector from each pushed state', () => {
            const host = createHost({}, stateWithPresets([SUNRISE_PRESET]));
            const { parent } = mount(host);

            let select = parent.querySelector<HTMLSelectElement>('.control-panel__preset-select')!;
            expect([...select.options].map(option => option.value)).toEqual([SUNRISE_PRESET.name]);

            host.pushState(stateWithPresets([]));
            expect(parent.querySelector('.control-panel__preset-select')).toBeNull();

            host.pushState(stateWithPresets(ALL_PRESETS));
            select = parent.querySelector<HTMLSelectElement>('.control-panel__preset-select')!;
            expect([...select.options].map(option => option.value)).toEqual([SUNRISE_PRESET.name, STORM_PRESET.name]);
        });
    });

    describe('control values', () => {
        it('initialises every widget type from the pushed controlValues, converting the render-side encoding', () => {
            const { parent } = mount(
                createHost(
                    {},
                    stateWithValues({
                        intensity: 0.9, // float: plain number
                        count: 7, // int: plain number
                        mirror: 1, // bool: 0/1
                        tint: new Float32Array([1, 0, 0.5, 0.25]), // color: packed rgba
                        mode: 2, // enum: option index
                        center: new Float32Array([0.25, 0.75]), // point2d: packed xy
                    })
                )
            );

            const intensityRow = row(parent, 'intensity');
            expect(intensityRow.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe('0.9');
            expect(intensityRow.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('0.9');

            expect(row(parent, 'count').querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe('7');

            expect(row(parent, 'mirror').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);

            const tintRow = row(parent, 'tint');
            expect(tintRow.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe('#ff0080');
            expect(tintRow.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe('0.25');

            expect(row(parent, 'mode').querySelector<HTMLSelectElement>('select')!.value).toBe('noise');

            const centerRow = row(parent, 'center');
            expect(centerRow.querySelector<HTMLInputElement>('.control-panel__point-x')!.value).toBe('0.25');
            expect(centerRow.querySelector<HTMLInputElement>('.control-panel__point-y')!.value).toBe('0.75');
        });

        it("falls back to the control's declared default when its name is missing from controlValues", () => {
            const { parent } = mount(createHost({}, stateWithValues({ intensity: 0.9 })));

            expect(row(parent, 'intensity').querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe('0.9');
            expect(row(parent, 'mirror').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(
                BOOL_CONTROL.default
            );
            expect(row(parent, 'mode').querySelector<HTMLSelectElement>('select')!.value).toBe(ENUM_CONTROL.default);

            const [defaultR, defaultG, defaultB, defaultA] = COLOR_CONTROL.default;
            const tintRow = row(parent, 'tint');
            expect(tintRow.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe(
                expectedHex(defaultR, defaultG, defaultB)
            );
            expect(tintRow.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe(String(defaultA));

            const [defaultX, defaultY] = POINT_CONTROL.default;
            const centerRow = row(parent, 'center');
            expect(centerRow.querySelector<HTMLInputElement>('.control-panel__point-x')!.value).toBe(String(defaultX));
            expect(centerRow.querySelector<HTMLInputElement>('.control-panel__point-y')!.value).toBe(String(defaultY));
        });

        it("shows the new effect's values after an effect switch, not the previous effect's", () => {
            const host = createHost(
                {},
                {
                    activeEffectId: 'alpha',
                    controls: [BOOL_CONTROL],
                    presets: [],
                    controlValues: {},
                    compatibility: null,
                }
            );
            const { parent } = mount(host);
            expect(row(parent, 'mirror').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(
                BOOL_CONTROL.default
            );

            host.pushState({
                activeEffectId: 'beta',
                controls: [BOOL_CONTROL],
                presets: [],
                controlValues: { mirror: 1 },
            });

            expect(row(parent, 'mirror').querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
        });
    });
});

describe('control surface source widgets', () => {
    function sourceState(
        controls: readonly BlinkControlSpec[],
        controlSources: Readonly<Record<string, object>>,
        controlValues = {}
    ): ShellRuntimeState {
        return { activeEffectId: 'demo', controls, presets: [], controlValues, controlSources };
    }

    it('renders a draggable, keyboard accessible knob from generic knob presentation metadata', () => {
        const writes: number[] = [];
        const { parent } = mount(
            createHost(
                {
                    setControl: (_, value) => {
                        writes.push(value as number);
                    },
                },
                sourceState([FLOAT_CONTROL], { intensity: { type: 'knob smooth' } })
            )
        );
        const knob = row(parent, 'intensity').querySelector<HTMLElement>('.control-panel__knob')!;
        expect(knob).not.toBeNull();
        expect(knob.getAttribute('role')).toBe('slider');
        expect(knob.getAttribute('aria-label')).toBe('Intensität');
        knob.dispatchEvent(new MouseEvent('pointerdown', { clientY: 100, button: 0 }));
        knob.dispatchEvent(new MouseEvent('pointermove', { clientY: 40 }));
        knob.dispatchEvent(new MouseEvent('pointerup'));
        expect(writes.at(-1)).toBeCloseTo(0.9);
        expect(row(parent, 'intensity').querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('0.9');
        knob.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(writes.at(-1)).toBe(0);
        knob.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(writes.at(-1)).toBe(0.01);
    });

    it('renders float toggle endpoints as a tall switch instead of treating them as bool encodings', () => {
        const writes: number[] = [];
        const bipolar = { ...FLOAT_CONTROL, name: 'bipolar', min: -1, max: 1, default: -1 };
        const { parent } = mount(
            createHost(
                {
                    setControl: (_, value) => {
                        writes.push(value as number);
                    },
                },
                sourceState([bipolar], { bipolar: { type: 'toggle smooth' } })
            )
        );
        const checkbox = row(parent, 'bipolar').querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        expect(checkbox).not.toBeNull();
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        expect(writes).toEqual([1, -1]);
    });

    it('routes float bang and counter families through the momentary host API', () => {
        const fired: string[] = [];
        const writes: unknown[] = [];
        const { parent } = mount(
            createHost(
                {
                    fireBang: name => {
                        fired.push(name);
                    },
                    setControl: (_, value) => {
                        writes.push(value);
                    },
                },
                sourceState([FLOAT_CONTROL], { intensity: { type: 'bang counter smooth' } })
            )
        );
        const bang = row(parent, 'intensity').querySelector<HTMLButtonElement>('.control-panel__bang')!;
        expect(bang).not.toBeNull();
        bang.click();
        expect(fired).toEqual(['intensity']);
        expect(writes).toEqual([]);
    });

    it('shows dropdown labels and sends their index rather than the mapped shader value', () => {
        const writes: number[] = [];
        const { parent } = mount(
            createHost(
                {
                    setControl: (_, value) => {
                        writes.push(value as number);
                    },
                },
                sourceState([{ ...FLOAT_CONTROL, default: 1, max: 2 }], {
                    intensity: { type: 'dropdown', labels: ['Low', 'Medium', 'High'], values: [0.1, 0.5, 1] },
                })
            )
        );
        const select = row(parent, 'intensity').querySelector<HTMLSelectElement>('select')!;
        expect(select).not.toBeNull();
        expect([...select.options].map(option => option.textContent)).toEqual(['Low', 'Medium', 'High']);
        expect(select.value).toBe('1');
        select.value = '2';
        select.dispatchEvent(new Event('change'));
        expect(writes).toEqual([2]);
    });

    it('hides alpha for source RGB colors while preserving native RGBA behavior', () => {
        const writes: unknown[] = [];
        const { parent } = mount(
            createHost(
                {
                    setControl: (_, value) => {
                        writes.push(value);
                    },
                },
                sourceState([COLOR_CONTROL], { tint: { type: 'color smooth' } })
            )
        );
        expect(row(parent, 'tint').querySelector('.control-panel__alpha')).toBeNull();
        const color = row(parent, 'tint').querySelector<HTMLInputElement>('input[type="color"]')!;
        color.value = '#ff0000';
        color.dispatchEvent(new Event('input'));
        expect(writes).toEqual([[1, 0, 0, 0.75]]);
    });

    it('drags an XY pad within independent axis bounds and keeps its numeric and range inputs synchronized', () => {
        const writes: unknown[] = [];
        const point = { ...POINT_CONTROL, min: [-1, -2] as const, max: [1, 2] as const, default: [0, 0] as const };
        const { parent } = mount(
            createHost(
                {
                    setControl: (_, value) => {
                        writes.push(value);
                    },
                },
                sourceState([point], {})
            )
        );
        const pad = row(parent, 'center').querySelector<HTMLElement>('.control-panel__xy-pad')!;
        expect(pad).not.toBeNull();
        pad.getBoundingClientRect = (): DOMRect => ({
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            right: 100,
            bottom: 100,
            x: 0,
            y: 0,
            toJSON: (): object => ({}),
        });
        pad.dispatchEvent(new MouseEvent('pointerdown', { clientX: 150, clientY: -20, button: 0 }));
        pad.dispatchEvent(new MouseEvent('pointerup'));
        expect(writes.at(-1)).toEqual([1, 2]);
        expect(row(parent, 'center').querySelector<HTMLInputElement>('.control-panel__point-x')?.value).toBe('1');
        expect(row(parent, 'center').querySelector<HTMLInputElement>('.control-panel__point-y-range')?.value).toBe('2');
        pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect((writes.at(-1) as number[])[0]).toBeCloseTo(0.98);
    });

    it('honors group locks for direct edits and global reset, then undoes unlocked edits', () => {
        const second = { ...FLOAT_CONTROL, name: 'other', group: 'Other', default: 0.25 };
        const writes = new Map<string, unknown>();
        const host = createHost(
            {
                setControl: (name, value) => {
                    writes.set(name, value);
                },
            },
            sourceState([FLOAT_CONTROL, second], {}, { intensity: 0.9, other: 0.75 })
        );
        const { parent } = mount(host);
        const lock = parent.querySelector<HTMLButtonElement>('[data-control-group="Look"] [data-action="lock"]')!;
        expect(lock).not.toBeNull();
        lock.click();
        const locked = row(parent, 'intensity').querySelector<HTMLInputElement>('input[type="range"]')!;
        expect(locked.disabled).toBe(true);
        locked.value = '0.1';
        locked.dispatchEvent(new Event('input'));
        expect(writes.has('intensity')).toBe(false);
        parent.querySelector<HTMLButtonElement>('.control-panel__toolbar [data-action="reset"]')!.click();
        expect(writes.get('other')).toBe(0.25);
        expect(writes.has('intensity')).toBe(false);
        parent.querySelector<HTMLButtonElement>('.control-panel__toolbar [data-action="undo"]')!.click();
        expect(writes.get('other')).toBe(0.75);
        host.pushState({ ...sourceState([FLOAT_CONTROL, second], {}), activeEffectId: 'next' });
        expect(row(parent, 'intensity').querySelector<HTMLInputElement>('input[type="range"]')!.disabled).toBe(false);
    });

    it('randomizes within bounds and preserves discrete dropdown and toggle choices', () => {
        const writes = new Map<string, unknown>();
        const controls = [
            FLOAT_CONTROL,
            { ...FLOAT_CONTROL, name: 'toggle', min: -1, max: 1 },
            { ...FLOAT_CONTROL, name: 'drop', max: 2 },
        ];
        const { parent } = mount(
            createHost(
                {
                    setControl: (name, value) => {
                        writes.set(name, value);
                    },
                },
                sourceState(controls, {
                    toggle: { type: 'toggle' },
                    drop: { type: 'dropdown', labels: ['A', 'B', 'C'] },
                })
            )
        );
        parent.querySelector<HTMLButtonElement>('.control-panel__toolbar [data-action="randomize"]')!.click();
        expect(writes.get('intensity')).toBeGreaterThanOrEqual(0);
        expect(writes.get('intensity')).toBeLessThanOrEqual(1);
        expect([-1, 1]).toContain(writes.get('toggle'));
        expect([0, 1, 2]).toContain(writes.get('drop'));
    });
});

describe('control surface reset lifecycle', () => {
    it('uses the host reset hook for individual and group defaults instead of only writing raw values', () => {
        const resets: string[] = [];
        const writes: string[] = [];
        const host = createHost({
            resetControl: name => {
                resets.push(name);
            },
            setControl: name => {
                writes.push(name);
            },
        });
        const { parent } = mount(host);
        row(parent, 'intensity').querySelector<HTMLButtonElement>('.control-panel__reset')!.click();
        expect(resets).toEqual(['intensity']);
        expect(writes).toEqual([]);
        parent.querySelector<HTMLButtonElement>('[data-control-group="Position"] [data-action="reset"]')!.click();
        expect(resets).toEqual(['intensity', 'center']);
    });

    it('keeps UI undo across the host state push caused by a reset', () => {
        const writes: number[] = [];
        const state: ShellRuntimeState = {
            activeEffectId: 'demo',
            controls: [FLOAT_CONTROL],
            presets: [],
            controlValues: { intensity: 0.9 },
        };
        const host = createHost(
            {
                setControl: (_, value) => {
                    writes.push(value as number);
                },
                resetControl: () => {
                    host.pushState({ ...state, controlValues: { intensity: 0.5 } });
                },
            },
            state
        );
        const { parent } = mount(host);
        parent.querySelector<HTMLButtonElement>('.control-panel__toolbar [data-action="reset"]')!.click();
        parent.querySelector<HTMLButtonElement>('.control-panel__toolbar [data-action="undo"]')!.click();
        expect(writes).toEqual([0.9]);
    });
});

describe('control gestures and undo ownership', () => {
    it('ignores another pointer while an XY drag owns the pad', () => {
        const writes: unknown[] = [];
        const { parent } = mount(
            createHost({
                setControl: (_, value) => {
                    writes.push(value);
                },
            })
        );
        const pad = row(parent, 'center').querySelector<HTMLElement>('.control-panel__xy-pad')!;
        pad.getBoundingClientRect = (): DOMRect => ({
            left: 0,
            top: 0,
            width: 100,
            height: 100,
            right: 100,
            bottom: 100,
            x: 0,
            y: 0,
            toJSON: (): object => ({}),
        });
        const pointer = (type: string, id: number, x: number, y: number): MouseEvent => {
            const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0 });
            Object.defineProperty(event, 'pointerId', { value: id });
            return event;
        };
        pad.dispatchEvent(pointer('pointerdown', 1, 50, 50));
        pad.dispatchEvent(pointer('pointermove', 2, 100, 0));
        expect(writes).toEqual([[0.5, 0.5]]);
        pad.dispatchEvent(pointer('pointermove', 1, 100, 0));
        expect(writes.at(-1)).toEqual([1, 1]);
    });

    it('keeps raw-setting undo after a bang pushes updated runtime state', () => {
        const writes: number[] = [];
        const values = { intensity: 0.5 };
        const state: ShellRuntimeState = {
            activeEffectId: 'demo',
            controls: [FLOAT_CONTROL, BANG_CONTROL],
            presets: [],
            controlValues: values,
        };
        const host = createHost(
            {
                setControl: (_, value) => {
                    values.intensity = value as number;
                    writes.push(value as number);
                },
                fireBang: () => host.pushState({ ...state, controlValues: { ...values } }),
            },
            state
        );
        const { parent } = mount(host);
        const input = row(parent, 'intensity').querySelector<HTMLInputElement>('input[type=number]')!;
        input.value = '0.7';
        input.dispatchEvent(new Event('input'));
        row(parent, 'trigger').querySelector<HTMLButtonElement>('.control-panel__bang')!.click();
        parent.querySelector<HTMLButtonElement>('.control-panel__toolbar [data-action=undo]')!.click();
        expect(writes).toEqual([0.7, 0.5]);
    });
});
