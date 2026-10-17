/**
 * Upgrades legacy GLSL ES 1.00 fragment shader source to GLSL ES 3.00.
 *
 * Vendored from ExoJS (own engine, internal since 0.14 — the function is no
 * longer part of the public package surface). Idempotent: calling twice
 * returns the same source.
 *
 * NOT supported (produce GLSL compile errors the effect author must port
 * manually): gl_FragData[N], texture2DLod/textureCubeLod, gl_FragDepthEXT.
 */
export function upgradeFragmentShaderToGl300(source: string): string {
    if (/^\s*#version\s+300\s+es/.test(source)) {
        return source;
    }

    const stripped = source.replace(/^\s*#version[^\n]*\n/, '');

    const transformed = stripped
        .replaceAll(/\bgl_FragColor\b/g, 'fragColor')
        .replaceAll(/\btexture2D(?=\s*\()/g, 'texture')
        .replaceAll(/\btextureCube(?=\s*\()/g, 'texture')
        .replaceAll(/\btexture2DProj(?=\s*\()/g, 'textureProj')
        .replaceAll(/\bvarying\b/g, 'in');

    // Precision MUST precede `out vec4 fragColor;` (GLSL ES 3.00 requires
    // precision before any float-typed declaration).
    const header = '#version 300 es\nprecision highp float;\nout vec4 fragColor;\n';

    return header + transformed;
}
