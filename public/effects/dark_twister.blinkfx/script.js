var lum_sp = 0;
var tun_sp = 0;
var rot_sp = 0;

function update(dt){
    lum_sp = lum_sp + .008*beam_rate + syn_Hits*.03*beam_rate;
    tun_sp = tun_sp + .01*zoom_speed + syn_BassPresence*.03*zoom_speed;    
    rot_sp = rot_sp + .01*rotation_speed + syn_MidPresence*.015*rotation_speed + syn_MidHighPresence*.015*rotation_speed;  

    setUniform("lum_speed", lum_sp);
    setUniform("tun_speed", tun_sp);
    setUniform("rot_speed", rot_sp);

}