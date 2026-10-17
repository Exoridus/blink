// Bars from the spectrum (bottom half), the level trail (top half), and the host waveform as a line.
@fragment
fn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> {
  let uv = bl_fragCoord(in) / bl_resolution();
  let bin = vec2<i32>(i32(clamp(uv.x, 0.0, 0.999) * 1023.0), 0);
  let spectrumValue = textureLoad(spectrum, bin, 0);
  let trailValue = textureLoad(trail, vec2<i32>(i32(clamp(uv.x, 0.0, 0.999) * 399.0), 0), 0);
  let waveValue = textureLoad(wave, vec2<i32>(i32(clamp(uv.x, 0.0, 0.999) * 511.0), 0), 0).x;
  var color = vec3<f32>(0.04, 0.04, 0.08);
  if (uv.y < 0.5 && uv.y * 2.0 < clamp(spectrumValue.y * 3.0 + 0.05, 0.0, 1.0)) {
    color = vec3<f32>(0.2, 0.7, 1.0);
  }
  if (uv.y >= 0.5 && (uv.y - 0.5) * 2.0 < clamp(trailValue.x * 4.0 + 0.05, 0.0, 1.0)) {
    color = vec3<f32>(1.0, 0.5, 0.2);
  }
  if (abs(uv.y - (0.5 + (waveValue - 0.5) * 0.3)) < 0.004) {
    color = vec3<f32>(1.0, 1.0, 1.0);
  }
  return vec4<f32>(color, 1.0);
}
