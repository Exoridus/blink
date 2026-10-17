void main(void) {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  vec3 image = texture(marker, uv).rgb;
  vec3 gradient = vec3(uv.x, uv.y, 0.25);
  fragColor = vec4(mix(gradient, image, amount), 1.0);
}
