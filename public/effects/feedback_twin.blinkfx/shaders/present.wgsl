@fragment
fn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> {
  let uv = bl_fragCoord(in) / bl_resolution();
  return vec4<f32>(textureSample(acc, acc_sampler, acc_uv(uv)).rgb, 1.0);
}
