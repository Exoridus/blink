void main() {
  vec2 uv = gl_FragCoord.xy / bl_resolution;
  float aspect = bl_resolution.x / bl_resolution.y;

  float y = uv.y * 2.0 - 1.0;

  float baseWave = sin(uv.x * 3.14159 * float(waves) + bl_time * speed * 0.3);
  float colorBase = baseWave * 0.5 + 0.5;
  float audioMod = au_midHigh * 0.7 + au_high * 0.4;
  float wave0 = baseWave + audioMod * 0.3;
  float wave1 = sin(uv.x * 3.14159 * (float(waves) - 1.0) - bl_time * speed * 0.25)
    + au_mid * 0.35 * sin(bl_time * 1.7 + uv.x * 12.0);
  float wave2 = cos(uv.x * 3.14159 * (float(waves) + 2.0) + bl_time * speed * 0.35)
    + au_bass * 0.4 * cos(bl_time * 2.1 + uv.x * 8.0);

  float aurora = 0.0;
  aurora += 0.018 / (abs(y - wave0 * 0.55) + 0.005);
  aurora += 0.012 / (abs(y - wave1 * 0.35) + 0.006);
  aurora += 0.010 / (abs(y - wave2 * 0.25) + 0.008);

  float brightness = au_level * 0.4 + au_beatPulse * 0.25 + 0.35;
  aurora *= brightness;

  vec3 col;
  if (spectral) {
    float hue = uv.x * 1.2 + bl_time * 0.04 + au_mid * 0.3;
    col = 0.5 + 0.5 * vec3(cos(hue * 6.28318), cos((hue + 0.333) * 6.28318), cos((hue + 0.667) * 6.28318));
    col = mix(baseColor.rgb, col, 0.7);
  } else {
    col = baseColor.rgb + vec3(0.0, 0.3, 0.5) * colorBase;
  }

  float vignette = 1.0 - abs(y) * 0.7;
  fragColor = vec4(col * aurora * vignette * 2.2, 1.0);
}
