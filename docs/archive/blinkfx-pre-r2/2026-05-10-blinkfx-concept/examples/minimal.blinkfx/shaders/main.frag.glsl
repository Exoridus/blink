#version 300 es
precision highp float;

layout(std140) uniform BlinkFrame {
  vec2 resolution;
  float time;
  float deltaTime;
  int frame;
  int passIndex;
} blink;

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / blink.resolution;
  float v = sin((uv.x + uv.y + blink.time) * 6.2831853) * 0.5 + 0.5;
  fragColor = vec4(vec3(v), 1.0);
}
