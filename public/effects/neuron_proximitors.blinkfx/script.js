
var time = 0;

function update(dt) {
  time += dt*(-inputs.rate_zoom);
  uniforms.scr_time = time;
}

function transition() {
}