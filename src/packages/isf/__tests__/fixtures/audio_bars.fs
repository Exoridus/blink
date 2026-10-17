/*{
  "DESCRIPTION": "Waveform and spectrum bars.",
  "INPUTS": [
    { "NAME": "waveImage", "TYPE": "audio" },
    { "NAME": "fftImage", "TYPE": "audioFFT", "MAX": 256 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float wave = IMG_NORM_PIXEL(waveImage, vec2(uv.x, 0.5)).r;
  float fft = IMG_NORM_PIXEL(fftImage, vec2(uv.x, 0.5)).r;
  float line = smoothstep(0.02, 0.0, abs(uv.y - (0.5 + 0.25 * (wave - 0.5))));
  float bar = step(uv.y, fft);
  gl_FragColor = vec4(line, bar * 0.8, bar * 0.4 + line, 1.0);
}
