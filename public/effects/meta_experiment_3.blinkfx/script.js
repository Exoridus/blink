function Timer () {
  this.time = 0.0;
}

Timer.prototype.updateTime = function(rate, val, dt) {
  this.time = this.time+rate*dt*val;
}

var actualTime = 0.0;
var highsTimeToAdd = 0.0;
var bassTimeToAdd = 0.0;
var twitchyTimeToAdd = 0.0;

var constTimeToAdd = 0.0;

var decimator = 0;

function update(dt) {
  
  var neg = inputs.time_direction;
  // if (inputs.constant_motion < 0.0){
  //   neg = 1.0;
  // }

  highsTimeToAdd = dt*neg*(Math.pow(inputs.syn_HighHits,3.0)*10.0)*inputs.highs_mix*1.2;
  bassTimeToAdd = dt*neg*(Math.pow(inputs.syn_BassLevel,2.0)*3.0+Math.pow(inputs.syn_BassHits,2.0)*1.0)*inputs.bass_mix;
  constTimeToAdd = dt*2.0*neg*Math.pow(inputs.constant_mix*1.3, 2.0);

  actualTime +=  highsTimeToAdd + bassTimeToAdd + constTimeToAdd;

  uniforms.script_time = actualTime;


  // decimator++;
  // if (decimator%10==0){
  //   print(t);
  // }

}
function transition() {
  //log(5);
}
