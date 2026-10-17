void main(void) {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  vec3 buffered = texture(buf, uv).rgb;
  fragColor = vec4(buffered * 0.9 + 0.05, 1.0);
}
