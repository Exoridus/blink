function Timer () {

  this.time = 0.0;

}

Timer.prototype.updateTime = function(rate, val, dt) {

  this.time = this.time+rate*dt*val;

}

var bassTimevar = new Timer();
var midTimevar = new Timer();
var midHighTimevar = new Timer();

function update(dt) {

  try {

    bassTimevar.updateTime(0.2, (inputs.syn_BassLevel*2.0+inputs.syn_BassPresence+inputs.syn_BassHits*2.0)*inputs.rate, dt);
    midTimevar.updateTime(0.2, (inputs.syn_MidLevel*2.0+inputs.syn_MidPresence+inputs.syn_MidHits*2.0)*inputs.rate, dt);
    midHighTimevar.updateTime(0.2, (inputs.syn_MidHighLevel*2.0+inputs.syn_MidHighPresence+inputs.syn_MidHighHits*2.0)*inputs.rate, dt);

    uniforms.bass_time = bassTimevar.time;
    uniforms.sinBTime = Math.sin(bassTimevar.time);
    uniforms.cosBTime = Math.cos(bassTimevar.time*2.0);

    uniforms.mid_time = midTimevar.time;
    uniforms.midHigh_time = midHighTimevar.time;

    uniforms.geo_switch = inputs.rand_geo > 0.5 ? inputs.syn_RandomOnBeat : inputs.ring_cage;


    uniforms.mediaMult = inputs.media_mult > 0.5 ? 1.0 : inputs.bass_mult > 0.5 ? 0.2 + 0.8*inputs.syn_BassPresence : 0.0;
    uniforms.traceMix = (inputs.feedback_on - inputs.fb_fade) + 0.07*inputs.fb_fade; 

  } 

  catch (e){
    print(e);
  }
}