void main() {
  fragColor = texture(present_source, gl_FragCoord.xy / bl_resolution);
}
