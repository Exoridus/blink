@fragment
fn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> {
  let uv = bl_fragCoord(in) / bl_resolution();
  let image = textureSample(marker, marker_sampler, marker_uv(uv)).rgb;
  let gradient = vec3<f32>(uv.x, uv.y, 0.25);
  return vec4<f32>(mix(gradient, image, amount()), 1.0);
}
