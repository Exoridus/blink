import type { BlinkControlSpec } from '../../../runtime/ir/types';
import type { BlinkScriptControlValue, ScriptControlSurface, ScriptFrameResult } from '../../../runtime/script/types';
import { topLevelDeclarations } from './topLevelDeclarations';

/**
 * Runs the `script.js` of a converted Synesthesia scene: the `ssf/1` script ABI.
 *
 * The script is evaluated once per effect instance in a persistent scope. Top-level state
 * survives between frames; optional `setup()` runs once and `update(dt)` once per frame, before
 * the frame's passes draw. Frame values (audio, time, controls) are readable as bare globals and
 * through the legacy `inputs` object, and the script writes shader uniforms through
 * `setUniform(...)` or `uniforms.name = ...` and control values through the `setControl` family.
 *
 * The optional native lifecycle reproduces startup and callback ordering using the modern host VM;
 * it does not emulate Duktape language semantics.
 * It runs on the host's main thread, which the ABI permits; a script that never returns hangs the
 * frame and nothing here can stop it. Package scripts are untrusted content, and this scope
 * hides the page's globals from honest scripts but is not a security boundary.
 */

export type SsfUniformValue = number | Float32Array;

/** What the host hands the script each frame. */
export interface SsfFrameInput {
    /** Seconds since the previous frame. */
    readonly dt: number;
    /** Frame-wide values by name: audio scalars, time, and every control's shader-visible value. */
    readonly values: ReadonlyMap<string, SsfUniformValue>;
}

export interface SsfScriptOptions {
    readonly source: string;
    /** Reproduces native startup and event ordering in the host's modern JavaScript VM. */
    readonly nativeLifecycle?: boolean;
    readonly readFinalPass?: (x: number, y: number) => readonly [number, number, number];
    readonly controls: readonly BlinkControlSpec[];
    /** Raw control values, the same ones presets and the control panel write. */
    readonly surface: ScriptControlSurface;
    /** GLSL types of the uniforms the package declared for the script, by name. */
    readonly declaredUniforms?: Readonly<Record<string, string>>;
    readonly log?: (message: string) => void;
    /** Clock in milliseconds, for log rate limiting. */
    readonly now?: () => number;
}

type Handler = (current: number, previous: number) => void;
type EventKind = 'change' | 'offToOn' | 'onToOff' | 'whileOn' | 'whileOff';

interface Registration {
    readonly kind: EventKind;
    readonly target: string;
    readonly handler: Handler | string;
    previous: number;
}

interface ScriptModule {
    setup?: () => void;
    update?: (dt: number) => void;
    resolve?: (name: string) => unknown;
    publish?: (name: string, value: unknown) => void;
}

interface SsfScriptHost {
    init(initialValues?: ReadonlyMap<string, SsfUniformValue>): void;
    step(frame: SsfFrameInput): ScriptFrameResult;
    uniforms(): Record<string, SsfUniformValue>;
    dispose(): void;
}

