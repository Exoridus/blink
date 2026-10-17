import type { BlinkControlSpec } from '../../ir/types';
import { mapControlSpecs } from '../controlUniformMapper';
import { stripGlslPreamble } from '../stripGlslPreamble';

// The int precision matches the fragment stage's default; a uniform declared in both stages with
// different precisions fails to link.
const VERTEX_HEADER = `#version 300 es
precision highp float;
precision mediump int;
`;

const VERTEX_DECLARATIONS = `uniform float bl_time;
uniform float bl_deltaTime;
uniform int bl_frame;
uniform vec2 bl_resolution;
uniform int bl_pass;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
layout(location = 2) in vec4 a_color;
`;

/**
 * Wraps a package's vertex shader body with the declarations the runtime guarantees: the frame
 * uniforms, the pass index, the fullscreen-quad attributes and the package's control uniforms.
 * The body declares its own varyings and `main`, and must write `gl_Position`.
 *
 * Only `a_position` carries data (clip-space corners of the fullscreen quad); `a_texcoord` and
 * `a_color` are declared so a shader written against the usual layout compiles, but they are not
 * fed.
 */
export function buildVertexSource(body: string, controls: readonly BlinkControlSpec[]): string {
    const version = /^\s*#version\s+(.*)$/m.exec(body);
    if (version !== null && version[1].trim() !== '300 es') {
        throw new Error(`vertex shader must be GLSL ES 3.00 (#version 300 es), found "#version ${version[1].trim()}"`);
    }
    const controlDeclarations = mapControlSpecs(controls)
        .map(entry => entry.glslDeclaration)
        .join('\n');
    return `${VERTEX_HEADER}${VERTEX_DECLARATIONS}${controlDeclarations}\n${stripGlslPreamble(body)}`;
}
