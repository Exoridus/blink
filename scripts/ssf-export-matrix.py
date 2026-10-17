"""Attach measured BlinkFX coverage to every frozen source field without inheriting native PASS labels."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--final', type=Path, required=True)
parser.add_argument('--evidence', type=Path, required=True)
args = parser.parse_args()
numeric = json.loads((args.evidence / 'numeric-report.json').read_text())
helper_names = set(numeric['helperNames'])
source = args.final / '23_FINAL_SSF_COMPATIBILITY_MATRIX.csv'
rows = list(csv.DictReader(source.open(encoding='utf8')))

def mapping(row):
    name, category = row['name'], row['category']
    if name in ('GLSL.RENDERSIZE', 'GLSL._xy', 'GLSL._uv', 'GLSL._uvc'):
        return ('QUALIFIED_SIZED_PASS_MARKER', 'src/packages/ssf/profile/helperLibrary.ts; src/packages/ssf/convert/convertSsfScene.ts; src/services/RenderService.ts', 'browser-report.json: coordinateProbe', 'Native screen RENDERSIZE retained on an 8x8 target; controlled coordinate marker only')
    if category == 'scalar_generator':
        score = next(score for score in numeric['scores'] if score['field'] == name)
        return ('QUALIFIED_' + score['status'], 'src/packages/ssf/original/scalars.ts', 'native.test.ts; numeric-report.json', '270 fresh native getter updates; no complete PCM-to-render claim')
    if category in ('array_class', 'array_selector'):
        return ('QUALIFIED_PASS', 'src/packages/ssf/original/arrays.ts', 'native.test.ts; numeric-report.json', '12 fresh native updates across two reactivities; Smooth uses declared PC53/Zen2 profile')
    if category == 'audio_texture_binding':
        return ('QUALIFIED_PASS', 'src/packages/ssf/profile/SsfOriginalProfile.ts', 'sampling.test.ts; browser-report.json', 'RGBA32F; LINEAR/REPEAT; one-row 2D adapter; seven GPU probes on SwiftShader')
    if name == 'runtime.full_audio_to_GPU_parity':
        return ('QUALIFIED_PCM_TO_SIGNALS_GPU_PENDING', 'src/packages/ssf/original/provider.ts; src/runtime/lab/LabRenderSurface.ts', 'pipeline.test.ts; numeric-report.json; browser-report.json', '120 fresh native PCM-to-publication frames; original full-app GPU/JS/media pixel equivalence not established')
    if category == 'numerical_pipeline':
        path = 'src/packages/ssf/original/'
        module = 'bpm.ts' if name == 'BPM.engine' else 'scalars.ts' if name == 'RNG.MSVC.rand' else 'arrays.ts' if name == 'Smooth.packed_expf' else 'frontend.ts'
        return ('QUALIFIED_PASS', path + module, 'numeric-report.json; frontend.test.ts; bpm.test.ts', 'Portable numeric profile and fixed fixture scopes; F1 corrected to native positive finite maximum at 008C0BF0; live IPP dispatch not emulated')
    if category == 'glsl_helper':
        helper = name.split(':', 1)[1]
        return ('SEMANTIC_ADAPTER' if helper in helper_names else 'PENDING', 'src/packages/ssf/profile/helperLibrary.ts', 'convertSsfScene.test.ts; corpus.test.ts', 'Existing helper implementations preserve public intent; native template numerical parity not claimed')
    if category == 'control_type':
        dynamics = any(word in name for word in ('smooth', 'speed', 'traveler', 'bang'))
        return ('NATIVE_DEFAULTS_WITH_APPROXIMATE_DYNAMICS' if dynamics else 'NATIVE_DEFAULTS_QUALIFIED', 'src/packages/ssf/convert/controls.ts; src/packages/ssf/profile/SsfControlProcessor.ts', 'controls.native.test.ts', '22 native TYPE parser names; dynamic control class behavior not native-tested; DEF_COLOR initial conversion unverified')
    if category == 'scene_json_key':
        return ('PRESERVED_WITH_PARTIAL_MAPPING', 'src/packages/ssf/convert/convertSsfScene.ts; src/packages/ssf/package.ts', 'package.test.ts; convertSsfScene.test.ts; corpus.test.ts', 'Exact original scene.json bytes retained; fields without IR consumers retained as source; no full JsonCpp DOM/coercion emulation')
    if category == 'js_function':
        if name == 'JS.textureFinalPass':
            return ('UNSUPPORTED_IN_RENDER_HOST', 'src/packages/ssf/original/readback.ts; src/packages/ssf/script/SsfScriptRuntime.ts; src/services/RenderService.ts', 'readback.test.ts; SsfScriptRuntime.test.ts', '34 recorded coordinate/RGB byte boundaries pass; live synchronous current-read-FBO consumer is refused by capability gate')
        return ('PORTABLE_VM_PARTIAL_NATIVE_CONTRACT', 'src/packages/ssf/script/SsfScriptRuntime.ts; src/packages/ssf/script/SsfScriptSandbox.ts', 'SsfScriptRuntime.test.ts; browser-report.json', 'Native uniform/event boundary tests; modern JavaScript VM; native control normalization/randomization contracts remain partial')
    if category == 'js_lifecycle':
        return ('QUALIFIED_PORTABLE_LIFECYCLE', 'src/packages/ssf/script/SsfScriptRuntime.ts; src/runtime/lab/AudioAnalysisLab.ts', 'SsfScriptRuntime.test.ts; AudioAnalysisLab.test.ts; browser-report.json', 'Setup/priming/publication/events/abort implemented; Duktape language parity pending; worker isolation qualified in Lab only')
    if category == 'scene_package_lifecycle':
        if name in ('synScene.local_directory', 'synScene.marketplace_TAR', 'synScene.load_parse'):
            return ('QUALIFIED_PORTABLE_READER', 'src/packages/ssf/package.ts; scripts/lib/ssfDirectory.ts', 'package.test.ts; corpus.test.ts', 'Local directories separate from uncompressed TAR; comments/trailing commas supported; links/compression rejected explicitly')
        return ('PENDING', 'src/packages/ssf/package.ts', 'none', 'Native editor save/rename/collision/auto-backup operations are not implemented')
    if category in ('legacy_meta_control', 'external_control_surface'):
        return ('PRESERVED_UNMAPPED', 'src/packages/ssf/convert/convertSsfScene.ts', 'none', 'Original raw fields preserved; full meta/media/control-surface consumers pending')
    if category == 'compatibility_profile':
        return ('UNQUALIFIED_EXTERNAL_BOUNDARY', 'src/packages/ssf/original/provider.ts; docs/ssf-original.md', 'numeric-report.json', 'Declared portable profile; exact live CPU environment and native full-app pixel parity are not established')
    if category in ('standard_uniform', 'glsl_coordinate_constant', 'glsl_assembly'):
        return ('PORTABLE_ADAPTER_PARTIAL', 'src/packages/ssf/convert/convertSsfScene.ts; src/packages/ssf/profile/helperLibrary.ts; src/services/RenderService.ts', 'convertSsfScene.test.ts; browser-report.json', 'Common BlinkEffectIR retained; float signed stage counter; first-name-wins, native template/meta bindings and all native coordinates not fully qualified')
    if category == 'glsl_gpu_integration':
        if name in ('GPU.passes_order', 'GPU.feedback_initial_reset', 'GPU.pass_texture_format_filter_wrap', 'GPU.render_graph'):
            return ('QUALIFIED_SAFE_ADAPTER', 'src/runtime/render/pass/BlinkPassRuntime.ts; src/runtime/lab/LabRenderSurface.ts', 'browser-report.json; pass runtime tests', 'Existing target ownership retained; marker replay tested; unsafe single-buffer/negative-odd native alias hazards intentionally adapted')
        return ('DECLARED_DEVIATION_OR_PENDING', 'src/packages/ssf/convert/convertSsfScene.ts; src/runtime/render/pass/BlinkPassRuntime.ts; src/runtime/binding/AssetBinder.ts', 'convertSsfScene.test.ts', 'Safe include rejection/feedback and transactional reload differ; ExoJS PMA/color pipeline, cubes, native media and synchronous read-FBO parity remain unqualified')
    raise ValueError(category)

args.evidence.mkdir(parents=True, exist_ok=True)
columns = ('name', 'category', 'source_evidence_status', 'source_freeze_disposition', 'blinkfx_status', 'implementation', 'blinkfx_evidence', 'limits')
with (args.evidence / 'compatibility-matrix.csv').open('w', encoding='utf8', newline='') as stream:
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(columns)
    for row in rows:
        writer.writerow((row['name'], row['category'], row['evidence_status'], row['freeze_disposition'], *mapping(row)))
crosswalk = list(csv.DictReader((args.final / '02B_INVENTORY_CROSSWALK.csv').open(encoding='utf8')))
by_name = {row['name']: row for row in rows}
with (args.evidence / 'source-crosswalk-92.csv').open('w', encoding='utf8', newline='') as stream:
    writer = csv.writer(stream, lineterminator='\n'); writer.writerow(('name', 'source_category', 'registered_51', 'blinkfx_status', 'implementation'))
    for row in crosswalk:
        native = by_name.get(row['name'])
        if native is None:
            native = next((entry for entry in rows if entry['name'] in ('GLSL.' + row['name'], 'legacy_control:' + row['name'])), None)
        mapped = mapping(native) if native else ('PRESERVED_UNMAPPED', 'src/packages/ssf/convert/convertSsfScene.ts', '', '')
        writer.writerow((row['name'], row['category_now'], row['in_51_registry'], mapped[0], mapped[1]))
(args.evidence / 'mapping-provenance.json').write_text(json.dumps({'sourceContract': numeric['sourceContract'], 'sourceMatrixSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'nativeFields': len(rows), 'inventoryFields': len(crosswalk), 'releaseGate': 'NOT_ACCEPTED', 'note': 'Source evidence labels and BlinkFX implementation status are independent.'}, indent=2) + '\n', newline='\n')
print(f'Mapped {len(rows)} native fields and {len(crosswalk)} inventory entries; release gate NOT_ACCEPTED')
