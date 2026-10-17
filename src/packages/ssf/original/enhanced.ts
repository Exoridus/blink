import type { AudioAnalysisProvider, AudioAnalysisSnapshot, AudioBlock } from './provider';
import { SsfOriginalProvider } from './provider';
import { SsfScalarBank } from './scalars';

export interface ExoTempoEvidence {
    readonly bpm: number;
    readonly confidence: number;
    readonly sampleIndex: number;
    readonly sourceEpoch: number;
}

function isAligned(evidence: ExoTempoEvidence | null, snapshot: AudioAnalysisSnapshot): evidence is ExoTempoEvidence {
    if (evidence === null) return false;
    const age = snapshot.instant.sampleIndex - evidence.sampleIndex;
    return (
        evidence.sourceEpoch === snapshot.instant.sourceEpoch &&
        age >= 0 &&
        age <= 22050 &&
        Number.isFinite(evidence.bpm) &&
        evidence.bpm > 0 &&
        Number.isFinite(evidence.confidence) &&
        evidence.confidence >= 0 &&
        evidence.confidence <= 1
    );
}

/** Experimental tempo family; reactive onset gates remain original rather than musical beats. */
export class ExoEnhancedProvider implements AudioAnalysisProvider {
    private readonly original = new SsfOriginalProvider();
    private tempoBank = new SsfScalarBank();
    private evidence: ExoTempoEvidence | null = null;

    public constructor(private readonly exoVersion: string) {}

    public publishTempo(evidence: ExoTempoEvidence): void {
        this.evidence = { ...evidence };
    }

    public process(block: AudioBlock): void {
        this.original.process(block);
    }

    public snapshot(deltaTime: number, reactivity = 0.5, audioSpeed = 0.5): AudioAnalysisSnapshot {
        const native = this.original.snapshot(deltaTime, reactivity, audioSpeed);
        const evidence = this.evidence;
        const valid = isAligned(evidence, native);
        const signals = new Map(native.signals);

        const alternate = this.tempoBank.update(
            {
                band: new Float32Array(10),
                z: new Float32Array(10),
                mean: new Float32Array(10),
                raw: 0,
                bpm: valid ? evidence.bpm : native.nativeTempo.bpm,
                confidence: valid ? evidence.confidence : native.nativeTempo.confidence,
            },
            reactivity,
            audioSpeed,
            deltaTime
        );
        for (const [name, original] of signals) {
            if (!name.startsWith('syn_BPM')) continue;
            signals.set(
                name,
                valid
                    ? {
                          value: alternate[name],
                          origin: 'enhanced-adapter',
                          valid: true,
                          note: 'ExoJS tempo evidence; native oscillator mapping, distinct from native BPM estimator',
                      }
                    : { ...original, origin: 'ssf-original-fallback', note: 'No valid aligned ExoJS tempo evidence' }
            );
        }
        return {
            ...native,
            profile: 'exojs-enhanced',
            signals,
            diagnostics: {
                ...native.diagnostics,
                exoVersion: this.exoVersion,
                enhancedTempo: valid ? 'EXPERIMENTAL' : 'ORIGINAL_FALLBACK',
                musicalAccuracy: 'UNKNOWN; independently annotated benchmark required',
                v020: 'unavailable',
            },
        };
    }

    public reset(sourceEpoch: number): void {
        this.original.reset(sourceEpoch);
        this.tempoBank = new SsfScalarBank();
        this.evidence = null;
    }

    public destroy(): void {
        this.original.destroy();
    }
}
