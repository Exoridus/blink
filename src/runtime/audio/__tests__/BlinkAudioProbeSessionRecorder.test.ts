import { describe, expect, it } from 'vitest';

import type { ProbeSessionOptions } from '../BlinkAudioProbeSessionRecorder';
import { BlinkAudioProbeSessionRecorder } from '../BlinkAudioProbeSessionRecorder';

function makeOptions(overrides: Partial<ProbeSessionOptions> = {}): ProbeSessionOptions {
    return {
        probeId: 'test_probe',
        expectedDurationSeconds: 10,
        preRollSeconds: 0.5,
        postRollSeconds: 1.0,
        ...overrides,
    };
}

function makeSpectrumBytes(): Uint8Array {
    const buf = new ArrayBuffer(16384);
    const view = new Uint8Array(buf);
    for (let i = 0; i < view.length; i++) view[i] = i % 256;
    return view;
}

function makeLeveltrailBytes(): Uint8Array {
    const buf = new ArrayBuffer(6400);
    const view = new Uint8Array(buf);
    for (let i = 0; i < view.length; i++) view[i] = (i + 100) % 256;
    return view;
}

describe('BlinkAudioProbeSessionRecorder', () => {
    describe('state transitions', () => {
        it('starts in idle state', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            expect(rec.state).toBe('idle');
        });

        it('transitions idle -> running on start()', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();
            expect(rec.state).toBe('running');
        });

        it('transitions running -> cancelled on cancel()', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();
            rec.cancel();
            expect(rec.state).toBe('cancelled');
        });

        it('transitions running -> finalizing -> done on finalize()', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();
            const result = rec.finalize(100);
            expect(rec.state).toBe('done');
            expect(result.framesCaptured).toBe(0);
        });

        it('throws when starting an already running session', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();
            expect(() => rec.start()).toThrow();
        });

        it('throws when finalizing a non-running session', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            expect(() => rec.finalize(0)).toThrow();
        });

        it('cancel on idle does not change state', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.cancel();
            expect(rec.state).toBe('idle');
        });
    });

    describe('expected durations', () => {
        it('computes expected capture seconds from options', () => {
            const rec = new BlinkAudioProbeSessionRecorder(
                makeOptions({
                    expectedDurationSeconds: 99,
                    preRollSeconds: 1,
                    postRollSeconds: 3,
                }),
                0
            );
            expect(rec.expectedCaptureSeconds).toBe(103);
        });

        it('uses default preroll and postroll when not specified', () => {
            const rec = new BlinkAudioProbeSessionRecorder(
                {
                    probeId: 'test',
                    expectedDurationSeconds: 60,
                },
                0
            );
            expect(rec.preRollSeconds).toBe(1);
            expect(rec.postRollSeconds).toBe(3);
            expect(rec.expectedCaptureSeconds).toBe(64);
        });
    });

    describe('frame appending', () => {
        it('appends spectrum and leveltrail bytes', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();

            const spec = makeSpectrumBytes();
            const trail = makeLeveltrailBytes();
            rec.appendFrame(spec, trail, 1);

            expect(rec.framesCaptured).toBe(1);
            expect(rec.spectrumTotalBytes).toBe(16384);
            expect(rec.leveltrailTotalBytes).toBe(6400);
        });

        it('does not append when not running', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.appendFrame(makeSpectrumBytes(), makeLeveltrailBytes(), 0);
            expect(rec.framesCaptured).toBe(0);
            expect(rec.spectrumTotalBytes).toBe(0);
        });

        it('appends multiple frames correctly', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();

            for (let i = 0; i < 5; i++) {
                rec.appendFrame(makeSpectrumBytes(), makeLeveltrailBytes(), i);
            }

            expect(rec.framesCaptured).toBe(5);
            expect(rec.spectrumTotalBytes).toBe(5 * 16384);
            expect(rec.leveltrailTotalBytes).toBe(5 * 6400);
        });

        it('index entries have correct offsets', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();

            rec.appendFrame(makeSpectrumBytes(), makeLeveltrailBytes(), 1);
            rec.appendFrame(makeSpectrumBytes(), makeLeveltrailBytes(), 2);

            const entries = rec.indexEntries;
            expect(entries[0].frameIndex).toBe(0);
            expect(entries[0].spectrumOffsetBytes).toBe(0);
            expect(entries[0].leveltrailOffsetBytes).toBe(0);

            expect(entries[1].frameIndex).toBe(1);
            expect(entries[1].spectrumOffsetBytes).toBe(16384);
            expect(entries[1].leveltrailOffsetBytes).toBe(6400);
        });
    });

    describe('binary builders', () => {
        it('buildSpectrumBin returns correct size', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();

            const spec = makeSpectrumBytes();
            rec.appendFrame(spec, makeLeveltrailBytes(), 1);
            rec.appendFrame(spec, makeLeveltrailBytes(), 2);

            const bin = rec.buildSpectrumBin();
            expect(bin.byteLength).toBe(2 * 16384);
        });

        it('buildLeveltrailBin returns correct size', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();

            const trail = makeLeveltrailBytes();
            rec.appendFrame(makeSpectrumBytes(), trail, 1);
            rec.appendFrame(makeSpectrumBytes(), trail, 2);

            const bin = rec.buildLeveltrailBin();
            expect(bin.byteLength).toBe(2 * 6400);
        });

        it('buildSpectrumBin preserves data', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();

            const spec = makeSpectrumBytes();
            rec.appendFrame(spec, makeLeveltrailBytes(), 1);

            const bin = rec.buildSpectrumBin();
            expect(bin[0]).toBe(spec[0]);
            expect(bin[16383]).toBe(spec[16383]);
        });

        it('buildLeveltrailBin preserves data', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();

            const trail = makeLeveltrailBytes();
            rec.appendFrame(makeSpectrumBytes(), trail, 1);

            const bin = rec.buildLeveltrailBin();
            expect(bin[0]).toBe(trail[0]);
            expect(bin[6399]).toBe(trail[6399]);
        });
    });

    describe('frame index JSONL', () => {
        it('builds valid JSONL with correct line count', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();

            rec.appendFrame(makeSpectrumBytes(), makeLeveltrailBytes(), 1);
            rec.appendFrame(makeSpectrumBytes(), makeLeveltrailBytes(), 2);

            const jsonl = rec.buildFrameIndexJsonl();
            const lines = jsonl.trim().split('\n');
            expect(lines.length).toBe(2);

            const e0 = JSON.parse(lines[0]);
            expect(e0.frameIndex).toBe(0);
            expect(e0.spectrumOffsetBytes).toBe(0);

            const e1 = JSON.parse(lines[1]);
            expect(e1.frameIndex).toBe(1);
            expect(e1.spectrumOffsetBytes).toBe(16384);
        });
    });

    describe('manifest', () => {
        it('contains expected sections', () => {
            const rec = new BlinkAudioProbeSessionRecorder(
                makeOptions({
                    probeId: 'ssf_audio_probe_master_v1',
                    expectedDurationSeconds: 99,
                    preRollSeconds: 1,
                    postRollSeconds: 3,
                }),
                42
            );
            rec.start();
            rec.appendFrame(makeSpectrumBytes(), makeLeveltrailBytes(), 43);
            rec.finalize(100);

            const manifest = rec.buildManifest();
            expect(manifest.source).toBe('blink');
            expect(manifest.sessionType).toBe('surface-session');
            expect(manifest.probe).toHaveProperty('id', 'ssf_audio_probe_master_v1');
            expect(manifest.capture).toHaveProperty('actualFramesCaptured', 1);
            expect(manifest.capture).toHaveProperty('preRollSeconds', 1);
            expect(manifest.capture).toHaveProperty('postRollSeconds', 3);
            expect(manifest.capture).toHaveProperty('expectedCaptureSeconds', 103);
            expect(manifest.buffers).toHaveProperty('spectrum');
            expect(manifest.buffers).toHaveProperty('leveltrail');
            expect(manifest.runtime).toHaveProperty('renderFrameAtStart', 42);
            expect(manifest.runtime).toHaveProperty('renderFrameAtStop', 100);
            expect(manifest.binaryStreams).toHaveProperty('spectrumTotalBytes', 16384);
            expect(manifest.binaryStreams).toHaveProperty('leveltrailTotalBytes', 6400);
        });

        it('includes FPS estimate', async () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();
            rec.appendFrame(makeSpectrumBytes(), makeLeveltrailBytes(), 1);
            // Give enough time for a measurable duration
            await new Promise(r => setTimeout(r, 10));
            rec.finalize(1);

            const manifest = rec.buildManifest();
            const fps = manifest.capture as Record<string, unknown>;
            expect(typeof fps.fpsEstimate).toBe('number');
        });

        it('includes known probe SHA-256', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();
            rec.finalize(0);

            const manifest = rec.buildManifest();
            const probe = manifest.probe as Record<string, unknown>;
            expect(probe.knownSha256).toBe('71f8b3efbd2e4919ba7e0919315e3999d6bbe477174a6dcb24e274680eac24e6');
        });
    });

    describe('status', () => {
        it('returns idle status before start', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            const status = rec.getStatus();
            expect(status.state).toBe('idle');
            expect(status.framesCaptured).toBe(0);
        });

        it('returns running status after start', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();
            const status = rec.getStatus();
            expect(status.state).toBe('running');
        });

        it('returns non-zero expected frames', () => {
            const rec = new BlinkAudioProbeSessionRecorder(
                makeOptions({
                    expectedDurationSeconds: 10,
                    preRollSeconds: 0,
                    postRollSeconds: 0,
                }),
                0
            );
            rec.start();
            const status = rec.getStatus();
            expect(status.expectedFramesApprox).toBeGreaterThan(0);
            expect(status.totalExpectedDurationMs).toBe(10000);
        });
    });

    describe('destroy', () => {
        it('clears all data on destroy', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();
            rec.appendFrame(makeSpectrumBytes(), makeLeveltrailBytes(), 1);
            rec.destroy();

            expect(rec.framesCaptured).toBe(0);
            expect(rec.spectrumTotalBytes).toBe(0);
            expect(rec.leveltrailTotalBytes).toBe(0);
        });
    });

    describe('frame ownership', () => {
        // The texture runtime hands over views of buffers it rewrites every frame. A recorder that
        // stored the views would write the last frame out once per frame.
        it('keeps each frame as it was when it was appended, though the caller overwrites its buffer', () => {
            const rec = new BlinkAudioProbeSessionRecorder(makeOptions(), 0);
            rec.start();
            const spectrum = new Float32Array(4096);
            const trail = new Float32Array(1600);

            for (const level of [0.25, 0.5, 0.75]) {
                spectrum.fill(level);
                trail.fill(level / 2);
                rec.appendFrame(
                    new Uint8Array(spectrum.buffer, spectrum.byteOffset, spectrum.byteLength),
                    new Uint8Array(trail.buffer, trail.byteOffset, trail.byteLength),
                    1
                );
            }

            const spectrumBin = new Float32Array(rec.buildSpectrumBin().buffer);
            const trailBin = new Float32Array(rec.buildLeveltrailBin().buffer);
            expect([spectrumBin[0], spectrumBin[4096], spectrumBin[8192]]).toEqual([0.25, 0.5, 0.75]);
            expect([trailBin[0], trailBin[1600], trailBin[3200]]).toEqual([0.125, 0.25, 0.375]);
        });
    });
});
