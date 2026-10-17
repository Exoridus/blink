import { corpusRoot } from './lib/workspacePaths.ts';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { BlinkFxControl, BlinkFxManifest } from '../src/packages/blinkfx/manifest';
import { MemoryPackageFiles } from '../src/packages/blinkfx/packageReader';
import { validatePackage } from '../src/packages/blinkfx/validatePackage';
import type { ConvertedPackage } from '../src/packages/convert/report';
import { convertSsfScene, type SsfSceneSource } from '../src/packages/ssf/convert/convertSsfScene';
import { detokenize, findFunctions, replaceIdentifier, tokenize } from '../src/packages/ssf/convert/glslText';
import { writeFiles } from './lib/packageDirectory';
import { readSsfScene } from './lib/ssfDirectory';

const GROUP = '08 Native BlinkFX';
const NATIVE_CONTROLS: readonly BlinkFxControl[] = [
    {
        name: 'Native_Int',
        label: 'Integer steps',
        type: 'int',
        default: 4,
        min: 0,
        max: 8,
        step: 1,
        group: GROUP,
        description: 'Native integer uniform with nine discrete positions, distinct from an SSF float slider.',
    },
    {
        name: 'Native_Bool',
        label: 'Boolean',
        type: 'bool',
        default: true,
        group: GROUP,
        description: 'Native boolean uniform, distinct from an SSF float toggle.',
    },
    {
        name: 'Native_Enum',
        label: 'String enum',
        type: 'enum',
        default: 'Amber',
        options: ['Mint', 'Amber', 'Violet'],
        group: GROUP,
        description: 'Named options with a string default; the shader reads the selected integer index.',
    },
    {
        name: 'Native_RGBA',
        label: 'RGBA with alpha',
        type: 'color',
        default: [0.2, 0.7, 1, 0.55],
        group: GROUP,
        description: 'All four color components reach the shader. The checkerboard shows the effect of alpha.',
    },
    {
        name: 'Native_Bang',
        label: 'Bang event',
        type: 'bang',
        group: GROUP,
        description:
            'One frame of script input per action, without a persistent shader control uniform. The preview counts actions and flashes.',
    },
];

const SCRIPT = `var nativeBangCount = 0;
var nativeBangPulse = 0;
function update(dt) {
  nativeBangPulse = Math.max(0, nativeBangPulse - dt * 2.5);
  if (Native_Bang > 0.5) {
    nativeBangCount += 1;
    nativeBangPulse = 1;
  }
  setUniform('Native_BangCount', nativeBangCount);
  setUniform('Native_BangPulse', nativeBangPulse);
}
`;

const GLYPHS = new Map<string, readonly number[]>([
    [' ', [0, 0, 0, 0, 0, 0, 0]],
    ['A', [14, 17, 17, 31, 17, 17, 17]],
    ['B', [30, 17, 17, 30, 17, 17, 30]],
    ['E', [31, 16, 16, 30, 16, 16, 31]],
    ['G', [14, 17, 16, 23, 17, 17, 14]],
    ['I', [14, 4, 4, 4, 4, 4, 14]],
    ['L', [16, 16, 16, 16, 16, 16, 31]],
    ['M', [17, 27, 21, 21, 17, 17, 17]],
    ['N', [17, 25, 21, 19, 17, 17, 17]],
    ['O', [14, 17, 17, 17, 17, 17, 14]],
    ['R', [30, 17, 17, 30, 20, 18, 17]],
    ['T', [31, 4, 4, 4, 4, 4, 4]],
    ['U', [17, 17, 17, 17, 17, 17, 14]],
]);

