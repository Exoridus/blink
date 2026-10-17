/*{
  "DESCRIPTION": "Persistent float feedback with a decaying trail.",
  "INPUTS": [
    { "NAME": "decay", "TYPE": "float", "DEFAULT": 0.97, "MIN": 0.8, "MAX": 1.0 }
  ],
  "PASSES": [
    { "TARGET": "trail", "PERSISTENT": true, "FLOAT": true },
    { }
  ]
}*/

void main() {
  if (PASSINDEX == 0) {
    vec2 uv = isf_FragNormCoord;
    vec2 head = 0.5 + 0.35 * vec2(cos(TIME * 1.3), sin(TIME * 1.7));
    float dot_ = smoothstep(0.03, 0.0, distance(uv, head));
    gl_FragColor = IMG_THIS_NORM_PIXEL(trail) * decay + vec4(dot_);
  } else {
    gl_FragColor = IMG_THIS_NORM_PIXEL(trail);
  }
}
