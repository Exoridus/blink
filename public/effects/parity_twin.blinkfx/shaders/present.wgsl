@fragment
fn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> {
  let uv = bl_fragCoord(in) / bl_resolution();
  let buffered = textureSample(buf, buf_sampler, buf_uv(uv)).rgb;
  return vec4<f32>(buffered * 0.9 + 0.05, 1.0);
}
