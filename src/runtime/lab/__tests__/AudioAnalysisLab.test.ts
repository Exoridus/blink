import { describe, expect, it } from 'vitest';

import { loadBlinkFx } from '../../../packages/blinkfx/loader';
import { AudioAnalysisLab } from '../AudioAnalysisLab';

const effect = loadBlinkFx(
    {
        format: 'blinkfx/1',
        id: 'test.lab',
        title: 'Lab',
        shaders: { glsl: 'main.glsl' },
        controls: [{ name: 'gain', type: 'float', default: 0.5, min: 0, max: 1 }],
    },
    '/fixture'
);

describe('Audio Analysis Lab replay and independent state', () => {
    it('keeps a bounded summary report without retaining past audio snapshots', async () => {
        const lab = new AudioAnalysisLab(effect, new Float32Array(44100), { reportFrameLimit: 2 });
        for (let index = 0; index < 3; index++) await lab.step();
        const report = lab.report();
        expect(report.frames).toHaveLength(2);
        expect(report.metadata).toMatchObject({ totalFrames: 3, retainedFrames: 2, firstRetainedFrame: 1 });
        expect(report.frames[0]).not.toHaveProperty('a');
        expect(report.frames[0]).not.toHaveProperty('snapshot');
        lab.destroy();
    });
    it('runs scripts before current scalar publication and resets script state on replay', async () => {
        const lab = new AudioAnalysisLab(effect, new Float32Array(44100).fill(0.25), {
            scriptSource: `var calls=0; function update(dt){calls++;setUniform('seen',syn_InputLevel);setUniform('calls',calls);setUniform('frameSeen',FRAMECOUNT);setUniform('timeSeen',TIME);setUniform('deltaSeen',TIMEDELTA);}`,
        });
        const first = await lab.step();
        expect(first.a.uniforms.seen).toBe(0);
        expect(first.a.uniforms.calls).toBe(2);
        expect(first.a.uniforms.frameSeen).toBe(0);
        expect(first.a.snapshot.signals.get('syn_InputLevel')?.value).toBe(0.25);
        const second = await lab.step();
        expect(second.a.uniforms.seen).toBe(0.25);
        expect(second.a.uniforms.calls).toBe(3);
        expect(second.a.uniforms.frameSeen).toBe(1);
        expect(second.a.uniforms.timeSeen).toBe(Math.fround(1 / 60));
        expect(second.a.uniforms.deltaSeen).toBe(Math.fround(1 / 60));
        expect(second.a.uniforms).toEqual(second.b.uniforms);
        const replay = await lab.seek(1);
        expect(replay.a.uniforms).toEqual(second.a.uniforms);
        lab.destroy();
    });
    it('compares original against original without shared state', async () => {
        const lab = new AudioAnalysisLab(effect, new Float32Array(44100).fill(0.25));
        const first = await lab.step();
        expect(first.comparison.scalarMaxAbs).toBe(0);
        expect(first.comparison.spectrum.maxAbs).toBe(0);
        expect(first.comparison.levelTrail.maxAbs).toBe(0);
        expect(first.frame).toBe(0);
        expect(first.a.snapshot).not.toBe(first.b.snapshot);
        expect(first.a.snapshot.spectrum).not.toBe(first.b.snapshot.spectrum);
        expect(first.a.snapshot.instant).toEqual(first.b.snapshot.instant);
    });
    it('mirrors controls, labels overrides and reconstructs seek from source start', async () => {
        const lab = new AudioAnalysisLab(effect, new Float32Array(44100).fill(0.25));
        lab.setControl('gain', 0.8);
        const first = await lab.step();
        expect(first.a.controls.gain).toBe(first.b.controls.gain);
        lab.setControl('gain', 0.2, 'b');
        const second = await lab.step();
        expect(second.validity).toContain('CONTROL_MISMATCH');
        const replay = await lab.seek(1);
        expect(replay.a.snapshot.spectrum).toEqual(second.a.snapshot.spectrum);
        expect(replay.a.controls).toEqual(second.a.controls);
        expect(replay.b.controls).toEqual(second.b.controls);
        expect(replay.a.snapshot.instant.sourceEpoch).not.toBe(second.a.snapshot.instant.sourceEpoch);
    });
    it('exports distinct verdict axes and transaction provenance', async () => {
        const lab = new AudioAnalysisLab(effect, new Float32Array(44100));
        lab.setControl('gain', 0.6);
        await lab.step();
        const report = lab.report();
        expect(report.verdicts).toEqual({
            ssfParity: 'INCONCLUSIVE',
            musicalAccuracy: 'UNKNOWN',
            visualPreference: 'UNKNOWN',
        });
        expect(report.transactions).toHaveLength(1);
        expect(report.transactions[0].source).toBe('user');
    });
});
