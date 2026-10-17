import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBlinkFx } from '../src/packages/blinkfx/loader';
import { validateBlinkFxManifest } from '../src/packages/blinkfx/validate';
import { convertSsfScene } from '../src/packages/ssf/convert/convertSsfScene';
import {
    packSsfAudio,
    SsfJuiced,
    ssfRawSpectrum,
    SsfSmooth,
    SsfTimeSeries,
    ssfWaveform,
} from '../src/packages/ssf/original/arrays';
import { MAIN_BANDS } from '../src/packages/ssf/original/bands';
import { SsfBandState } from '../src/packages/ssf/original/bandState';
import { SsfBpmTracker } from '../src/packages/ssf/original/bpm';
import { ssfBandIntegrate, SsfFrontend } from '../src/packages/ssf/original/frontend';
import { floatWords } from '../src/packages/ssf/original/math';
import { SsfOriginalProvider } from '../src/packages/ssf/original/provider';
import { ssfReadbackCoordinate, ssfReadbackRgb } from '../src/packages/ssf/original/readback';
import { SsfScalarBank } from '../src/packages/ssf/original/scalars';
import { SSF_HELPER_BLOCKS } from '../src/packages/ssf/profile/helperLibrary';
import { findSsfScenes, readSsfScene } from './lib/ssfDirectory';

const outputIndex = process.argv.indexOf('--output');
if (outputIndex < 0 || process.argv[outputIndex + 1] === undefined)
    throw new Error('Usage: vite-node scripts/ssf-conformance.ts --output <directory>');
