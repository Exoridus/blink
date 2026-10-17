import { strToU8, zipSync } from 'fflate';

import type { BlinkAudioProbeSessionRecorder } from './BlinkAudioProbeSessionRecorder';

function buildIsoTimestamp(): string {
    return new Date().toISOString().replaceAll(/[:.]/g, '-');
}

export function buildProbeSessionZip(recorder: BlinkAudioProbeSessionRecorder): Uint8Array {
    const manifestJson = JSON.stringify(recorder.buildManifest(), null, 2);

    const entries: Record<string, Uint8Array> = {
        'manifest.json': strToU8(manifestJson),
        'spectrum_frames.bin': recorder.buildSpectrumBin(),
        'leveltrail_frames.bin': recorder.buildLeveltrailBin(),
        'frame_index.jsonl': strToU8(recorder.buildFrameIndexJsonl()),
    };

    return zipSync(entries);
}

export function triggerProbeSessionDownload(zipData: Uint8Array): void {
    const ts = buildIsoTimestamp();
    const filename = `blink_surface_session_${ts}.zip`;

    const blob = new Blob([zipData as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
