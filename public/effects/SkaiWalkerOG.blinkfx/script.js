function Timer () {

  this.time = 0.0;

}



Timer.prototype.updateTime = function(rate, val, dt) {

  this.time = this.time+rate*dt*val;

}



function SmoothCounter () {


  this.count = 0.0;

}

SmoothCounter.prototype.update = function(newCount) {

  this.count = this.count+newCount*15.0;

}

var bassCount = new SmoothCounter();


var bassTimevar = new Timer();


var timevar = new Timer();
var spinTimevar = new Timer();



function update(dt) {


  bassTimevar.updateTime(time_rate*(1.0+syn_Level), (syn_BassLevel*1.0+syn_BassPresence+syn_BassHits*1.0+syn_Presence)+1.0, dt);

  timevar.updateTime(time_rate*(2.0+syn_Presence), 5.0, dt);

  spinTimevar.updateTime(time_rate*(syn_Presence), 3.5, dt);

  bassCount.update(syn_Hits*(0.0075)*time_rate*0.5);
 
  uniforms.bass_count = bassCount.count; 
  uniforms.script_time = timevar.time;
  uniforms.bass_time = bassTimevar.time;
  uniforms.dynamic_time =  timevar.time;
  uniforms.portal_time =  0.5*(timevar.time + bassTimevar.time);
  uniforms.spin_time =  spinTimevar.time;

}