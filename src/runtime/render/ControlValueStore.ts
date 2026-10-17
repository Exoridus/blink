import type { UniformValue } from '@codexo/exojs';

import type { BlinkControlSpec } from '../ir/types';
import { buildDefaultUniformValues } from './BlinkPrelude';

/**
 * Owns raw controls and transient trigger inputs for the currently running BlinkFX effect.
 */
export class ControlValueStore {
    private map: Record<string, UniformValue> = {};
    private readonly bangs = new Set<string>();
    private readonly pendingBangs = new Map<string, number>();
    private readonly gap = new Set<string>();

    /**
     * Current values, keyed by control name, for per-pass uniform upload.
     *
     * Returns the live backing map. Scripts and the compatibility processor must sample trigger
     * inputs between beginFrame and endFrame; retained references observe subsequent writes.
     */
    public get values(): Readonly<Record<string, UniformValue>> {
        return this.map;
    }

    /** Replace the whole map with an effect's declared defaults, discarding any prior writes. */
    public loadDefaults(controls: readonly BlinkControlSpec[], sources: Readonly<Record<string, object>> = {}): void {
        this.map = buildDefaultUniformValues(controls);
        this.bangs.clear();
        this.pendingBangs.clear();
        this.gap.clear();
        for (const control of controls) {
            const source = sources[control.name] as { type?: unknown } | undefined;
            const sourceType = typeof source?.type === 'string' ? source.type.trim().split(/\s+/)[0] : '';
            if (control.type === 'bang' || sourceType === 'bang') {
                this.bangs.add(control.name);
                this.map[control.name] = 0;
            }
        }
    }

    /** Queues one transient event; absent and non-trigger controls return false. */
    public queueBang(name: string): boolean {
        if (!this.bangs.has(name)) return false;
        this.pendingBangs.set(name, (this.pendingBangs.get(name) ?? 0) + 1);
        return true;
    }

    /** Publishes queued events; a busy consumer can hold delivery without consuming events or gaps. */
    public beginFrame(deliver = true): void {
        for (const name of this.bangs) {
            this.map[name] = 0;
            if (!deliver) continue;
            if (this.gap.delete(name)) continue;
            const pending = this.pendingBangs.get(name) ?? 0;
            if (pending === 0) continue;
            this.pendingBangs.set(name, pending - 1);
            this.map[name] = 1;
            this.gap.add(name);
        }
    }

    /** Clears raw event values after scripts and the compatibility processor have sampled them. */
    public endFrame(): void {
        for (const name of this.bangs) this.map[name] = 0;
    }

    /** Copies transient input values so asynchronous frame callbacks retain their observed pulses. */
    public snapshotBangs(): Record<string, number> {
        const snapshot: Record<string, number> = {};
        for (const name of this.bangs) {
            const value = this.map[name];
            snapshot[name] = typeof value === 'number' ? value : 0;
        }
        return snapshot;
    }

    /** Cancels queued events and clears the currently published pulse for a trigger control. */
    public cancelBang(name: string): void {
        if (!this.bangs.has(name)) return;
        this.pendingBangs.delete(name);
        this.gap.delete(name);
        this.map[name] = 0;
    }

    /**
     * Overwrite one control's value.
     *
     * @throws {Error} if `name` is not a control declared by the currently loaded effect. A typo in a
     *   preset or control panel must surface here rather than silently writing a key no shader reads.
     */
    public set(name: string, value: UniformValue): void {
        if (!(name in this.map)) {
            throw new Error(`ControlValueStore: unknown control "${name}"`);
        }
        this.map[name] = value;
    }

    /**
     * Overwrite every value in `values` at once, such as a loaded preset applying all of its
     * controls together.
     *
     * All names are checked before anything is written, so a single unknown name leaves every
     * existing value untouched rather than applying a partial preset.
     *
     * @throws {Error} if any name in `values` is not a control declared by the currently loaded effect.
     */
    public applyValues(values: Readonly<Record<string, UniformValue>>): void {
        for (const name of Object.keys(values)) {
            if (!(name in this.map)) {
                throw new Error(`ControlValueStore: unknown control "${name}"`);
            }
        }
        Object.assign(this.map, values);
    }
}
