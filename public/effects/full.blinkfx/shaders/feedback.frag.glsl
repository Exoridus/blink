// Samplers (uPrevious, uNoise) and control uniforms (intensity, palette) are
// declared by the runtime prelude from this package's manifest. Re-declaring
// them here would make the assembled fragment shader fail to compile.
void main() {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  vec2 warp = vec2(sin(uv.y * 10.0 + bl_time), cos(uv.x * 8.0 - bl_time)) * 0.002;
  vec3 prev = texture(uPrevious, uv + warp).rgb * 0.985;
  vec3 n = texture(uNoise, uv * 2.0 + bl_time * 0.01).rgb;
  fragColor = vec4(prev + n * au_bassHit * intensity * 0.05, 1.0);
}
