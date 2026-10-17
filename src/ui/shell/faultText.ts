import type { FaultRecord, FaultSource } from '../../runtime/health';

const SOURCE_LABELS: Readonly<Record<FaultSource, string>> = {
    script: 'Skript',
    ssfScript: 'SSF-Skript',
    render: 'Rendering',
    audioOutput: 'Audioausgabe',
};

/** One line for a part of the running effect that failed, saying whether it was switched off. */
export function describeFault(fault: FaultRecord): string {
    const label = SOURCE_LABELS[fault.source];
    if (fault.disabled) {
        return `${label} abgeschaltet: ${fault.message}`;
    }
    return `${label}: ${fault.message} (${fault.occurrences}x)`;
}
