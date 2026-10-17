import { packSsfAudio, SsfJuiced, ssfRawSpectrum, SsfSmooth, SsfTimeSeries, ssfWaveform } from './arrays';
import { SsfBandState } from './bandState';
import { SsfBpmTracker } from './bpm';
import { SsfFrontend } from './frontend';
import { SsfScalarBank } from './scalars';

export interface AudioBlock {
    readonly samples: Float32Array;
    readonly sampleRate: number;
    readonly firstSample: number;
    readonly sourceEpoch: number;
}

export interface AnalysisInstant {
    readonly sourceEpoch: number;
    readonly sampleIndex: number;
    readonly audioTimeSec: number;
    readonly analysisSequence: number;
}

export type SignalOrigin = 'ssf-native-reconstruction' | 'enhanced-adapter' | 'ssf-original-fallback';

export interface PublishedSignal {
    readonly value: number | Float32Array;
    readonly origin: SignalOrigin;
    readonly valid: boolean;
    readonly note?: string;
}

export interface AudioAnalysisSnapshot {
    readonly profile: 'ssf-1.25.2-original' | 'exojs-enhanced';
    readonly instant: AnalysisInstant;
    readonly nativeTempo: { readonly bpm: number; readonly confidence: number };
    readonly signals: ReadonlyMap<string, PublishedSignal>;
    readonly spectrum: Float32Array;
    readonly levelTrail: Float32Array;
    readonly diagnostics: Readonly<Record<string, number | string | boolean>>;
}

export interface AudioAnalysisProvider {
    process(block: AudioBlock): void;
    /** Advances render producers once and returns owned arrays; call once per rendered frame. */
    snapshot(deltaTime: number, reactivity?: number, audioSpeed?: number): AudioAnalysisSnapshot;
    reset(sourceEpoch: number): void;
    destroy(): void;
}

/** Owns analysis and render producer state; only explicitly reset epochs start fresh histories. */
export class SsfOriginalProvider implements AudioAnalysisProvider {
    private frontend = new SsfFrontend();
    private bpm = new SsfBpmTracker();
    private scalars = new SsfScalarBank();
    private juiced = new SsfJuiced();
    private smooth = new SsfSmooth();
    private trails = Array.from({ length: 4 }, () => new SsfTimeSeries());
    private bands = Array.from({ length: 10 }, () => new SsfBandState());
    private bpmHistories = Array.from({ length: 22 }, () => new Float32Array(1024));
    private readonly pending = new Float32Array(512);
    private pendingCount = 0;
    private received = 0;
    private analyzed = 0;
    private sequence = 0;
    private epoch = 0;
    private destroyed = false;

    public process(block: AudioBlock): void {
        if (this.destroyed) throw new Error('SSF provider is destroyed');
        if (block.sampleRate !== 44100) throw new RangeError('SSF Original requires mono PCM at 44100 Hz');
        if (block.sourceEpoch !== this.epoch || block.firstSample !== this.received)
            throw new RangeError('SSF PCM must be contiguous within the current source epoch');
        let offset = 0;
        while (offset < block.samples.length) {
            const count = Math.min(512 - this.pendingCount, block.samples.length - offset);
            this.pending.set(block.samples.subarray(offset, offset + count), this.pendingCount);
            this.pendingCount += count;
            offset += count;
            if (this.pendingCount === 512) {
                this.analyze(this.pending);
                this.pendingCount = 0;
                this.analyzed += 512;
                this.sequence++;
            }
        }
        this.received += block.samples.length;
    }

    public snapshot(deltaTime: number, reactivity = 0.5, audioSpeed = 0.5): AudioAnalysisSnapshot {
        if (this.destroyed) throw new Error('SSF provider is destroyed');
        const band = Float32Array.from(this.bands, state => state.band);
        const values = this.scalars.update(
            {
                band,
                z: Float32Array.from(this.bands, state => state.z),
                mean: Float32Array.from(this.bands, state => state.mean),
                raw: this.bands[0].raw,
                bpm: this.bpm.bpm,
                confidence: this.bpm.confidence,
            },
            reactivity,
            audioSpeed,
            deltaTime
        );
        const signals = new Map<string, PublishedSignal>();
        for (const [name, value] of Object.entries(values))
            signals.set(name, { value, origin: 'ssf-native-reconstruction', valid: this.sequence > 0 });
        const raw = ssfRawSpectrum(this.frontend.power, reactivity);
        const juiced = this.juiced.update(this.frontend.power, reactivity);
        const smooth = this.smooth.update(this.frontend.smoothBands, reactivity);
        const waveform = ssfWaveform(this.frontend.history, reactivity);
        const histories = this.trails.map((trail, index) => trail.update(band[[0, 2, 5, 6][index]]));
        const arrays = {
            syn_Spectrum: raw,
            syn_SpectrumJuiced: juiced,
            syn_SpectrumSmooth: smooth,
            syn_Waveform: waveform,
            syn_TimeSeries: histories[0],
            syn_BassTimeSeries: histories[1],
            syn_MidTimeSeries: histories[2],
            syn_HighTimeSeries: histories[3],
        };
        for (const [name, value] of Object.entries(arrays))
            signals.set(name, { value, origin: 'ssf-native-reconstruction', valid: this.sequence > 0 });
        return {
            profile: 'ssf-1.25.2-original',
            nativeTempo: { bpm: this.bpm.bpm, confidence: this.bpm.confidence },
            instant: {
                sourceEpoch: this.epoch,
                sampleIndex: this.analyzed,
                audioTimeSec: this.analyzed / 44100,
                analysisSequence: this.sequence,
            },
            signals,
            spectrum: packSsfAudio([raw, juiced, smooth, waveform]),
            levelTrail: packSsfAudio(histories as [Float32Array, Float32Array, Float32Array, Float32Array]),
            diagnostics: {
                numericalProfile: 'portable-f64-fft-pc53-zen2-smooth',
                hop: 512,
                sampleRate: 44100,
                warmup: this.sequence < 1024 ? 'WARMING_UP' : 'READY',
                pendingSamples: this.pendingCount,
                waveformLength: waveform.length,
                nativeParity: 'qualified fixed PCM-to-publication replay; full native GPU parity unverified',
            },
        };
    }

    public reset(sourceEpoch: number): void {
        if (!Number.isSafeInteger(sourceEpoch) || sourceEpoch < 0) throw new RangeError('Invalid SSF source epoch');
        this.frontend = new SsfFrontend();
        this.bpm = new SsfBpmTracker();
        this.scalars = new SsfScalarBank();
        this.juiced = new SsfJuiced();
        this.smooth = new SsfSmooth();
        this.trails = Array.from({ length: 4 }, () => new SsfTimeSeries());
        this.bands = Array.from({ length: 10 }, () => new SsfBandState());
        this.bpmHistories = Array.from({ length: 22 }, () => new Float32Array(1024));
        this.pendingCount = this.received = this.analyzed = this.sequence = 0;
        this.epoch = sourceEpoch;
    }

    public destroy(): void {
        this.destroyed = true;
    }

    private analyze(chunk: Float32Array): void {
        this.frontend.process(chunk);
        this.bpm.update(this.bpmHistories);
        for (const [index, history] of this.bpmHistories.entries()) {
            history.copyWithin(0, 1);
            history[1023] = this.frontend.bpmBands[index];
        }
        const [peak, , rms, flux, mass] = this.frontend.features;
        const [bass, mid, midHigh, aux, high] = this.frontend.bands;
        for (const [index, value] of [peak, peak, bass, midHigh, aux, mid, high, rms, mass, flux].entries())
            this.bands[index].push(value);
    }
}
