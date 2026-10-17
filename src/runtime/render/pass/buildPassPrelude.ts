/**
 * Per-pass GLSL declarations appended after the shared Blink prelude:
 * the pass index and one sampler per uniform name in the shared-shader
 * sampler union (every source kind the pass graph reads, not just
 * render-target inputs). The runtime uploads `bl_pass` and binds each
 * sampler every frame.
 */
export function buildPassPrelude(inputs: readonly string[]): string {
    const samplers = inputs.map(name => `uniform sampler2D ${name};`).join('\n');
    return samplers.length > 0 ? `uniform int bl_pass;\n${samplers}\n` : 'uniform int bl_pass;\n';
}
