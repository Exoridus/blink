# Blink

Blink is a browser GPU visualizer with audio-reactive effects. It runs native
BlinkFX packages and imports supported ISF, SSF and Shadertoy sources through
shared conversion/runtime infrastructure.

The current application keeps its interface, audio analysis and renderer in the
browser. It needs no application server. A separate Studio, host and remote output
transport are later work; they are not prerequisites for this release.

## Development

Use Node 24 and npm 11:

```sh
npm ci
npm run dev
```

Open the local Vite URL, select an audio source and an effect. Audio capture and
autoplay require browser permission/user interaction. GPU capabilities vary by
browser/device; native WGSL and GLSL have separate backend coverage.

Seven bundled CC0 music tracks can be selected directly on the start page. Choose
a track and click an effect to begin; no upload or microphone is needed.
[Music credits and license records](docs/development/demo-music.md).

## Builds and checks

```sh
npm test
npm run ts-check
npm run lint
npm run build:local
npm run build:pages
```

The local artifact is rooted at / and retains the local catalog. The Pages
artifact is rooted at /blink/ by default, contains a curated example catalog and
includes documentation under /docs/. Set BLINK_BASE for the actual GitHub
repository/custom-domain path. Pages hosts static files only; no broker runs there.

The development package tool is `npm run blinkfx -- validate <package>`.
An installable `blink` CLI and remote control server are planned separately.

Repository tooling uses strict TypeScript and the TypeScript 7 compiler. ESLint
uses the official TypeScript 6 API compatibility package; this is a parser
dependency, not the application's typecheck compiler.

The default showcase includes Aurora, Hypercoil, Prism Orbit, Spectral City and
Ink Current. See [the effect guide](docs/blinkfx/showcase.md) for their audio
behavior and package features.

`npm run export:spec` prepares an independent BlinkFX specification repository
under `dist/blinkfx-spec`. It contains schemas, declarations, examples and a
standalone conformance gate. The current tracked source is `docs/blinkfx/`;
refresh exports into an empty directory. No remote repository is created.

- [Documentation](docs/README.md)
- [BlinkFX package and authoring contract](docs/blinkfx/README.md)
- [Contributing](CONTRIBUTING.md)
- [Public release blockers](docs/development/public-release.md)

Public release is not enabled. Project licensing and third-party asset/history
review are pending; the current LICENSE is retained for an explicit owner decision.
