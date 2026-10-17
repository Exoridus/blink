var cam_sp = 0;
var wave_sp = 0;

function update(dt){
    cam_sp = cam_sp + .01*speed + syn_BassPresence*.05*speed;    
    wave_sp = wave_sp + .01*wave_bar_speed + syn_MidLevel*.1*wave_bar_speed + syn_MidHighLevel*.1*wave_bar_speed;  

    setUniform("cam_speed", cam_sp);
    setUniform("wave_speed", wave_sp);

}