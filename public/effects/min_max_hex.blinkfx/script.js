function TimeVar () {
  this.rate = 0.0;
  this.time = 0.0;
}

TimeVar.prototype.updateTime = function(val, dt) {
  this.time = this.time+val*this.rate*dt*60;
}


function Accumulator () {
  this.value = 0.0;
  this.decay = 0.9;
}

Accumulator.prototype.update = function(val, dt){
  this.value += (val - this.value) * (this.decay * dt * 60.0);
  if (this.value > 1.0){
    this.value = 1.0;
  } else if (this.value<0.0){
    this.value = 0.0;
  }
}

var timevar = new TimeVar();
var accum = new Accumulator();


function update(dt) {
	timevar.rate = inputs.speed*5.0;
	
	accum.update(Math.pow(inputs.syn_Hits,3.0), dt);
	uniforms.script_accum = accum.value;

  timevar.updateTime(Math.pow(inputs.syn_Hits,3.0)*1.3+inputs.syn_Presence*0.02, dt);
	uniforms.script_time = timevar.time;

	// inputs.syn_CurvedTime*0.5*inputs.speed;

}
function transition() {

}
