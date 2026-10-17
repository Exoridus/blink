function Timer () {
  this.time = 0.0;
}

Timer.prototype.updateTime = function(rate, val, dt) {
  this.time = this.time+rate*dt*val;
}

var timevar = new Timer();
var bassTimeVar = new Timer();

var t = 0;

function update(dt) {

  timevar.updateTime(inputs.speed_*inputs.reverse, 1.0, dt);
  uniforms.script_time = timevar.time;

  bassTimeVar.updateTime(0.5+inputs.syn_BassPresence*0.5, 0.05+inputs.syn_BassLevel*3.0, dt);
  uniforms.bassTime_scr = bassTimeVar.time;


  // decimator++;
  // if (decimator%10==0){
  //   print(t);
  // }

}
function transition() {
  //log(5);
}