function overlay(): string {
    const letters = [...GLYPHS.keys()];
    const rows = [...GLYPHS.values()].flat();
    const words = ['INT', 'BOOL', 'ENUM', 'RGBA', 'BANG'].flatMap(word =>
        [...word.padEnd(5)].map(letter => letters.indexOf(letter))
    );
    return `uniform float Native_BangCount;
uniform float Native_BangPulse;
const int nativeGlyphRows[${rows.length}] = int[](${rows.join(', ')});
const int nativeLabelGlyphs[${words.length}] = int[](${words.join(', ')});

float nativeLabel(vec2 p, vec2 origin, int label) {
  ivec2 cell = ivec2(floor((p - origin) / 3.0));
  if (cell.x < 0 || cell.x >= 30 || cell.y < 0 || cell.y >= 7 || cell.x % 6 >= 5) return 0.0;
  int glyph = nativeLabelGlyphs[label * 5 + cell.x / 6];
  int bits = nativeGlyphRows[glyph * 7 + cell.y];
  return float((bits >> (4 - cell.x % 6)) & 1);
}

vec4 renderMain() {
  float stripHeight = 100.0 / 1080.0;
  if (_uv.y >= stripHeight) {
    _uv.y = (_uv.y - stripHeight) / (1.0 - stripHeight);
    _uvc = (_uv - 0.5) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
    return controlGallerySsf();
  }
  vec2 p = vec2(_uv.x * 1920.0, (stripHeight - _uv.y) * 1080.0);
  vec3 col = vec3(0.035, 0.06, 0.095);
  vec3 accent = vec3(0.3, 0.82, 0.93);
  if (p.y < 2.0) col = accent * 0.65;
  for (int i = 0; i < 5; i++) {
    float x = float(i) * 384.0;
    applyColor(col, vec3(0.83, 0.9, 0.96), nativeLabel(p, vec2(x + 24.0, 14.0), i));
    if (i > 0 && p.x >= x && p.x < x + 1.0) col = vec3(0.12, 0.2, 0.28);
  }
  drawBar(col, p, vec2(145.0, 58.0), 210.0, float(Native_Int) / 8.0, accent);
  drawToggle(col, p, vec2(580.0, 48.0), Native_Bool ? 1.0 : 0.0, vec3(0.32, 0.91, 0.69));
  vec3 enumColor = Native_Enum == 0 ? vec3(0.32, 0.91, 0.69) : Native_Enum == 1 ? vec3(0.96, 0.76, 0.44) : vec3(0.71, 0.57, 1.0);
  drawDrop(col, p, vec2(913.0, 48.0), 210.0, float(Native_Enum) / 2.0, enumColor);
  float checker = mod(floor((p.x - 1297.0) / 10.0) + floor((p.y - 48.0) / 10.0), 2.0);
  vec3 rgba = mix(mix(vec3(0.12), vec3(0.32), checker), Native_RGBA.rgb, Native_RGBA.a);
  drawColor(col, p, vec2(1297.0, 48.0), vec2(210.0, 25.0), rgba, accent);
  drawBang(col, p, vec2(1786.0, 61.0), Native_BangPulse, Native_BangCount * 0.125, vec3(1.0, 0.53, 0.49));
  return vec4(col, 1.0);
}

`;
}

function augmentShader(fragment: string): string {
    const tokens = tokenize(fragment);
    replaceIdentifier(tokens, 'renderMain', 'controlGallerySsf');
    const hostMain = findFunctions(tokens).find(fn => fn.name === 'main' && fn.bodyStart !== -1);
    if (hostMain === undefined) throw new Error('Converted gallery has no main() wrapper');
    for (let index = hostMain.bodyStart; index < hostMain.bodyEnd; index++) {
        if (tokens[index].kind === 'ident' && tokens[index].text === 'controlGallerySsf')
            tokens[index].text = 'renderMain';
    }
    const source = detokenize(tokens);
    const entry = /\bvoid\s+main\s*\(\s*(?:void)?\s*\)/.exec(source);
    if (entry === null) throw new Error('Converted gallery main() declaration is missing');
    return `${source.slice(0, entry.index)}${overlay()}${source.slice(entry.index)}`;
}

