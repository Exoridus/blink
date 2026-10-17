@fragment
fn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> {
  let uv = bl_fragCoord(in) / bl_resolution();
  let wanted = mix(vec3<f32>(uv.x, uv.y, 0.25), textureSample(marker, marker_sampler, marker_uv(uv)).rgb, 0.5);
  let previous = textureSample(acc, acc_sampler, acc_uv(uv)).rgb;
  return vec4<f32>(mix(previous, wanted, 0.5), 1.0);
}
