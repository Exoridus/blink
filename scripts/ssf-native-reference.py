"""Run supplied native oracle routines from a verified installed PE in owned emulation."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import pefile
import numpy as np

EXPECTED = 'df45b2021c458a77b653bc27a9689d161acab80f6466fa8feaf3a0820636f256'
parser = argparse.ArgumentParser()
parser.add_argument('--exe', type=Path, required=True)
parser.add_argument('--final', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--test', choices=('frontend', 'bpm', 'generators', 'arrays', 'bandstates', 'pipeline', 'peaks'), default='frontend')
parser.add_argument('--capture', action='store_true')
args = parser.parse_args()
digest = hashlib.sha256(args.exe.read_bytes()).hexdigest()
if digest != EXPECTED:
    raise SystemExit(f'Original binary hash mismatch: {digest}')
args.output.mkdir(parents=True, exist_ok=True)
memory = args.output / 'memory_blocks'
memory.mkdir(exist_ok=True)
pe = pefile.PE(str(args.exe), fast_load=True)
sys.path.insert(0, str(args.final.parent / 'work/tools'))
sys.path.insert(0, str(args.final / 'reference'))
import native_audio
for name, address in native_audio.SECTIONS:
    if name.startswith('Headers'):
        data = pe.get_data(0, pe.OPTIONAL_HEADER.SizeOfHeaders)
    else:
        section = next(section for section in pe.sections if pe.OPTIONAL_HEADER.ImageBase + section.VirtualAddress == address)
        data = section.get_data()[:section.Misc_VirtualSize]
        data += b'\0' * (section.Misc_VirtualSize - len(data))
    (memory / name).write_bytes(data)
native_audio.MEMB = memory
test_name = 'generators' if args.test in ('bandstates', 'pipeline') else 'frontend' if args.test == 'peaks' else args.test
test = args.final / f'tests/test_{test_name}_native.py'
spec = importlib.util.spec_from_file_location('ssf_native_oracle', test)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.LOG = args.output / f'fresh_{args.test}_native_report.txt'
if args.test == 'frontend': module.FIX = args.output / 'fresh_native_frontend_fixture.npz'
print(f'Fresh owned Unicorn execution: {args.test}; SHA256={digest}', flush=True)
if args.test == 'peaks':
    cases = []
    for name, samples in (('negative_dc', np.full(2048, -0.75, dtype=np.float32)),
                          ('asymmetric_peak', np.tile(np.array([0.25, -0.75], dtype=np.float32), 1024)),
                          ('nonfinite_peak', np.tile(np.array([np.inf, -np.inf, np.nan, 0.25], dtype=np.float32), 512))):
        capture = module.Native().run(samples)
        peak = float(capture['features'][0])
        cases.append({'name': name, 'pcm': samples.view(np.uint32).tolist(), 'peak': peak})
        print(f'{name}: native F1={peak}', flush=True)
    (args.output / 'fresh-peaks.json').write_text(json.dumps({'cases': cases, 'binarySha256': digest}, separators=(',', ':')) + '\n', newline='\n')
    sys.exit(0)
if args.test == 'pipeline':
    array_spec = importlib.util.spec_from_file_location('ssf_native_arrays', args.final / 'tests/test_arrays_native.py')
    array_module = importlib.util.module_from_spec(array_spec)
    array_spec.loader.exec_module(array_module)
    for name, selector in (('syn_BassTimeSeries', 2), ('syn_MidTimeSeries', 5), ('syn_HighTimeSeries', 6)):
        array_module.SPEC[name] = (0x008C25C0, selector, 0x008C27A0, 'timeseries')
    data, cases = [], []
    length = 0
    def capture(values):
        global length
        vector = np.asarray(values, dtype=np.float32).ravel()
        result = {'offset': length, 'length': len(vector)}
        data.append(vector); length += len(vector)
        return result
    samples = (0.6 * np.sin(2 * np.pi * 220 * np.arange(60 * 512) / 44100)
               + 0.15 * np.random.default_rng(7).standard_normal(60 * 512)).astype(np.float32)
    samples[20000:24000] = 0
    pcm = capture(samples)
    for r, q in ((0.3, 0.8), (0.7, 0.3)):
        generators = module.Replay(); generators.set_rq(r, q)
        arrays = array_module.Replay(); arrays.set_r(r)
        frames = []
        for frame in range(60):
            values = [float(value) for value in samples[frame * 512:(frame + 1) * 512]]
            for replay in (generators, arrays):
                replay.m.call(0x008CC840, [replay.m.make_vector(values)], ecx=replay.engine)
            scalar_output = {name: float(np.float32(generators.tick_update(name))) for name in module.SPEC}
            array_output = {name: capture(arrays.tick(name)) for name in array_module.SPEC}
            frames.append({'scalars': scalar_output, 'arrays': array_output})
            if frame % 20 == 19: print(f'Native pipeline r={r}: {frame + 1}/60 frames', flush=True)
        cases.append({'r': float(np.float32(r)), 'q': float(np.float32(q)), 'frames': frames})
    np.concatenate(data).astype('<f4').tofile(args.output / 'fresh-pipeline.bin')
    (args.output / 'fresh-pipeline.json').write_text(json.dumps({'cases': cases, 'pcm': pcm, 'binarySha256': digest,
        'evidence': 'Fresh PCM through original engine/frontend/getters and independently owned original scalar/array constructors; PC53/IPP p8; 512 PCM samples and one render tick per frame'}, separators=(',', ':')) + '\n', newline='\n')
    print('Captured 2 x 60 native complete PCM-to-publication frames', flush=True)
    sys.exit(0)
if args.test == 'bandstates':
    machine = module.AudioMachine()
    state = machine.alloc(0x40)
    machine.call(0x008C8380, [173], ecx=state)
    values = np.random.default_rng(41).uniform(0, 1, 600).astype(np.float32)
    values[:8] = (0, 0, 0.25, 0.5, 0.125, 0, 1, 0)
    rows = []
    for value in values:
        machine.call(0x008C8550, [('f', float(value))], ecx=state)
        rows.append({'input': float(value), **{name: float(machine.call_st0(address, ecx=state))
            for name, address in (('band', 0x008C8730), ('z', 0x008C8750), ('mean', 0x008C8790), ('raw', 0x008C87B0))}})
    edge_rows = []
    for inputs in ((np.nan, 0, 0.25), (np.inf, 0, 0.25), (-np.inf, 0, 0.25)):
        edge_state = machine.alloc(0x40)
        machine.call(0x008C8380, [173], ecx=edge_state)
        for value in inputs:
            machine.call(0x008C8550, [('f', float(value))], ecx=edge_state)
            edge_rows.append({'input': int(np.float32(value).view(np.uint32)), **{name: int(np.float32(machine.call_st0(address, ecx=edge_state)).view(np.uint32))
                for name, address in (('band', 0x008C8730), ('z', 0x008C8750), ('mean', 0x008C8790), ('raw', 0x008C87B0))}})
    (args.output / 'fresh-bandstates.json').write_text(json.dumps({'rows': rows, 'edgeRows': edge_rows, 'binarySha256': digest}, separators=(',', ':')) + '\n', newline='\n')
    print('Captured 600 original band-state updates including three ring wraps', flush=True)
    sys.exit(0)
if args.capture and args.test == 'arrays':
    for name, selector in (('syn_BassTimeSeries', 2), ('syn_MidTimeSeries', 5), ('syn_HighTimeSeries', 6)):
        module.SPEC[name] = (0x008C25C0, selector, 0x008C27A0, 'timeseries')
    data = []
    cases = []
    def capture(values):
        vector = np.asarray(values, dtype=np.float32).ravel()
        offset = sum(len(item) for item in data)
        data.append(vector)
        return {'offset': offset, 'length': len(vector)}
    samples = (np.sin(2 * np.pi * 220 * np.arange(6 * 512) / 44100) * 0.6
               + np.random.default_rng(7).standard_normal(6 * 512) * 0.15).astype(np.float32)
    for r in (0.3, 0.7):
        replay = module.Replay()
        replay.set_r(r)
        frames = []
        for frame in range(6):
            vector = replay.m.make_vector([float(value) for value in samples[frame * 512:(frame + 1) * 512]])
            replay.m.call(0x008CC840, [vector], ecx=replay.engine)
            inputs = {str(key): capture(replay.key_vector(key)) for key in (13, 14, 15)}
            bands = [replay.m.call_st0(module.GET_BAND, [key], ecx=replay.ctx) for key in (0, 2, 5, 6)]
            outputs = {name: capture(replay.tick(name)) for name in module.SPEC}
            frames.append({'inputs': inputs, 'bands': bands, 'outputs': outputs})
        cases.append({'r': float(np.float32(r)), 'frames': frames})
    np.concatenate(data).astype('<f4').tofile(args.output / 'fresh-arrays.bin')
    (args.output / 'fresh-arrays.json').write_text(json.dumps({'cases': cases, 'binarySha256': digest,
        'evidence': 'Fresh native array updates under Unicorn PC53, native input vectors, all four TimeSeries selectors'}, separators=(',', ':')) + '\n', newline='\n')
    print('Captured 2 x 6 x 8 fresh original array outputs', flush=True)
    sys.exit(0)
if args.capture and args.test == 'generators':
    def words(values): return np.asarray(values, dtype=np.float32).view(np.uint32).ravel().tolist()
    cases = []
    for r, q, delta in ((0.5, 0.5, 1 / 60), (0.3, 0.8, 1 / 60), (0.7, 0.3, 0.5)):
        module.DT = delta
        replay = module.Replay()
        replay.set_rq(r, q)
        samples = (0.6 * np.sin(2 * np.pi * 220 * np.arange(90 * 512) / 44100)
                   + 0.15 * np.random.default_rng(7).standard_normal(90 * 512)).astype(np.float32)
        samples[20000:24000] = 0
        frames = []
        for frame in range(90):
            chunk = samples[frame * 512:(frame + 1) * 512]
            vector = replay.m.make_vector([float(value) for value in chunk])
            replay.m.call(0x008CC840, [vector], ecx=replay.engine)
            band = [replay.getter(module.GET_BAND, i) for i in range(10)]
            z = [replay.getter(module.GET_BAND2, i) for i in range(10)]
            mean = [replay.getter(module.GET_PRES, i) for i in range(10)]
            raw = replay.getter(module.GET_RAW, 0)
            bpm = replay.getter(module.GET_BANDU, 11)
            confidence = replay.getter(module.GET_BANDU, 12)
            output = {name: words([replay.tick_update(name)])[0] for name in module.SPEC}
            frames.append({'band': words(band), 'z': words(z), 'mean': words(mean), 'raw': raw,
                           'bpm': bpm, 'confidence': confidence, 'dt': float(np.float32(delta)), 'output': output})
        cases.append({'r': float(np.float32(r)), 'q': float(np.float32(q)), 'frames': frames})
    (args.output / 'fresh-scalars.json').write_text(json.dumps({'cases': cases, 'binarySha256': digest,
        'evidence': 'Fresh original ctor/update/getter execution under Unicorn, PC53/MXCSR1F80/IPP p8, controlled CRT seed1'}, separators=(',', ':')) + '\n', newline='\n')
    print('Captured 3 x 90 x 43 fresh original scalar outputs', flush=True)
    sys.exit(0)
sys.exit(module.main())