/** Converts the supplied gallery and appends native diagnostics while keeping its SSF controls intact. */
export function buildControlGallery(source: SsfSceneSource): ConvertedPackage {
    const converted = convertSsfScene(source);
    if (converted.report.status === 'failed')
        throw new Error(`Gallery conversion failed: ${converted.report.issues.map(issue => issue.message).join('; ')}`);
    const names = new Set(converted.manifest.controls?.map(control => control.name));
    if (NATIVE_CONTROLS.some(control => names.has(control.name)))
        throw new Error('Native diagnostic controls collide with source controls');
    const manifest: BlinkFxManifest = {
        ...converted.manifest,
        id: 'com.codexo.control_gallery',
        title: 'Control Matrix (BlinkFX)',
        description:
            'All 42 SSF controls, plus native integer, boolean, enum, RGBA alpha and bang diagnostics in the bottom strip.',
        controls: [...(converted.manifest.controls ?? []), ...NATIVE_CONTROLS],
        script: { entry: 'script.js', abi: 'ssf/1' },
        requirements: {
            ...converted.manifest.requirements,
            features: [...new Set([...(converted.manifest.requirements?.features ?? []), 'script:ssf/1' as const])],
        },
        compatibility: {
            ...converted.manifest.compatibility,
            scriptUniforms: {
                ...converted.manifest.compatibility?.scriptUniforms,
                ...Object.fromEntries([
                    ['Native_BangCount', 'float'],
                    ['Native_BangPulse', 'float'],
                ]),
            },
        },
    };
    const files = new Map(converted.files);
    for (const [path, bytes] of source.files) files.set(`source/${path}`, bytes);
    files.set('script.js', SCRIPT);
    files.set('shaders/main.frag.glsl', augmentShader(files.get('shaders/main.frag.glsl') as string));
    files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
    files.set(
        'README.md',
        `# Control Matrix (BlinkFX)

The original 42 SSF controls retain their raw defaults, ranges, groups and compatibility metadata. The original seven preview panels occupy the upper portion of the image; the five native diagnostics appear in the bottom strip.

- Integer: GLSL int, default 4, range 0..8, step 1.
- Boolean: GLSL bool, default true.
- Enum: Mint / Amber / Violet, default Amber; the shader receives integer indices 0 / 1 / 2.
- RGBA: default [0.2, 0.7, 1.0, 0.55]; alpha blends the swatch over a checkerboard.
- Bang: an event-only control with no persistent shader control uniform. A script counts its frame pulses and produces a decaying flash through Native_BangCount and Native_BangPulse.

Native point2d is already represented by the source XY controls. Native float is already represented by the SSF scalar controls. The original source and documentation, including supplied attribution, are retained byte-for-byte under source/. Source credit: OpenAI / SSF Reference Fixture. No additional third-party shader library is included.

Rebuild from the source fixture with npx vite-node --script scripts/build-control-gallery.ts. The package retains the ssf/1 profile for the original control dynamics.
`
    );
    const report = { ...converted.report, features: [...converted.report.features, 'native-control-diagnostics'] };
    files.set('conversion-report.json', `${JSON.stringify(report, null, 2)}\n`);
    return { manifest, files, report };
}

async function main(): Promise<void> {
    const result = buildControlGallery(
        readSsfScene(resolve(corpusRoot(), 'synesthesia/builtin/local/Synesthesia_Control_Gallery.synScene'))
    );
    const encoder = new TextEncoder();
    const files = new MemoryPackageFiles(
        new Map(
            [...result.files].map(([path, content]) => [
                path,
                typeof content === 'string' ? encoder.encode(content) : content,
            ])
        )
    );
    const validation = await validatePackage(files);
    if (!validation.valid) throw new Error(validation.findings.map(finding => finding.message).join('; '));
    writeFiles(resolve(corpusRoot(), 'converted-blinkfx/ssf/local/Synesthesia_Control_Gallery.blinkfx'), result.files);
    console.log(
        `${result.manifest.title}: ${result.manifest.controls?.length ?? 0} controls; package validation passed`
    );
}

const entryPoint = process.argv.at(1);
if (entryPoint !== undefined && pathToFileURL(resolve(entryPoint)).href === import.meta.url) await main();
