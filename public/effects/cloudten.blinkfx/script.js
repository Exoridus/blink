function TimeVar () {
  this.rate = 0.0;
  this.time = 0.0;
}

TimeVar.prototype.updateTime = function(val, dt) {
  this.time = this.time+val*this.rate*(dt*60);
}

function Accumulator () {
  this.value = 0.0;
  this.decay = 0.9;
}

Accumulator.prototype.update = function(val, dt){
  this.value += (val - this.value) * (this.decay * dt * 60.0);
  if (this.value > 1.0){
    this.value = 1.0;
  }
}

var timevar = new TimeVar();
var accumulator = new Accumulator();

var decimator = 0;
function update(dt) {
  timevar.rate = inputs.speed;
  accumulator.update(Math.pow(inputs.syn_Level,2.0), dt);
  timevar.updateTime(accumulator.value, dt);
  uniforms.script_time = timevar.time;

  if(decimator%50==0){
    // console.log(timevar.time);
  }
  decimator ++;

}
function transition() {
}