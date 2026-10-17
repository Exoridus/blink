import { BrowserPlatform } from '@codexo/exojs';

/** Caps complete engine frames without changing RAF's display synchronization. */
export class CappedBrowserPlatform extends BrowserPlatform {
    public fpsCap = 144;
    private nextDue = Number.NEGATIVE_INFINITY;
    private sequence = 0;
    private readonly handles = new Map<number, number>();

    public override requestFrame(callback: (timestamp: number) => void): number {
        const handle = ++this.sequence;
        const tick = (timestamp: number): void => {
            if (!this.handles.has(handle)) return;
            if (timestamp + 0.001 < this.nextDue) {
                this.handles.set(handle, super.requestFrame(tick));
                return;
            }
            this.handles.delete(handle);
            const interval = 1000 / this.fpsCap;
            this.nextDue = Number.isFinite(this.nextDue)
                ? this.nextDue + interval * Math.max(1, Math.floor((timestamp - this.nextDue) / interval) + 1)
                : timestamp + interval;
            callback(timestamp);
        };
        this.handles.set(handle, super.requestFrame(tick));
        return handle;
    }

    public override cancelFrame(handle: number): void {
        const scheduled = this.handles.get(handle);
        if (scheduled !== undefined) super.cancelFrame(scheduled);
        this.handles.delete(handle);
    }

    public override destroy(): void {
        for (const handle of this.handles.keys()) this.cancelFrame(handle);
        super.destroy();
    }
}
