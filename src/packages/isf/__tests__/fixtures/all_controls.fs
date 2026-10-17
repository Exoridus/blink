/*{
  "DESCRIPTION": "One of every control type.",
  "INPUTS": [
    { "NAME": "amount", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "enabled", "TYPE": "bool", "DEFAULT": true },
    { "NAME": "flash", "TYPE": "event" },
    { "NAME": "shape", "TYPE": "long", "VALUES": [0, 1, 2], "LABELS": ["Circle", "Square", "Ring"], "DEFAULT": 1 },
    { "NAME": "center", "TYPE": "point2D", "DEFAULT": [0.5, 0.5], "MIN": [0.0, 0.0], "MAX": [1.0, 1.0] },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [1.0, 0.5, 0.2, 1.0] }
  ]
}*/

void main() {
  vec2 p = isf_FragNormCoord - center;
  float d = length(p);
  float mask = shape == 0 ? step(d, 0.25) : (shape == 1 ? step(max(abs(p.x), abs(p.y)), 0.25) : step(0.2, d) * step(d, 0.3));
  vec4 color = tint * mask * amount;
  if (!enabled) color = vec4(0.0);
  if (flash) color += vec4(1.0);
  gl_FragColor = vec4(color.rgb, 1.0);
}
