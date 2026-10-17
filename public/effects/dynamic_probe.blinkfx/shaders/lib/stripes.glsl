float stripes(vec2 uv, float count) {
  return step(0.5, fract(uv.x * count));
}
