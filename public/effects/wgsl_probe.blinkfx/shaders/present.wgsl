@fragment
fn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> {
  let uv = bl_fragCoord(in) / bl_resolution();
  let buffered = textureSample(buf, buf_sampler, buf_uv(uv));
  return vec4<f32>(buffered.rgb * (0.6 + 0.8 * au_bass()), 1.0);
}
