// uFeedback and intensity come from the runtime prelude; see feedback.frag.glsl.
void main() {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  vec3 trail = texture(uFeedback, uv).rgb;
  vec3 base = vec3(uv, 0.5 + 0.5 * sin(bl_time));
  fragColor = vec4(mix(base, trail, 0.65 + au_level * 0.2) * (0.8 + intensity * 0.2), 1.0);
}
