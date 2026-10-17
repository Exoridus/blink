// Four horizontal bands, one per host input, so a wrong binding is visible rather than subtle:
// waveform, FFT, the audioTexture's two rows, and the keyboard's three state rows. The pointer
// is drawn as a crosshair, which is also the check that its origin is bottom-left.
void main(void) {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  float band = floor(uv.y * 4.0);
  vec3 color = vec3(0.0);

  if (band == 3.0) {
    color = vec3(0.5 + 0.5 * texture(uWave, vec2(uv.x, 0.5)).r);
  } else if (band == 2.0) {
    color = vec3(texture(uFft, vec2(uv.x, 0.5)).r);
  } else if (band == 1.0) {
    float row = fract(uv.y * 4.0) < 0.5 ? 0.25 : 0.75;
    color = vec3(texture(uAudioTex, vec2(uv.x, row)).r);
  } else {
    float row = floor(fract(uv.y * 4.0) * 3.0);
    color = vec3(texture(uKeys, vec2(uv.x, (row + 0.5) / 3.0)).r);
  }

  float crosshair = 1.0 - smoothstep(0.0, 6.0, distance(gl_FragCoord.xy, bl_pointerPosition));
  color = mix(color, vec3(1.0, 0.3, 0.2), crosshair * bl_pointerActive);
  color += vec3(0.0, 0.25, 0.0) * bl_pointerDown;

  fragColor = vec4(color, 1.0);
}
