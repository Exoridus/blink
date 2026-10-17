# Audio-reactive showcase

The public application starts with five native packages. They use local GLSL and
require no imported scenes or external media. Silence still produces an animated
image; audio adds modulation rather than acting as an on/off gate.

| Effect        | Visual style                    | Audio behavior                                                | Format features                                          |
| ------------- | ------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| Aurora        | Soft spectral ribbons           | Bass, mids and high-frequency color modulation                | Float, integer, boolean and color controls               |
| Hypercoil     | Recursive neon tunnel           | Audio-reactive feedback trails                                | Persistent target, two passes, asset, presets and script |
| Prism Orbit   | Overlapping luminous rings      | Bass expands rings; mids bend contours; highs brighten detail | Float and color controls                                 |
| Spectral City | Graphic skyline and reflections | Bass lifts towers; mids light windows; highs accent roofs     | Integer and float controls                               |
| Ink Current   | Organic interference contours   | Bass bends flow; mids open veins; highs sharpen detail        | A bounded five-step procedural warp                      |

Prism Orbit, Spectral City and Ink Current are original self-contained examples.
Their shaders use analytic functions, not imported shader libraries or scene
assets. Each declares MIT for the effect package. This is separate from the
application's license decision. Existing examples retain their declared credits.

`public/release-effects.json` is the shipping allowlist. Development catalogs may
also contain diagnostic packages; these are not the public showcase. Public
package metadata, source files and a matching license must be reviewed together.

To inspect an example, open its project directory under `public/effects/`. Run
`npm run blinkfx -- validate public/effects/prism_orbit.blinkfx` to validate the
package statically. The separate browser lane compiles and runs the actual
shader programs; static validation cannot prove GPU compatibility or appearance.

Controls cap audio modulation to avoid unbounded brightness or geometry changes.
These effects have no intentional hard strobe. Bright displays and rapidly
varying audio can still produce visually intense output; adjust response and
brightness for the venue.
