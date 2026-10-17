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


var bassTimevar = new Timer();


var timevar = new Timer();

var bassTimevarGeo = new Timer();


var timevarGeo = new Timer();

var dynTime, dynTimeGeo, pAndLevel, dynTexturize, dynRiver = 0.0;

var decimator = 0;

var t = 0;

var bass_avg = 0.0;

var quadMirror = 0.0;


function BPMCounter () {

  this.time = 0.0;

  this.count = 0.0;

  this.timeWithinBeat = 0.0;

  this.didIncrement = 0.0;

}



BPMCounter.prototype.updateTime = function(bpm, dt) {

  this.didIncrement = 0.0;

  var amountToStepThroughBeat = bpm*dt/60.0;

  this.time = this.time+amountToStepThroughBeat;

  if(this.count != Math.floor(this.time)){

    this.count = Math.floor(this.time);

    this.didIncrement = 1.0;

  };

  this.timeWithinBeat = this.time-this.count;

}



var bpmcount = new BPMCounter();


function update(dt) {



  try {

    var bpm = inputs.syn_BPM/4.0;

  bpmcount.updateTime(bpm, dt);



  uniforms.beat_time = bpmcount.time;

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


  uniforms.geo_var = inputs.random_geo > 0.5 ? inputs.syn_RandomOnBeat : inputs.ring_or_cage;

  uniforms.edgeMix = inputs.audio_edge > 0.5 ? inputs.syn_BassHits : inputs.edge_mix;

    //if (t == 0) {
    //  console.log(JSON.stringify(inputs));
    //  t = 1;
    //}

  } catch (e){

    console.log(e);

  }

}