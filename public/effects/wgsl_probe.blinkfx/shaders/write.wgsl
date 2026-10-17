@fragment
fn fragmentMain(in: BlinkVarying) -> @location(0) vec4<f32> {
  let uv = bl_fragCoord(in) / bl_resolution();
  return vec4<f32>(uv.x, uv.y, 0.5 + 0.5 * au_level(), 1.0);
}
