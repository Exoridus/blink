/*{
  "DESCRIPTION": "A buffer whose size follows a control.",
  "INPUTS": [
    { "NAME": "pixels", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0.05, "MAX": 1.0 }
  ],
  "PASSES": [
    { "TARGET": "small", "WIDTH": "max(16, floor($WIDTH * $pixels))", "HEIGHT": "max(16, floor($HEIGHT * $pixels))" },
    { }
  ]
}*/

void main() {
  if (PASSINDEX == 0) {
    vec2 uv = isf_FragNormCoord;
    gl_FragColor = vec4(fract(uv * 8.0), 0.5, 1.0);
  } else {
    gl_FragColor = IMG_THIS_NORM_PIXEL(small);
  }
}
