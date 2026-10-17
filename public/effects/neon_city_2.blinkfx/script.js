
var z_pos = 0;
var phase = 0;
var freq = 0;

var last_bang = 0;
var wave_start_z = -1e4;
var wave_real_elapsed = 1e4;

// Camera pan - following 3d_orbit_camera pattern
function LastClick() {
    this.x = -100
    this.y = -100
}
LastClick.prototype.click = function() {
    this.x = _muvc.x
    this.y = _muvc.y
}
LastClick.prototype.release = function() {
    this.x = -100
    this.y = -100
}

var last_click = new LastClick()
var delta = {x: 0, y: 0}
var pan_x = 0
var pan_y = 0

function update(dt) {
    // Accumulate z position from speed knob
    z_pos += speed * dt;
    setUniform('z_pos', z_pos);

    // Smooth frequency
    freq += (path_frequency - freq) * 0.1;

    // Integrate phase
    phase += freq * dt;
    var TWO_PI = Math.PI * 2;
    phase = phase % TWO_PI;

    var sinVal = Math.sin(phase);
    var cosVal = Math.cos(phase);
    var A = path_amplitude;

    setUniform('path_x',   0.5 + A * sinVal);
    setUniform('dpath_x',  A * freq * cosVal);
    setUniform('ddpath_x', -A * freq * freq * sinVal);

    // Mouse pan
    var clickL = _click.x > 0.5;

    if (clickL && last_click.x < -50)
        last_click.click();
    else if (!clickL && last_click.x > -50)
        last_click.release();

    if (clickL) {
        delta.x = _muvc.x - last_click.x;
        delta.y = _muvc.y - last_click.y;
    } else {
        delta.x *= 0.9;
        delta.y *= 0.9;
        if (Math.abs(delta.x) < 0.001) delta.x = 0;
        if (Math.abs(delta.y) < 0.001) delta.y = 0;
    }

    pan_x += delta.x * 0.12;
    pan_y += delta.y * 0.12;
    pan_x = Math.max(-3.0, Math.min(3.0, pan_x));
    pan_y = Math.max(-1.2, Math.min(1.2, pan_y));

    setUniform('cam_pan_x', pan_x);
    setUniform('cam_pan_y', pan_y);

    // Bang wave
    if (trigger_wave > 0.5 && last_bang <= 0.5) {
        wave_start_z = z_pos;
        wave_real_elapsed = 0;
    }
    last_bang = trigger_wave;
    wave_real_elapsed += dt;
    setUniform('wave_start_z', wave_start_z);
    setUniform('wave_elapsed', wave_real_elapsed);
}
