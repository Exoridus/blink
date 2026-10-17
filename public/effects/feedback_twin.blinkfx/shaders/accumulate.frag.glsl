void main(void) {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  vec3 wanted = mix(vec3(uv.x, uv.y, 0.25), texture(marker, uv).rgb, 0.5);
  vec3 previous = texture(acc, uv).rgb;
  fragColor = vec4(mix(previous, wanted, 0.5), 1.0);
}
