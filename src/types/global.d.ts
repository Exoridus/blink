// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

type MixedRequirements<
    T extends Obj,
    Req extends Exclude<keyof T, Opt>,
    Opt extends Exclude<keyof T, Req> = Exclude<keyof T, Req>,
> = Required<Pick<T, Req>> & Partial<Pick<T, Opt>>;

interface BlinkAudioDebugBridge {
    captureSurfaces(): void;
    captureSeries(options?: { everyFrames?: number; maxSnapshots?: number }): void;
    getLastSnapshot(): unknown;
    captureProbeSession(options: {
        probeId: string;
        expectedDurationSeconds: number;
        preRollSeconds?: number;
        postRollSeconds?: number;
    }): Promise<unknown>;
    captureAndPlayProbeSession(options: {
        probeUrl: string;
        probeId: string;
        expectedDurationSeconds?: number;
        preRollSeconds?: number;
        postRollSeconds?: number;
    }): Promise<unknown>;
    getProbeSessionStatus(): unknown;
    cancelProbeSession(): void;
    getCurrentAudioSurfaceStats(): unknown;
}

interface Window {
    blinkAudioDebug?: BlinkAudioDebugBridge;
    /** Development builds only: counters of the generated-audio runtime. */
    blinkAudioOutput?: { stats(): unknown };
}
