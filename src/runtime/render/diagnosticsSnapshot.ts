import type { FaultRecord, FrameTimeReport } from '../health';
import type { PassDiagnostics } from './pass';

/**
 * Point-in-time render state for a debug panel. Plain data (no ExoJS types) so it can be rendered
 * without importing the engine.
 */
export interface BlinkDiagnosticsSnapshot {
    fps: number;
    frame: number;
    time: number;
    deltaTime: number;
    screen: readonly [number, number];
    passes: readonly PassDiagnostics[];
    audio: Readonly<Record<string, number>>;
    frameTimes?: FrameTimeReport;
    faults?: readonly FaultRecord[];
    /** The engine's running estimate of live GPU memory, in bytes; absent where the backend reports none. */
    gpuMemoryBytes?: number;
}

/**
 * Assemble a diagnostics snapshot from the primitive values RenderService already holds. A free
 * function, mirroring computePassDiagnostics, so the field mapping - which value lands under
 * which name - is covered by a unit test independent of RenderService's ExoApplication
 * construction.
 */
export function buildDiagnosticsSnapshot(
    fps: number,
    frame: number,
    time: number,
    deltaTime: number,
    screen: readonly [number, number],
    passes: readonly PassDiagnostics[],
    audio: Readonly<Record<string, number>>,
    frameTimes?: FrameTimeReport,
    faults?: readonly FaultRecord[],
    gpuMemoryBytes?: number
): BlinkDiagnosticsSnapshot {
    return { fps, frame, time, deltaTime, screen, passes, audio, frameTimes, faults, gpuMemoryBytes };
}
