"""Export portable BlinkFX fixtures from the separately supplied SSF oracle."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('final', type=Path)
parser.add_argument('--native-frontend', type=Path)
parser.add_argument('--native-scalars', type=Path)
args = parser.parse_args()
sys.path.insert(0, str(args.final / 'reference'))
from syn_ssf import arrays, band_tables, constants, frontend, uniforms as U

def native_positive_peak(frame):
    peak = np.float32(0)
    for value in frame:
        if np.isfinite(value) and value > peak:
            peak = value
    return np.float32(peak)

# 008C0BF0 compares original finite samples; abs would overstate negative peaks.
frontend.Analysis._max_abs = staticmethod(native_positive_peak)

target = Path('src/packages/ssf/original')
target.mkdir(parents=True, exist_ok=True)
source = (args.final / 'reference/syn_ssf/constants.py').read_text()
names = re.findall(r'^([A-Z][A-Z0-9_]*) = _s.unpack', source, re.M)
declarations = re.findall(r'^([A-Z][A-Z0-9_]*) = _s.unpack\("<([fd])"', source, re.M)
constant_lines = []
for name, kind in declarations:
    words_value = struct.unpack('<I' if kind == 'f' else '<II', struct.pack('<' + kind, getattr(constants, name)))
    constant_lines.append(f'  {name}: ' + ('float32' if kind == 'f' else 'float64') + '(' + ', '.join(hex(w) for w in words_value) + '),')
constant_text = '\n'.join(constant_lines)
helpers = '''const bytes = new DataView(new ArrayBuffer(8));
function float32(word: number): number {
  bytes.setUint32(0, word, true);
  return bytes.getFloat32(0, true);
}
function float64(low: number, high: number): number {
  bytes.setUint32(0, low, true);
  bytes.setUint32(4, high, true);
  return bytes.getFloat64(0, true);
}
'''
(target / 'constants.ts').write_text(helpers + '\nexport const SSF_CONSTANTS = {\n' + constant_text + '\n} as const;\n', newline='\n')
window = frontend.blackman_window().view(np.uint32).tolist()
weights = arrays.smooth_weights().view(np.uint32).ravel().tolist()
(target / 'tables.json').write_text(json.dumps({'blackman2048': window, 'smoothZen2Pc53': weights}, separators=(',', ':')) + '\n', newline='\n')
(target / 'bands.ts').write_text('\n'.join('export const ' + name + ' = ' + json.dumps(getattr(band_tables, name)) + ' as const;'
                                         for name in ('MAIN_BANDS', 'TABLE_22', 'TABLE_35')) + '\n', newline='\n')

def words(value):
    return np.asarray(value, dtype=np.float32).view(np.uint32).ravel().tolist()

cases = []
for r in (0.0, 0.3, 0.5, 0.7, 1.0):
    juice, smooth, trail = arrays.Juiced(), arrays.Smooth(), arrays.TimeSeries(0)
    frames = []
    for step in range(3):
        power = np.asarray([((i * 17 + step * 31) % 103) / 10000 for i in range(1024)], dtype=np.float32)
        bands = np.asarray([((i + step) % 9) / 100 for i in range(35)], dtype=np.float32)
        wave = np.asarray([((i + step) % 31 - 15) / 10 for i in range(1024)], dtype=np.float32)
        frames.append({'power': words(power), 'bands': words(bands), 'wave': words(wave),
                       'raw': words(arrays.raw_spectrum(power, r)), 'juiced': words(juice.update(power, r)),
                       'smooth': words(smooth.update(1024, bands, r)), 'waveform': words(arrays.waveform(wave, r)),
                       'trail': words(trail.update(step / 4))})
    cases.append({'r': r, 'frames': frames})
manifest = {'authority': 'SSF-1.25.2-native-gpu-closure-2026-10-13',
            'binarySha256': 'df45b2021c458a77b653bc27a9689d161acab80f6466fa8feaf3a0820636f256',
            'evidence': 'MODEL_VERIFIED; exported Python oracle, not fresh native execution',
            'profile': 'PC53, Zen2 RCP seed 0x3ABC1000, CRT ISA>=2; JS scalar transcendental qualification separate',
            'inputs': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                       for p in sorted((args.final / 'reference/syn_ssf').glob('*.py'))}, 'cases': cases}
fixtures = target / '__tests__/fixtures'
fixtures.mkdir(parents=True, exist_ok=True)
(fixtures / 'arrays.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n', newline='\n')
frontend_cases = []
for name in ('silence', 'impulse', 'tone440', 'tone8000', 'sliding'):
    analysis = frontend.Analysis()
    frames = []
    for step in range(4):
        indices = np.arange(step * 512, (step + 1) * 512)
        if name == 'silence': chunk = np.zeros(512, dtype=np.float32)
        elif name == 'impulse':
            chunk = np.zeros(512, dtype=np.float32)
            if step == 0: chunk[0] = 1
        else:
            hz = 8000 if name == 'tone8000' else 440
            chunk = (0.3 * np.sin(2 * np.pi * hz * indices / 44100)).astype(np.float32)
        analysis.process_chunk(chunk)
        frames.append({'pcm': words(chunk), 'history': words(analysis.history), 'real': words(analysis.real),
                       'imag': words(analysis.imag), 'power': words(analysis.power), 'bands': words(analysis.bands),
                       'features': words([analysis.f1, analysis.f2, analysis.f3, analysis.f4, analysis.f5])})
    frontend_cases.append({'name': name, 'frames': frames})
(fixtures / 'frontend.json').write_text(json.dumps({'cases': frontend_cases, 'evidence': manifest['evidence']}, separators=(',', ':')) + '\n', newline='\n')
if args.native_frontend:
    native = np.load(args.native_frontend)
    cases_native = []
    for name in ('impulse', 'dc', 'tone440', 'tone8000', 'noise', 'sweep'):
        indices = np.arange(2048, dtype=np.float64)
        if name == 'impulse':
            pcm = np.zeros(2048, dtype=np.float32)
            pcm[0] = 1
        elif name == 'dc': pcm = np.full(2048, 0.5, dtype=np.float32)
        elif name in ('tone440', 'tone8000'):
            pcm = (0.8 * np.sin(2 * np.pi * (440 if name == 'tone440' else 8000) * indices / 44100)).astype(np.float32)
        elif name == 'noise': pcm = (np.random.default_rng(12345).standard_normal(2048) * 0.25).astype(np.float32)
        else:
            time = indices / 44100
            pcm = (0.7 * np.sin(2 * np.pi * (100 + 8000 * time / (2048 / 44100)) * time)).astype(np.float32)
        fft = native[f'{name}/fft']
        cases_native.append({'name': name, 'pcm': words(pcm), 'real': words(fft[:2048:2]), 'imag': words(fft[1:2048:2]),
                             'power': words(native[f'{name}/power']), 'bands': words(native[f'{name}/bands']),
                             'features': words(native[f'{name}/features'])})
    (fixtures / 'native-frontend.json').write_text(json.dumps({'cases': cases_native, 'binarySha256': manifest['binarySha256'],
        'captureSha256': hashlib.sha256(args.native_frontend.read_bytes()).hexdigest(), 'evidence': 'Fresh owned Unicorn p8/PC53 native capture; Blink replay tested separately'}, separators=(',', ':')) + '\n', newline='\n')
if args.native_scalars:
    scalar_data = json.loads(args.native_scalars.read_text())
    if scalar_data['binarySha256'] != manifest['binarySha256']: raise ValueError('Native scalar binary hash mismatch')
    (fixtures / 'native-scalars.json').write_bytes(args.native_scalars.read_bytes())
scalar_cases = []
for r, q in ((0.3, 0.7), (0.7, 0.3)):
    r, q = float(np.float32(r)), float(np.float32(q))
    rng = [1]
    def rand():
        rng[0] = (rng[0] * 214013 + 2531011) & 0xffffffff
        return (rng[0] >> 16) & 0x7fff
    time, curved, fade, intensity = U.Time(), U.CurvedTime(), U.FadeInOut(), U.Intensity()
    raw, prime, expo = U.RawLevel(), U.PrimeBang(), U.BassExpoCurve()
    onbeat, toggle, random, beat = U.OnBeat(), U.ToggleOnBeat(), U.RandomOnBeat(rand), U.BeatTime()
    twitch = U.BpmTwitcher()
    families = [(prefix, selector, U.Level(), U.Hits(), U.Presence(), U.TimeFamily())
                for prefix, selector in (('', 0), ('Bass', 2), ('Mid', 5), ('MidHigh', 3), ('High', 6))]
    oscillators = [(name, U.BpmOsc(divisor, tri)) for tri in (False, True) for divisor in (1, 2, 4, 8)
                   for name in ['syn_BPM' + ('Tri' if tri else 'Sin') + (str(divisor) if divisor != 1 else '')]]
    frames = []
    for step in range(150):
        band = np.asarray([((step * 3 + i * 7) % 31) / 31 for i in range(10)], dtype=np.float32)
        z = np.asarray([((step + i) % 17) / 3 for i in range(10)], dtype=np.float32)
        mean = np.asarray([((step + i * 2) % 23) / 23 for i in range(10)], dtype=np.float32)
        raw_value, bpm, confidence, dt = map(np.float32, (step / 150, 90 + step % 61, min(step / 100, 1), 1 / 60))
        output = {'TIME': time.update(q, dt), 'syn_CurvedTime': curved.update(band[0], r, q, dt),
                  'syn_FadeInOut': fade.update(band[0], r, dt), 'syn_Intensity': intensity.update(band[0], r, dt),
                  'syn_RawLevel': raw.update(raw_value, dt), 'syn_InputLevel': raw_value,
                  'syn_PrimeBang': prime.update(z[0], r, dt), 'syn_BassExpoCurve': expo.update(band[2], r, dt),
                  'syn_OnBeat': onbeat.update(z[7], r, dt), 'syn_ToggleOnBeat': toggle.update(z[7], r, dt),
                  'syn_RandomOnBeat': random.update(z[7], r, dt), 'syn_BeatTime': beat.update(z[7], r, q, dt),
                  'syn_BPM': bpm, 'syn_BPMConfidence': np.float32(min(max(np.float32(confidence + r - np.float32(0.5)), 0), 1)), 'syn_BPMTwitcher': twitch.update(bpm, r, q, dt)}
        for prefix, selector, level, hits, presence, timer in families:
            output['syn_' + prefix + 'Level'] = level.update(band[selector], r, dt)
            output['syn_' + prefix + 'Hits'] = hits.update(z[selector], r, dt)
            output['syn_' + prefix + 'Presence'] = presence.update(mean[selector], r, dt)
            output['syn_' + prefix + 'Time'] = timer.update(band[selector], r, q, dt)
        for name, osc in oscillators: output[name] = osc.update(bpm, confidence, r, q, dt)
        frames.append({'band': words(band), 'z': words(z), 'mean': words(mean), 'raw': float(raw_value),
                       'bpm': float(bpm), 'confidence': float(confidence), 'dt': float(dt),
                       'output': {name: words([value])[0] for name, value in output.items()}})
    scalar_cases.append({'r': r, 'q': q, 'frames': frames})
(fixtures / 'scalars.json').write_text(json.dumps({'cases': scalar_cases, 'evidence': manifest['evidence']}, separators=(',', ':')) + '\n', newline='\n')
native_bpm = np.load(args.final / 'logs/native/bpm_trace.npz')
heavy_rows = []
histories = []
for index in range(15):
    frame = int(native_bpm[f'heavy/{index}/frame'])
    histories.append(native_bpm[f'heavy/{index}/hists'].astype('<f4').tobytes())
    heavy_rows.append({'frame': frame, 'bpm': float(native_bpm['bpm'][frame]),
                       'confidence': float(native_bpm['conf'][frame]), 'candidate': float(native_bpm['cand'][frame])})
history_bytes = b''.join(histories)
(fixtures / 'bpm-histories.bin').write_bytes(history_bytes)
(fixtures / 'bpm.json').write_text(json.dumps({'evidence': 'Recorded native Unicorn p8 histories and outputs; replay is not fresh native execution',
                                              'sha256': hashlib.sha256(history_bytes).hexdigest(), 'rows': heavy_rows}, separators=(',', ':')) + '\n', newline='\n')
print(f'Exported {len(names)} constants, {len(weights)} weight words, {len(cases) * 3} array frames')
