#version 300 es
precision highp float;

layout(std140) uniform BlinkFrame {
  vec2 resolution;
  float time;
  float deltaTime;
  int frame;
  int passIndex;
} blink;

layout(std140) uniform BlinkAudio {
  float level;
  float bass;
  float mid;
  float midHigh;
  float high;
  float hit;
  float bassHit;
  float midHit;
  float midHighHit;
  float highHit;
  float presence;
  float bassPresence;
  float midPresence;
  float midHighPresence;
  float highPresence;
  float beatPulse;
  float barPulse;
  float beatPhase;
  float bpm;
  float bpmConfidence;
} audio;

uniform sampler2D feedback;
uniform float intensity;

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / blink.resolution;
  vec3 trail = texture(feedback, uv).rgb;
  vec3 base = vec3(uv, 0.5 + 0.5 * sin(blink.time));
  fragColor = vec4(mix(base, trail, 0.65 + audio.level * 0.2) * (0.8 + intensity * 0.2), 1.0);
}