const output = process.argv[outputIndex + 1];
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(root, 'src/packages/ssf/original/__tests__/fixtures');
const hashes: Record<string, string> = {};
function bytes(name: string): Buffer {
    const data = readFileSync(join(fixtureRoot, name));
    hashes[name] = createHash('sha256').update(data).digest('hex');
    return data;
}
function fixture<T>(name: string): T {
    return JSON.parse(bytes(name).toString()) as T;
}
interface Score {
    field: string;
    scope: string;
    count: number;
    differingWords?: number;
    firstDifference?: string | null;
    maxAbs: number;
    maxRelative?: number;
    limit: number;
    status: 'PASS' | 'FAIL';
}
const scores: Score[] = [];
function word(value: number): number {
    return new Uint32Array(new Float32Array([value]).buffer)[0];
}
function error(
    actual: ArrayLike<number>,
    expected: ArrayLike<number>,
    scale?: number
): { absolute: number; relative: number } {
    let absolute = 0;
    let denominator = 1e-30;
    if (actual.length !== expected.length)
        return { absolute: Number.POSITIVE_INFINITY, relative: Number.POSITIVE_INFINITY };
    for (let i = 0; i < actual.length; i++) {
        denominator = Math.max(denominator, Math.abs(expected[i]) || 0);
        if (Object.is(actual[i], expected[i]) || (Number.isNaN(actual[i]) && Number.isNaN(expected[i]))) continue;
        absolute = Math.max(
            absolute,
            Number.isFinite(actual[i]) && Number.isFinite(expected[i])
                ? Math.abs(actual[i] - expected[i])
                : Number.POSITIVE_INFINITY
        );
    }
    return { absolute, relative: absolute / (scale ?? denominator) };
}
interface ScalarFrame {
    band: number[];
    z: number[];
    mean: number[];
    raw: number;
    bpm: number;
    confidence: number;
    dt: number;
    output: Record<string, number>;
}
const scalar = fixture<{ cases: Array<{ r: number; q: number; frames: ScalarFrame[] }> }>('native-scalars.json');
const scalarScores = new Map<string, Score>();
for (const [scenarioIndex, scenario] of scalar.cases.entries()) {
    const bank = new SsfScalarBank();
    for (const [index, frame] of scenario.frames.entries()) {
        const actual = bank.update(
            { ...frame, band: floatWords(frame.band), z: floatWords(frame.z), mean: floatWords(frame.mean) },
            scenario.r,
            scenario.q,
            frame.dt
        );
        for (const [field, expected] of Object.entries(frame.output)) {
            const score = scalarScores.get(field) ?? {
                field,
                scope: 'fresh x86 native getters; 3 stateful 90-frame r/q/dt scenarios',
                count: 0,
                differingWords: 0,
                firstDifference: null,
                maxAbs: 0,
                limit: 0,
                status: 'PASS',
            };
            score.count++;
            if (word(actual[field]) !== expected) {
                score.differingWords = (score.differingWords ?? 0) + 1;
                score.firstDifference ??= `scenario ${scenarioIndex}, frame ${index}`;
                score.status = 'FAIL';
            }
            score.maxAbs = Math.max(score.maxAbs, Math.abs(actual[field] - floatWords([expected])[0]));
            scalarScores.set(field, score);
        }
    }
}
scores.push(...scalarScores.values());
const states = fixture<{ rows: Array<{ input: number; raw: number; mean: number; z: number; band: number }> }>(
    'native-bandstates.json'
);
for (const field of ['raw', 'mean', 'z', 'band'] as const) {
    const state = new SsfBandState();
    let differingWords = 0;
    let maxAbs = 0;
    let firstDifference: string | null = null;
    for (const [index, row] of states.rows.entries()) {
        state.push(row.input);
        if (word(state[field]) !== word(row[field])) {
            differingWords++;
            firstDifference ??= String(index);
        }
        maxAbs = Math.max(maxAbs, Math.abs(state[field] - row[field]));
    }
    scores.push({
        field: `BandState.${field}`,
        scope: 'fresh x86; 600 updates; three ring wraps',
        count: states.rows.length,
        differingWords,
        maxAbs,
        firstDifference,
        limit: 0,
        status: differingWords === 0 ? 'PASS' : 'FAIL',
    });
}
const frontend = fixture<{
    cases: Array<{
        name: string;
        pcm: number[];
        real: number[];
        imag: number[];
        power: number[];
        bands: number[];
        features: number[];
    }>;
}>('native-frontend.json');
for (const scenario of frontend.cases) {
    const model = new SsfFrontend();
    model.process(new Float32Array(2048));
    model.process(floatWords(scenario.pcm));
    const real = floatWords(scenario.real);
    const imag = floatWords(scenario.imag);
    const complexScale = Math.max(...real.map((value, index) => Math.hypot(value, imag[index])));
    for (const field of ['real', 'imag', 'power', 'bands', 'features'] as const) {
        const measured = error(
            model[field],
            floatWords(scenario[field]),
            field === 'real' || field === 'imag' ? complexScale : undefined
        );
        const limit = field === 'bands' ? 1e-4 : field === 'features' ? 2e-4 : 1e-5;
        scores.push({
            field: `Frontend.${scenario.name}.${field}`,
            scope: 'fresh x86; portable FFT compared with IPP p8',
            count: model[field].length,
            maxAbs: measured.absolute,
            maxRelative: measured.relative,
            limit,
            status: measured.relative < limit ? 'PASS' : 'FAIL',
        });
    }
    let differingWords = 0;
    for (const [index, [low, high]] of MAIN_BANDS.entries()) {
        if (word(ssfBandIntegrate(floatWords(scenario.power), low, high)) !== scenario.bands[index]) differingWords++;
    }
    scores.push({
        field: `BandIntegrator.${scenario.name}`,
        scope: 'fresh native power input',
        count: 5,
        differingWords,
        maxAbs: 0,
        limit: 0,
        status: differingWords === 0 ? 'PASS' : 'FAIL',
    });
}
interface Slice {
    offset: number;
    length: number;
}
const arrays = fixture<{
    cases: Array<{
        r: number;
        frames: Array<{ inputs: Record<string, Slice>; bands: number[]; outputs: Record<string, Slice> }>;
    }>;
}>('native-arrays.json');
const arrayBytes = bytes('native-arrays.bin');
const arrayData = new Float32Array(arrayBytes.buffer, arrayBytes.byteOffset, arrayBytes.length / 4);
const vector = (slice: Slice): Float32Array => arrayData.subarray(slice.offset, slice.offset + slice.length);
for (const scenario of arrays.cases) {
    const juiced = new SsfJuiced();
    const smooth = new SsfSmooth();
    const trails = Array.from({ length: 4 }, () => new SsfTimeSeries());
    const perField = new Map<string, Score>();
    for (const frame of scenario.frames) {
        const actual = {
            'syn_Spectrum (Raw)': ssfRawSpectrum(vector(frame.inputs['13']), scenario.r),
            syn_SpectrumJuiced: juiced.update(vector(frame.inputs['13']), scenario.r),
            syn_SpectrumSmooth: smooth.update(vector(frame.inputs['14']), scenario.r),
            syn_Waveform: ssfWaveform(vector(frame.inputs['15']), scenario.r),
            syn_TimeSeries: trails[0].update(frame.bands[0]),
            syn_BassTimeSeries: trails[1].update(frame.bands[1]),
            syn_MidTimeSeries: trails[2].update(frame.bands[2]),
            syn_HighTimeSeries: trails[3].update(frame.bands[3]),
        };
        for (const [field, data] of Object.entries(actual)) {
            const measured = error(data, vector(frame.outputs[field]));
            const score = perField.get(field) ?? {
                field: `${field}@r=${scenario.r}`,
                scope: 'fresh x86 native vectors; 6 sequential updates',
                count: 0,
                maxAbs: 0,
                maxRelative: 0,
                limit: 3e-6,
                status: 'PASS',
            };
            score.count += data.length;
            score.maxAbs = Math.max(score.maxAbs, measured.absolute);
            score.maxRelative = Math.max(score.maxRelative ?? 0, measured.relative);
            if (measured.relative >= score.limit) score.status = 'FAIL';
            perField.set(field, score);
        }
    }
    scores.push(...perField.values());
}
const bpm = fixture<{ rows: Array<{ bpm: number; confidence: number; candidate: number }> }>('bpm.json');
const bpmBytes = bytes('bpm-histories.bin');
const histories = new Float32Array(bpmBytes.buffer, bpmBytes.byteOffset, bpmBytes.length / 4);
const tracker = new SsfBpmTracker();
const bpmErrors = { bpm: 0, confidence: 0, candidate: 0 };
for (const [index, row] of bpm.rows.entries()) {
    const bands = Array.from({ length: 22 }, (_, band) =>
        histories.subarray((index * 22 + band) * 1024, (index * 22 + band + 1) * 1024)
    );
    for (let hop = 0; hop < 12; hop++) tracker.update(bands);
    bpmErrors.bpm = Math.max(bpmErrors.bpm, Math.abs(tracker.bpm - row.bpm));
    bpmErrors.confidence = Math.max(bpmErrors.confidence, Math.abs(tracker.confidence - row.confidence));
    bpmErrors.candidate = Math.max(bpmErrors.candidate, Math.abs(tracker.rawCandidate - row.candidate));
}
for (const [field, maxAbs] of Object.entries(bpmErrors)) {
    const limit = field === 'confidence' ? 1e-6 : 0.01;
    scores.push({
        field: `BPM.${field}`,
        scope: '15 supplied native history captures; not a fresh BlinkFX PCM-to-BPM proof',
        count: bpm.rows.length,
        maxAbs,
        limit,
        status: maxAbs < limit ? 'PASS' : 'FAIL',
    });
}
const edge = new Float32Array([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0]);
const packed = packSsfAudio([edge, edge, edge, edge]);
const packPass = packed[0] === 2 && packed[4] === 2 && Object.is(packed[8], 0) && Object.is(packed[12], 0);
scores.push({
    field: 'TexturePacker.edges',
    scope: 'native MINSS/MAXSS rule: NaN,+Inf,-Inf,-0',
    count: 16,
    maxAbs: packPass ? 0 : 1,
    limit: 0,
    status: packPass ? 'PASS' : 'FAIL',
});
const peaks = fixture<{ cases: Array<{ name: string; pcm: number[]; peak: number }> }>('native-peaks.json');
for (const scenario of peaks.cases) {
    const model = new SsfFrontend();
    model.process(floatWords(scenario.pcm));
    const maxAbs = Math.abs(model.features[0] - scenario.peak);
    scores.push({
        field: `F1.${scenario.name}`,
        scope: 'fresh original 008C0BF0: positive finite maximum, not maximum absolute value',
        count: 2048,
        maxAbs,
        limit: 0,
        status: maxAbs === 0 ? 'PASS' : 'FAIL',
    });
}
const pipeline = fixture<{
    pcm: Slice;
    cases: Array<{
        r: number;
        q: number;
        frames: Array<{ scalars: Record<string, number>; arrays: Record<string, Slice> }>;
    }>;
}>('native-pipeline.json');
const pipelineBytes = bytes('native-pipeline.bin');
const pipelineData = new Float32Array(pipelineBytes.buffer, pipelineBytes.byteOffset, pipelineBytes.length / 4);
const pcm = pipelineData.subarray(pipeline.pcm.offset, pipeline.pcm.offset + pipeline.pcm.length);
for (const scenario of pipeline.cases) {
    const provider = new SsfOriginalProvider();
    const results = new Map<string, Score>();
    const measure = (
        name: string,
        actual: Float32Array,
        expected: Float32Array,
        frame: number,
        array: boolean
    ): void => {
        const field = `Pipeline.${name}@r=${scenario.r},q=${scenario.q}`;
        const limit = name === 'syn_BPM' ? 0.01 : 1e-4;
        const score = results.get(field) ?? {
            field,
            scope: '60 fresh native PCM-to-publication frames; unit-floor scalar normalization, absolute arrays; portable profile',
            count: 0,
            differingWords: 0,
            firstDifference: null,
            maxAbs: 0,
            maxRelative: 0,
            limit,
            status: 'PASS',
        };
        for (const [index, value] of actual.entries()) {
            const same = Object.is(value, expected[index]) || (Number.isNaN(value) && Number.isNaN(expected[index]));
            const difference = same
                ? 0
                : !Number.isFinite(value) || !Number.isFinite(expected[index])
                  ? Number.POSITIVE_INFINITY
                  : Math.abs(value - expected[index]);
            const normalized =
                array || name === 'syn_BPM' ? difference : difference / Math.max(1, Math.abs(expected[index]));
            score.count++;
            score.maxAbs = Math.max(score.maxAbs, difference);
            score.maxRelative = Math.max(score.maxRelative ?? 0, normalized);
            if (word(value) !== word(expected[index])) {
                score.differingWords = (score.differingWords ?? 0) + 1;
                score.firstDifference ??= `frame ${frame}, element ${index}`;
            }
            if (normalized > limit) score.status = 'FAIL';
        }
        results.set(field, score);
    };
    for (const [index, frame] of scenario.frames.entries()) {
        provider.process({
            samples: pcm.subarray(index * 512, (index + 1) * 512),
            sampleRate: 44100,
            firstSample: index * 512,
            sourceEpoch: 0,
        });
        const snapshot = provider.snapshot(1 / 60, scenario.r, scenario.q);
        for (const [name, value] of Object.entries(frame.scalars))
            measure(
                name,
                new Float32Array([snapshot.signals.get(name)?.value as number]),
                new Float32Array([value]),
                index,
                false
            );
        for (const [name, slice] of Object.entries(frame.arrays)) {
            const target = name === 'syn_Spectrum (Raw)' ? 'syn_Spectrum' : name;
            measure(
                target,
                snapshot.signals.get(target)?.value as Float32Array,
                pipelineData.subarray(slice.offset, slice.offset + slice.length),
                index,
                true
            );
        }
    }
    provider.destroy();
    scores.push(...results.values());
}
const readback = fixture<{
    rows: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        pixel: number[];
        rgbBytes: number[];
        rgbWords: number[];
    }>;
}>('native-readback.json');
let readbackDifferences = 0;
for (const row of readback.rows) {
    if (ssfReadbackCoordinate(floatWords([row.x])[0], row.width) !== row.pixel[0]) readbackDifferences++;
    if (ssfReadbackCoordinate(floatWords([row.y])[0], row.height) !== row.pixel[1]) readbackDifferences++;
    for (const [index, value] of ssfReadbackRgb(new Uint8Array(row.rgbBytes)).entries()) {
        if (word(value) !== row.rgbWords[index]) readbackDifferences++;
    }
}
scores.push({
    field: 'FinalPass.coordinateRgbBoundary',
    scope: '34 supplied native readback traces; pixel coordinates and binary32 RGB byte normalization only; no live GPU hook',
    count: readback.rows.length * 5,
    differingWords: readbackDifferences,
    maxAbs: 0,
    limit: 0,
    status: readbackDifferences === 0 ? 'PASS' : 'FAIL',
});
const report = {
    sourceContract: 'SSF-1.25.2-native-gpu-closure-2026-10-13',
    binarySha256: 'df45b2021c458a77b653bc27a9689d161acab80f6466fa8feaf3a0820636f256',
    environment: {
        platform: platform(),
        osRelease: release(),
        cpu: cpus()[0]?.model,
        node: process.version,
        exoVersion: '0.19.1',
        numericalProfile: 'portable-f64-FFT; captured Blackman; PC53/Zen2 Smooth weights',
    },
    verdict: scores.some(score => score.status === 'FAIL') ? 'FAIL' : 'QUALIFIED_PASS',
    releaseGate: 'NOT_ACCEPTED: VM/full native GPU/end-to-end/ExoJS v0.20/musical benchmark remain unqualified',
    fixtureSha256: hashes,
    scores,
    helperNames: SSF_HELPER_BLOCKS.flatMap(block => block.provides),
};
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'numeric-report.json'), `${JSON.stringify(report, null, 2)}\n`);
const csv = [
    'field,status,count,maxAbs,maxRelative,limit,differingWords,scope',
    ...scores.map(score =>
        [
            score.field,
            score.status,
            score.count,
            score.maxAbs,
            score.maxRelative ?? '',
            score.limit,
            score.differingWords ?? '',
            score.scope,
        ]
            .map(value => JSON.stringify(String(value)))
            .join(',')
    ),
];
writeFileSync(join(output, 'numeric-scores.csv'), `${csv.join('\n')}\n`);
const corpus: Array<{ scene: string; sourceSha256: string; status: string; irLoaded: boolean; issues: string[] }> = [];
for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] !== '--corpus') continue;
    for (const directory of findSsfScenes(process.argv[++index])) {
        const scene = readSsfScene(directory);
        const converted = convertSsfScene(scene);
        let irLoaded = false;
        if (converted.report.status !== 'failed' && validateBlinkFxManifest(converted.manifest).valid) {
            loadBlinkFx(converted.manifest, 'corpus-check');
            irLoaded = true;
        }
        corpus.push({
            scene: scene.slug,
            sourceSha256: createHash('sha256')
                .update(JSON.stringify(scene.sceneJson))
                .update(scene.mainGlsl)
                .update(scene.scriptJs ?? '')
                .digest('hex'),
            status: converted.report.status,
            irLoaded,
            issues: [...new Set(converted.report.issues.map(issue => issue.code))],
        });
    }
}
if (corpus.length > 0)
    writeFileSync(
        join(output, 'corpus-report.json'),
        `${JSON.stringify(
            {
                scope: 'conversion/schema/IR loading; GLSL GPU compilation and original scene pixels not qualified',
                count: corpus.length,
                statuses: Object.fromEntries(
                    ['complete', 'approximate', 'failed'].map(status => [
                        status,
                        corpus.filter(scene => scene.status === status).length,
                    ])
                ),
                scenes: corpus,
            },
            null,
            2
        )}\n`
    );
console.log(
    JSON.stringify({
        verdict: report.verdict,
        scores: scores.length,
        failed: scores.filter(score => score.status === 'FAIL'),
        output,
    })
);
if (report.verdict === 'FAIL') process.exitCode = 1;
