void main(void) {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  // level is written by the package script, tint by the control panel or a preset.
  float ring = smoothstep(0.02, 0.0, abs(distance(uv, vec2(0.5)) - 0.15 - 0.3 * level));
  fragColor = vec4(tint.rgb * ring, 1.0);
}