/** Keeps the realm bootstrap independent of imported runtime values and bundler helper closures. */
function createRuntimeClass(
    declareNames: (source: string) => Set<string>
): new (options: SsfScriptOptions) => SsfScriptHost {
    const topLevelDeclarations = declareNames;
    /** Names the script must not reach by a bare identifier. */
    const HIDDEN_GLOBALS = new Set([
        'window',
        'document',
        'self',
        'globalThis',
        'top',
        'parent',
        'frames',
        'fetch',
        'XMLHttpRequest',
        'WebSocket',
        'EventSource',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'importScripts',
        'postMessage',
        'navigator',
        'location',
        'Worker',
        'SharedWorker',
        'eval',
        'Function',
        'require',
        'process',
        'import',
    ]);

    const MAX_CONSECUTIVE_FAILURES = 10;
    const LOG_BURST = 40;
    const LOG_PER_SECOND = 20;
    const VECTOR_SIZES: Readonly<Record<string, number>> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };

    /** Control names compare case-insensitively with everything but letters and digits removed. */
    function normalizeName(name: string): string {
        return name.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
    }

    function componentsOf(value: BlinkScriptControlValue): number[] {
        return typeof value === 'number' ? [value] : [...value];
    }

    /** An array that also answers to `.x/.y/.z/.w`, the way vector uniforms read in a shader. */
    function vectorView(value: ArrayLike<number>): number[] & { x?: number; y?: number; z?: number; w?: number } {
        const view: number[] & { x?: number; y?: number; z?: number; w?: number } = Array.from(value);
        [view.x, view.y, view.z, view.w] = [view[0], view[1], view[2], view[3]];
        return view;
    }

    function nativeVector(value: unknown): number[] {
        if (Array.isArray(value)) return value.map(Number);
        if (typeof value !== 'object' || value === null) return [];
        const object = value as Record<string, unknown>;
        const components: number[] = [];
        for (const [coordinate, color] of [
            ['x', 'r'],
            ['y', 'g'],
            ['z', 'b'],
            ['w', 'a'],
        ]) {
            if (coordinate in object) components.push(Number(object[coordinate]));
            else if (color in object) components.push(Number(object[color]));
            else break;
        }
        return components;
    }

    function nativeInputVector(value: ArrayLike<number>): Record<string, number> {
        const object: Record<string, number> = {};
        for (let i = 0; i < Math.min(value.length, 4); i++) object[['x', 'y', 'z', 'w'][i]] = Math.fround(value[i]);
        return object;
    }

    function nativeEventFires(kind: EventKind, current: number, previous: number): boolean {
        switch (kind) {
            case 'change': {
                const difference = Math.abs(Math.fround(current - previous));
                return Number.isNaN(difference) || difference >= Math.fround(0.001);
            }
            case 'offToOn':
                return current > 0.5 && previous <= 0.5;
            case 'onToOff':
                return current < 0.5 && previous >= 0.5;
            case 'whileOn':
                return current > 0.5;
            case 'whileOff':
                return current < 0.5;
        }
    }

    class SsfScriptRuntime {
        declare private readonly options: SsfScriptOptions;
        declare private readonly controlsByKey: Map<string, BlinkControlSpec>;
        declare private readonly groups: Map<string, BlinkControlSpec[]>;
        declare private readonly frameValues: Map<string, SsfUniformValue>;
        declare private readonly overrides: Map<string, unknown>;
        declare private readonly uniformStore: Map<string, number | number[]>;
        declare private readonly legacyUniforms: Map<string, unknown>;
        declare private readonly registrations: Registration[];
        declare private readonly previous: Map<string, number>;
        declare private readonly api: Map<string, unknown>;
        declare private readonly inputs: Record<string, unknown>;
        /** Script declarations shadow provider values in legacy mode. */
        declare private readonly ownNames: ReadonlySet<string>;
        declare private readonly uniformsProxy: Record<string, unknown>;
        declare private module: ScriptModule | null;
        declare private failures: number;
        declare private disabled: boolean;
        declare private lastFailure: unknown;
        declare private logTokens: number;
        declare private lastRefill: number;
        declare private dropped: number;

        public constructor(options: SsfScriptOptions) {
            this.options = options;
            this.controlsByKey = new Map<string, BlinkControlSpec>();
            this.groups = new Map<string, BlinkControlSpec[]>();
            this.frameValues = new Map<string, SsfUniformValue>();
            this.overrides = new Map<string, unknown>();
            this.uniformStore = new Map<string, number | number[]>();
            this.legacyUniforms = new Map<string, unknown>();
            this.registrations = [];
            this.previous = new Map<string, number>();
            this.inputs = {};
            this.module = null;
            this.failures = 0;
            this.disabled = false;
            this.lastFailure = null;
            this.logTokens = LOG_BURST;
            this.lastRefill = 0;
            this.dropped = 0;
            this.ownNames = topLevelDeclarations(options.source);
            for (const control of options.controls) {
                const key = normalizeName(control.name);
                if (!this.controlsByKey.has(key)) this.controlsByKey.set(key, control);
                const group = control.group ?? '';
                this.groups.set(group, [...(this.groups.get(group) ?? []), control]);
            }
            this.uniformsProxy = new Proxy<Record<string, unknown>>(
                {},
                {
                    get: (_, key) => {
                        if (typeof key !== 'string') return;
                        return this.options.nativeLifecycle === true
                            ? this.legacyUniforms.get(key)
                            : this.uniformStore.get(key);
                    },
                    set: (_, key, value) => {
                        if (typeof key === 'string') {
                            if (this.options.nativeLifecycle === true) this.legacyUniforms.set(key, value);
                            else this.writeUniform(key, [value]);
                        }
                        return true;
                    },
                    deleteProperty: (_, key) => {
                        if (typeof key === 'string') this.legacyUniforms.delete(key);
                        return true;
                    },
                    has: (_, key) =>
                        typeof key === 'string' &&
                        (this.options.nativeLifecycle === true ? this.legacyUniforms : this.uniformStore).has(key),
                    ownKeys: () => [
                        ...(this.options.nativeLifecycle === true ? this.legacyUniforms : this.uniformStore).keys(),
                    ],
                    getOwnPropertyDescriptor: (_, key) =>
                        typeof key === 'string' &&
                        (this.options.nativeLifecycle === true ? this.legacyUniforms : this.uniformStore).has(key)
                            ? { enumerable: true, configurable: true, writable: true }
                            : undefined,
                }
            );
            this.api = this.buildApi();
        }

        /** Native mode publishes initial values, tolerates setup errors and requires a priming update. */
        public init(initialValues: ReadonlyMap<string, SsfUniformValue> = new Map()): void {
            const cases = [...this.ownNames].map(name => `case ${JSON.stringify(name)}: return ${name};`).join('');
            const publications = [...this.ownNames]
                .map(name => `case ${JSON.stringify(name)}: ${name} = __value; return;`)
                .join('');
            const body = `with (__scope) {\n${this.options.source}\n;return { setup: typeof setup === 'function' ? setup : undefined, update: typeof update === 'function' ? update : undefined, resolve: function(__name) { switch(__name) { ${cases} default: return undefined; } }, publish: function(__name, __value) { switch(__name) { ${publications} } } };\n}`;
            // eslint-disable-next-line no-new-func -- running the package script is the purpose of this class
            const factory = new Function('__scope', body) as (scope: object) => ScriptModule;
            this.module = factory(this.buildScope());
            if (this.options.nativeLifecycle !== true) {
                this.module.setup?.();
                return;
            }
            this.uniformStore.clear();
            this.loadFrame({ dt: Math.fround(0.017), values: initialValues });
            try {
                this.module.setup?.();
            } catch (error) {
                this.report(`JavaScript Error: ${String(error)}`);
            }
            this.step({ dt: Math.fround(0.017), values: new Map() });
        }

        /** One frame of the script phase: event handlers, then `update(dt)`. */
        public step(frame: SsfFrameInput): ScriptFrameResult {
            if (this.module === null) {
                throw new Error('SsfScriptRuntime: step() before init()');
            }
            if (this.disabled && this.options.nativeLifecycle === true) return { ok: false, error: this.lastFailure };
            this.loadFrame(frame);
            if (this.disabled) {
                return { ok: false, error: new Error('script disabled') };
            }
            try {
                if (this.options.nativeLifecycle !== true) this.runEvents();
                if (this.options.nativeLifecycle === true && typeof this.module.update !== 'function')
                    throw new Error('update is not callable');
                this.module.update?.(frame.dt);
                if (this.options.nativeLifecycle === true) {
                    this.flushNativeUniforms();
                }
                this.failures = 0;
                return { ok: true, error: null };
            } catch (error) {
                this.failures++;
                this.lastFailure = error;
                this.report(`script error: ${error instanceof Error ? error.message : String(error)}`);
                if (this.options.nativeLifecycle === true) {
                    this.disabled = true;
                    this.report('JavaScript Error: failed to run update function. Aborting script.');
                } else if (this.failures >= MAX_CONSECUTIVE_FAILURES) {
                    this.disabled = true;
                    this.report(`script disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
                }
                return { ok: false, error };
            }
        }

        /** The uniforms the script has written, shaped to their declared types. */
        public uniforms(): Record<string, SsfUniformValue> {
            const declared = this.options.declaredUniforms ?? {};
            const result: Record<string, SsfUniformValue> = {};
            for (const [name, value] of this.uniformStore) {
                const size =
                    VECTOR_SIZES[declared[name] ?? ''] ?? (Array.isArray(value) ? Math.min(value.length, 4) : 1);
                const components = Array.isArray(value) ? value : [value];
                if (size === 1) {
                    result[name] = components[0] ?? 0;
                } else {
                    const vector = new Float32Array(size);
                    for (let i = 0; i < size; i++) vector[i] = components[i] ?? 0;
                    result[name] = vector;
                }
            }
            return result;
        }

        public dispose(): void {
            this.module = null;
            this.registrations.length = 0;
            this.uniformStore.clear();
            this.legacyUniforms.clear();
        }

        // ── scope ────────────────────────────────────────────────────────────────

        private buildScope(): object {
            const hidden = (key: string): boolean => HIDDEN_GLOBALS.has(key);
            return new Proxy(
                {},
                {
                    has: (_, key) =>
                        typeof key === 'string' &&
                        !this.ownNames.has(key) &&
                        (this.overrides.has(key) || this.api.has(key) || this.frameValues.has(key) || hidden(key)),
                    get: (_, key) => {
                        if (typeof key !== 'string') return;
                        if (this.overrides.has(key)) return this.overrides.get(key);
                        if (this.api.has(key)) return this.api.get(key);
                        const value = this.frameValues.get(key);
                        if (value === undefined || typeof value === 'number') return value;
                        return this.options.nativeLifecycle === true ? this.inputs[key] : vectorView(value);
                    },
                    // A script that reuses a frame-global's name keeps its own variable.
                    set: (_, key, value) => {
                        if (typeof key === 'string') this.overrides.set(key, value);
                        return true;
                    },
                }
            );
        }

        private loadFrame(frame: SsfFrameInput): void {
            if (this.options.nativeLifecycle !== true) this.frameValues.clear();
            for (const [name, value] of frame.values) {
                // Shaped shader outputs can be echoed by the host, but publishing them as inputs would
                // replace persistent script objects with numeric vectors and discard their methods.
                if (
                    this.options.nativeLifecycle === true &&
                    (Object.hasOwn(this.options.declaredUniforms ?? {}, name) || this.legacyUniforms.has(name))
                )
                    continue;
                const native = this.options.nativeLifecycle === true;
                const published = typeof value === 'number' ? (native ? Math.fround(value) : value) : value;
                if (native) this.overrides.delete(name);
                this.frameValues.set(name, published);
                this.inputs[name] =
                    typeof published === 'number'
                        ? published
                        : native
                          ? nativeInputVector(published)
                          : vectorView(published);
                if (native) {
                    try {
                        this.module?.publish?.(name, this.inputs[name]);
                    } catch (error) {
                        this.report(`portable VM cannot overwrite lexical input ${name}: ${String(error)}`);
                    }
                    this.runNativeEvents(name, typeof published === 'number' ? published : published[0]);
                }
            }
        }

        private buildApi(): Map<string, unknown> {
            const log = (...args: unknown[]): void => this.report(args.map(String).join(' '));
            const consoleObject = { log, info: log, warn: log, error: log, debug: log };
            return new Map<string, unknown>([
                ['inputs', this.inputs],
                ['uniforms', this.uniformsProxy],
                ['console', consoleObject],
                ['print', log],
                ['textureFinalPass', (x: unknown, y: unknown) => this.textureFinalPass(x, y)],
                [
                    'printGlobalKeys',
                    () =>
                        this.report(
                            `globals: ${[...new Set([...this.api.keys(), ...this.ownNames, ...this.frameValues.keys(), ...this.overrides.keys()])].sort().join(', ')}`
                        ),
                ],
                [
                    'setUniform',
                    (name: unknown, ...values: unknown[]) =>
                        this.options.nativeLifecycle === true
                            ? this.writeNativeUniform(name, values)
                            : this.writeUniform(name as string, values),
                ],
                ['setControl', (name: string, ...values: unknown[]) => this.setControl(name, values, false)],
                ['setControlNormalized', (name: string, ...values: unknown[]) => this.setControl(name, values, true)],
                [
                    'setControlDimension',
                    (name: string, dimension: number, value: number) => this.setDimension(name, dimension, value),
                ],
                ['randomizeControl', (name: string) => this.randomize(this.controlNamed(name))],
                ['defaultControl', (name: string) => this.reset(this.controlNamed(name))],
                ['randomizeGroup', (group: string) => this.forGroup(group, control => this.randomize(control))],
                ['defaultGroup', (group: string) => this.forGroup(group, control => this.reset(control))],
                ['onChange', (target: string, handler: Handler) => this.register('change', target, handler)],
                ['onOffToOn', (target: string, handler: Handler) => this.register('offToOn', target, handler)],
                ['onOnToOff', (target: string, handler: Handler) => this.register('onToOff', target, handler)],
                ['whileOn', (target: string, handler: Handler) => this.register('whileOn', target, handler)],
                ['whileOff', (target: string, handler: Handler) => this.register('whileOff', target, handler)],
            ]);
        }

        // ── uniforms ─────────────────────────────────────────────────────────────

        private storeNativeUniform(name: string, values: readonly number[]): void {
            const numbers = values.map(Math.fround);
            this.uniformStore.set(name, numbers.length === 1 ? numbers[0] : numbers);
        }

        private writeNativeUniform(name: unknown, values: readonly unknown[]): unknown {
            const padded = Array.from({ length: 4 }, (_, i) => values[i]);
            const components = padded.map(value => (typeof value === 'number' ? value : NaN));
            const vector = nativeVector(padded[0]);
            if (vector.length > 4) throw new RangeError('invalid vector subscript');
            for (let i = 0; i < vector.length; i++) components[i] = vector[i];
            if (typeof name !== 'string' || Number.isNaN(components[0])) {
                this.report(
                    'JavaScript Error: function setUniform(uniformName, data) called with incorrect args. You can pass in up to four values like `setUniform(name, x, y, z, w)`, pass in an array with up to four values like `setUniform(name, [x, y, z, w])`, or pass in an object with xyzw or rgba properties like `setUniform(name, { x, y, z, w })`.'
                );
                return padded[3];
            }
            const end = components.findIndex(Number.isNaN);
            this.storeNativeUniform(name, end === -1 ? components : components.slice(0, end));
            return undefined;
        }

        private flushNativeUniforms(): void {
            const replacement = this.overrides.get('uniforms');
            const entries =
                replacement === undefined
                    ? this.legacyUniforms.entries()
                    : Object.entries(Object(replacement) as Record<string, unknown>);
            for (const [name, value] of entries) {
                if (!Array.isArray(value) && typeof value === 'object' && value !== null) {
                    const vector = nativeVector(value);
                    if (vector.length > 0) {
                        this.storeNativeUniform(name, vector);
                        continue;
                    }
                }
                const scalar = Array.isArray(value) ? 0 : typeof value === 'number' ? value : NaN;
                this.storeNativeUniform(name, [scalar]);
            }
        }

        private writeUniform(name: string, values: unknown[]): void {
            const flat = values.length === 1 && Array.isArray(values[0]) ? (values[0] as unknown[]) : values;
            const numbers = flat.map(value => Number(value));
            this.uniformStore.set(name, numbers.length === 1 ? numbers[0] : numbers);
        }

        // ── controls ─────────────────────────────────────────────────────────────

        private controlNamed(name: string): BlinkControlSpec | undefined {
            const control = this.controlsByKey.get(normalizeName(String(name)));
            if (control === undefined) this.report(`no control named "${String(name)}"`);
            return control;
        }

        private componentCount(control: BlinkControlSpec): number {
            return control.type === 'point2d' ? 2 : control.type === 'color' ? 3 : 1;
        }

        private bounds(control: BlinkControlSpec, index: number): [number, number] {
            if (control.type === 'float' || control.type === 'int') return [control.min ?? 0, control.max ?? 1];
            if (control.type === 'point2d') return [control.min?.[index] ?? 0, control.max?.[index] ?? 1];
            return [0, 1];
        }

        private write(control: BlinkControlSpec, components: number[]): void {
            const size = control.type === 'point2d' ? 2 : control.type === 'color' ? 4 : 1;
            if (size === 1) {
                this.options.surface.set(control.name, components[0] ?? 0);
                return;
            }
            const current = componentsOf(this.options.surface.get(control.name));
            const next = new Float32Array(size);
            for (let i = 0; i < size; i++) next[i] = components[i] ?? current[i] ?? (i === 3 ? 1 : 0);
            this.options.surface.set(control.name, next);
        }

        private setControl(name: string, values: unknown[], normalized: boolean): void {
            const control = this.controlNamed(name);
            if (control === undefined) return;
            const last = values.at(-1);
            const options =
                typeof last === 'object' && last !== null && !Array.isArray(last)
                    ? (last as Record<string, unknown>)
                    : undefined;
            if (options?.bank !== undefined && options.bank !== 'scene') {
                const bank = typeof options.bank === 'string' ? options.bank : 'invalid';
                this.report(`control bank "${bank}" is unavailable`);
                return;
            }
            const dimension = this.writeDimension(control, options?.dimension);
            if (dimension === null) return;
            const data = options === undefined ? values : values.slice(0, -1);
            const components = (data.length === 1 && Array.isArray(data[0]) ? (data[0] as unknown[]) : data).map(
                Number
            );
            const mapped = normalized
                ? components.map((value, index) => {
                      const [min, max] = this.bounds(control, dimension ?? index);
                      return min + Math.min(Math.max(value, 0), 1) * (max - min);
                  })
                : components;
            if (dimension !== undefined) this.setDimension(name, dimension, mapped[0] ?? 0);
            else this.write(control, mapped);
        }

        private writeDimension(control: BlinkControlSpec, value: unknown): number | null | undefined {
            if (value === undefined) return undefined;
            const size = control.type === 'color' ? 4 : this.componentCount(control);
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= size) {
                this.report(`invalid control dimension for "${control.name}"`);
                return null;
            }
            return value;
        }

        private setDimension(name: string, dimension: number, value: number): void {
            const control = this.controlNamed(name);
            if (control === undefined) return;
            const components = componentsOf(this.options.surface.get(control.name));
            components[Math.trunc(dimension)] = Number(value);
            this.write(control, components);
        }

        private randomize(control: BlinkControlSpec | undefined): void {
            if (control === undefined) return;
            const components = Array.from({ length: this.componentCount(control) }, (_, index) => {
                const [min, max] = this.bounds(control, index);
                return min + Math.random() * (max - min);
            });
            this.write(control, components);
        }

        private reset(control: BlinkControlSpec | undefined): void {
            if (control === undefined) return;
            if (control.type === 'float' || control.type === 'int') this.write(control, [control.default]);
            else if (control.type === 'point2d' || control.type === 'color') this.write(control, [...control.default]);
        }

        private forGroup(group: string, action: (control: BlinkControlSpec) => void): void {
            const key = normalizeName(String(group));
            for (const [name, controls] of this.groups) {
                if (normalizeName(name) === key) controls.forEach(action);
            }
        }

        // ── events ───────────────────────────────────────────────────────────────

        private register(kind: EventKind, target: string, handler: Handler | string): void {
            if (
                typeof target !== 'string' ||
                (this.options.nativeLifecycle === true ? typeof handler !== 'string' : typeof handler !== 'function')
            ) {
                this.report(`${kind} handler for "${String(target)}" is not a function`);
                return;
            }
            this.registrations.push({ kind, target: String(target), handler, previous: 0 });
        }

        private textureFinalPass(x: unknown, y: unknown): number[] | undefined {
            if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) {
                this.report('JavaScript Error: function textureFinalPass(x, y) called with incorrect args');
                return;
            }
            if (this.options.readFinalPass === undefined) throw new Error('textureFinalPass callback not set');
            const rgb: readonly number[] = this.options.readFinalPass(Math.fround(x), Math.fround(y));
            if (rgb.length !== 3) throw new Error('textureFinalPass callback returned invalid data');
            return rgb.map(Math.fround);
        }

        private runNativeEvents(name: string, value: number): void {
            const current = Math.fround(value);
            const key = name.toLowerCase().replaceAll(/[ _-]/g, '');
            for (const registration of [...this.registrations]) {
                if (registration.target.toLowerCase().replaceAll(/[ _-]/g, '') !== key) continue;
                const previous = registration.previous;
                registration.previous = current;
                const fire = nativeEventFires(registration.kind, current, previous);
                if (!fire) continue;
                try {
                    const handler =
                        typeof registration.handler === 'string'
                            ? this.module?.resolve?.(registration.handler)
                            : undefined;
                    if (typeof handler !== 'function') throw new Error('event callback is not callable');
                    (handler as Handler)(current, previous);
                } catch (error) {
                    this.registrations.splice(this.registrations.indexOf(registration), 1);
                    this.report(`JavaScript Error: ${String(error)}`);
                    this.report(
                        `JavaScript Error: failed to execute event handler ${String(registration.handler)} for the target ${name}. This event handler has been disabled.`
                    );
                }
            }
        }

        private readTarget(target: string): number | undefined {
            const key = normalizeName(target);
            const control = this.controlsByKey.get(key);
            const name = control?.name ?? target;
            const value = this.frameValues.get(name);
            if (value === undefined) return undefined;
            return typeof value === 'number' ? value : value[0];
        }

        /** Handlers see the value a frame starts with and the one before it; 0.5 is the on/off threshold. */
        private runEvents(): void {
            for (const registration of this.registrations) {
                const current = this.readTarget(registration.target);
                if (current === undefined) continue;
                const previous = this.previous.get(registration.target) ?? current;
                const fire =
                    (registration.kind === 'change' && current !== previous) ||
                    (registration.kind === 'offToOn' && previous < 0.5 && current >= 0.5) ||
                    (registration.kind === 'onToOff' && previous >= 0.5 && current < 0.5) ||
                    (registration.kind === 'whileOn' && current >= 0.5) ||
                    (registration.kind === 'whileOff' && current < 0.5);
                if (fire && typeof registration.handler === 'function') registration.handler(current, previous);
            }
            for (const registration of this.registrations) {
                const current = this.readTarget(registration.target);
                if (current !== undefined) this.previous.set(registration.target, current);
            }
        }

        // ── logging ──────────────────────────────────────────────────────────────

        /** Bounded forwarding: a script that logs every frame must not flood the console. */
        private report(message: string): void {
            const now = (this.options.now ?? Date.now)();
            this.logTokens = Math.min(LOG_BURST, this.logTokens + ((now - this.lastRefill) / 1000) * LOG_PER_SECOND);
            this.lastRefill = now;
            if (this.logTokens < 1) {
                this.dropped++;
                return;
            }
            this.logTokens -= 1;
            const suffix = this.dropped > 0 ? ` (${this.dropped} messages dropped)` : '';
            this.dropped = 0;
            (this.options.log ?? (text => console.log(`[ssf script] ${text}`)))(`${message}${suffix}`);
        }
    }
    return SsfScriptRuntime;
}

export const SsfScriptRuntime = createRuntimeClass(topLevelDeclarations);
export type SsfScriptRuntime = InstanceType<typeof SsfScriptRuntime>;

/** Bootstrap source for a separate JavaScript realm; isolation is supplied by its owner. */
export function ssfScriptRealmSource(): string {
    return `const SsfScriptRuntime = (${createRuntimeClass.toString()})(${topLevelDeclarations.toString()});`;
}
