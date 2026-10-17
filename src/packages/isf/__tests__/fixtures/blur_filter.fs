/*{
  "DESCRIPTION": "Two pass box blur over half resolution buffers.",
  "CATEGORIES": ["Filter"],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "radius", "TYPE": "float", "DEFAULT": 2.0, "MIN": 0.0, "MAX": 8.0 }
  ],
  "PASSES": [
    { "TARGET": "horizontal", "WIDTH": "$WIDTH/2.0", "HEIGHT": "$HEIGHT/2.0" },
    { "TARGET": "vertical", "WIDTH": "$WIDTH/2.0", "HEIGHT": "$HEIGHT/2.0" },
    { }
  ]
}*/

void main() {
  vec2 size = IMG_SIZE(inputImage);
  vec4 sum = vec4(0.0);
  if (PASSINDEX == 0) {
    for (int i = -4; i <= 4; i++) sum += IMG_NORM_PIXEL(inputImage, isf_FragNormCoord + vec2(float(i) * radius, 0.0) / size);
    gl_FragColor = sum / 9.0;
  } else if (PASSINDEX == 1) {
    for (int i = -4; i <= 4; i++) sum += IMG_NORM_PIXEL(horizontal, isf_FragNormCoord + vec2(0.0, float(i) * radius) / size);
    gl_FragColor = sum / 9.0;
  } else {
    gl_FragColor = IMG_NORM_PIXEL(vertical, isf_FragNormCoord) + 0.25 * vec4(isf_FragNormCoord, 0.0, 0.0);
  }
}
