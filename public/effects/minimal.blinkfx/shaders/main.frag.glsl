void main() {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  float v = sin((uv.x + uv.y + bl_time) * 6.2831853) * 0.5 + 0.5;
  fragColor = vec4(vec3(v), 1.0);
}
