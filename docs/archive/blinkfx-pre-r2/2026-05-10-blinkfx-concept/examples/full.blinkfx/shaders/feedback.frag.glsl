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

uniform sampler2D feedbackPrevious;
uniform sampler2D noise;
uniform sampler2D blinkSpectrum;
uniform float intensity;

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / blink.resolution;
  vec2 warp = vec2(sin(uv.y * 10.0 + blink.time), cos(uv.x * 8.0 - blink.time)) * 0.002;
  vec3 prev = texture(feedbackPrevious, uv + warp).rgb * 0.985;
  vec3 n = texture(noise, uv * 2.0 + blink.time * 0.01).rgb;
  fragColor = vec4(prev + n * audio.bassHit * intensity * 0.05, 1.0);
}
