// BlinkFX package script, ABI "blink/1".
//
// Drives the "level" control from the audio frame the host passes in, and answers the two gate
// transitions the manifest binds. Nothing here touches the shader directly: a script writes
// controls, and the controls are the uniforms.

const IDLE_LEVEL = 0.15;

export function setup(ctx) {
  ctx.controls.set('level', IDLE_LEVEL);
}

export function update(ctx) {
  const driven = Math.min(1, IDLE_LEVEL + ctx.audio.bass * 0.85);
  ctx.controls.set('level', driven);
}

export function onGateOpened(ctx) {
  ctx.controls.set('level', 1);
}

export function onGateClosed(ctx) {
  ctx.controls.set('level', IDLE_LEVEL);
}
