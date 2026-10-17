void main(void) {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  fragColor = vec4(texture(acc, uv).rgb, 1.0);
}
