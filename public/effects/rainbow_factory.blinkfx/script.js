function Timer () {

  this.time = 0.0;

}

Timer.prototype.updateTime = function(rate, val, dt) {

  this.time = this.time+rate*dt*val;

}

function SmoothCounter () {

  this.oldCount = 0.0;

  this.isGoing = 0.0;

  this.currentValue = 0.0;

}

SmoothCounter.prototype.update = function(dt, newCount, speed) {

  this.currentValue = this.currentValue+(newCount-this.currentValue)*speed;

}

var moveRight = new SmoothCounter();
var timevar = new Timer();
var bassTimevar = new Timer();
var dynTime = 0.0;

var timevarGeo = new Timer();
var bassTimevarGeo = new Timer();
var dynTimeGeo = 0.0;

function update(dt) {

  try {


    bassTimevar.updateTime(0.1, (inputs.syn_BassLevel*2.0+inputs.syn_BassPresence+inputs.syn_BassHits*2.0)*inputs.rate_in, dt);

    timevar.updateTime(0.4, inputs.rate_in, dt);

    dynTime = inputs.reactive_time > 0.5 ? bassTimevar.time : timevar.time;

    uniforms.script_time = timevar.time;

    uniforms.bass_time = bassTimevar.time;

    uniforms.dynamic_time = dynTime;


    bassTimevarGeo.updateTime(0.1, (inputs.syn_BassLevel*2.0+inputs.syn_BassPresence+inputs.syn_BassHits*2.0)*inputs.geo_rate, dt);

    timevarGeo.updateTime(0.4, inputs.geo_rate, dt);

    dynTimeGeo = inputs.geo_reactive_time > 0.5 ? bassTimevarGeo.time : timevarGeo.time;

    uniforms.geo_script_time = timevarGeo.time;

    uniforms.geo_bass_time = bassTimevarGeo.time;

    uniforms.geo_dynamic_time = dynTimeGeo;



    moveRight.update(dt, inputs.move_right*20.0, 0.02);

    moveRight.update(dt, -inputs.move_left*20.0, 0.02);

    uniforms.moveRightScr = moveRight.currentValue;

    uniforms.abs_sin_time_4th_speed = Math.abs(Math.sin(dynTime*0.25));
    uniforms.abs_sin_time_4th_speed_o = Math.abs(Math.sin(-dynTime*0.25));
    uniforms.abs_sin_time_8th_speed = Math.abs(Math.sin(dynTime*0.125));
    uniforms.abs_sin_time_8th_speed_o = Math.abs(Math.sin(-dynTime*0.125));
    uniforms.abs_sin_time_16th_speed = Math.abs(Math.sin(dynTime*0.0625));

    uniforms.abs_sin_time_4th_speed_geo = Math.abs(Math.sin(dynTimeGeo*0.25));
    uniforms.abs_sin_time_4th_speed_o_geo = Math.abs(Math.sin(-dynTimeGeo*0.25));
    uniforms.abs_sin_time_8th_speed_geo = Math.abs(Math.sin(dynTimeGeo*0.125));
    uniforms.abs_sin_time_8th_speed_o_geo = Math.abs(Math.sin(-dynTimeGeo*0.125));
    uniforms.abs_sin_time_16th_speed_geo = Math.abs(Math.sin(dynTimeGeo*0.0625));

    uniforms.edgeMix = inputs.audio_edge > 0.5 ? inputs.syn_BassHits : inputs.edge_mix;
    
    uniforms.altCam = inputs.alt_cam_onBeat > 0.5 ? inputs.syn_ToggleOnBeat > 0.1 ? 1.0 : 0.0 : (1.0-inputs.alt_cam);
    
    uniforms.roundedGeo = (inputs.bpm_round > 0.5 ? inputs.syn_BPMSin4*0.15+0.05 : inputs.rounded_geo)* Math.PI

  } 
  catch (e){

    console.log(JSON.stringify(e));

  }







}