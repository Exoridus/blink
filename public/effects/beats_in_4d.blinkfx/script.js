var ct = 0; // controllable time
var tr = 0; // translation accumulator
var rx = 0; // rotation x accum
var ry = 0; // rotation y accum


function update(dt) {
    // calculate the blended time increment based on speed_control (this effects every time parameter)
    var dt_blend = speed_control.x * dt + speed_control.y * syn_BassLevel * dt;
    
    // Accumulate everything using this increment
    ct += dt_blend;
    tr += translation_speed * dt_blend;
    rx += rotation_speed.x * 0.1 * dt_blend;
    ry += rotation_speed.y * 0.1 * dt_blend;
    
    setUniform('ct', ct);
    setUniform('tr', tr);
    setUniform('ro', [rx, ry]);
}