@group(0) @binding(0) var<uniform> blink: BlinkFrame;
@group(0) @binding(1) var<uniform> audio: BlinkAudio;
@group(0) @binding(2) var uFeedback: texture_2d<f32>;
@group(0) @binding(3) var<uniform> controls: ControlsBlock;
@group(0) @binding(4) var uFeedbackSampler: sampler;

struct BlinkFrame {
  resolution: vec2<f32>,
  time: f32,
  deltaTime: f32,
  frame: i32,
  passIndex: i32,
}

struct BlinkAudio {
  level: f32,
  bass: f32,
  mid: f32,
  midHigh: f32,
  high: f32,
  hit: f32,
  bassHit: f32,
  midHit: f32,
  midHighHit: f32,
  highHit: f32,
  presence: f32,
  bassPresence: f32,
  midPresence: f32,
  midHighPresence: f32,
  highPresence: f32,
  beatPulse: f32,
  barPulse: f32,
  beatPhase: f32,
  bpm: f32,
  bpmConfidence: f32,
}

struct ControlsBlock {
  intensity: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv = in.position.xy / blink.resolution;
  let trail = textureSample(uFeedback, uFeedbackSampler, uv).rgb;
  let base = vec3(uv, 0.5 + 0.5 * sin(blink.time));
  return vec4(mix(base, trail, 0.65 + audio.level * 0.2) * (0.8 + controls.intensity * 0.2), 1.0);
}
