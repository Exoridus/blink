void main(void) {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  if (bl_pass == 0) {
    // Pass 0 → buffer: an audio-reactive vertical gradient.
    fragColor = vec4(uv.x, uv.y, 0.5 + 0.5 * au_level, 1.0);
  } else {
    // Pass 1 → screen: read the buffer back, tint by bass.
    vec4 buffered = texture(buf, uv);
    fragColor = vec4(buffered.rgb * (0.6 + 0.8 * au_bass), 1.0);
  }
}
