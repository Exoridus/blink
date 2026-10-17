import { strToU8, zipSync } from 'fflate';

import type { BlinkAudioSpectrumStageRecorder } from './BlinkAudioSpectrumStageRecorder';

function buildIsoTimestamp(): string {
    return new Date().toISOString().replaceAll(/[:.]/g, '-');
}

/** Sanitize a session name to filesystem-safe characters. */
function sanitizeSessionName(name: string): string {
    return name
        .replaceAll(/[^a-zA-Z0-9_\-]/g, '_')
        .replaceAll(/__+/g, '_')
        .replaceAll(/^_|_$/g, '');
}

export function buildSpectrumStageZip(recorder: BlinkAudioSpectrumStageRecorder): Uint8Array {
    const entries: Record<string, Uint8Array> = {
        'manifest.json': strToU8(JSON.stringify(recorder.buildManifest(), null, 2)),
        'frame_index.jsonl': strToU8(recorder.buildFrameIndexJsonl()),
    };

    const names = [
        'analyser_db',
        'analyser_log_db',
        'raw_input_candidate',
        'raw_output',
        'juiced_output',
        'smooth_output',
        'waveform_output',
        'packed_spectrum',
        'packed_leveltrail',
        'level_scalars',
        'candidate_scalars',
    ];
    for (const name of names) {
        const data = recorder.buildBin(name);
        if (data.byteLength > 0) {
            entries[`${name}_frames.bin`] = data;
        }
    }

    return zipSync(entries);
}

export function triggerStageSessionDownload(zipData: Uint8Array, sessionName?: string): void {
    const ts = buildIsoTimestamp();
    const namePart = sessionName ? `_${sanitizeSessionName(sessionName)}` : '';
    const filename = `blink_spectrum_stage_session${namePart}_${ts}.zip`;
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
