/*{
  "DESCRIPTION": "A moving gradient.",
  "CREDIT": "Blink test fixture",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 4.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * speed;
  gl_FragColor = vec4(0.5 + 0.5 * sin(t + uv.x * 6.0), uv.y, 0.5 + 0.5 * cos(t), 1.0);
}
