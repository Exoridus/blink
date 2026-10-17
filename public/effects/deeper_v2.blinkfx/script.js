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

function CameraPos () {
  this.x = 0.0;
  this.y = 0.0;
  this.z = 0.0;
}

function CameraLook () {
  this.x = 0.0;
  this.y = 0.0;
  this.z = 0.0;
}


var bpmcount = new BPMCounter();
var cPos = new CameraPos();
var cLook = new CameraLook();

var decimator = 0;
var tAtLast0 = 0;
var bpmTime = 0;
var bassT = 0.0;
var flyInOut = 0.0;

function update(dt) {

  var bpm = inputs.syn_BPM/4.0;
  bpmcount.updateTime(bpm, dt);

  uniforms.script_time = bpmcount.time;


  // if (bpmcount.didIncrement == 1.0){
  //   tAtLast0 = bpmTime;
  // }
  // bpmTime = tAtLast0;
  // bpmTime += (1. - Math.exp(-bpmcount.timeWithinBeat*3.))*inputs.amount_to_step;
  // uniforms.script_time = bpmTime;

  bassT = bassT + (Math.pow(inputs.syn_BassLevel * 0.5, 2.0) * (dt * 60)) * 1.0 * inputs.bass_travel * (FOV * 0.8 + 0.2) + inputs.jump_forward * (inputs.FOV * 0.8 + 0.2);
  uniforms.script_bass_time = bassT;

  // cPos.x = cPos.x + (-0.5+Math.random(inputs.syn_BeatTime)*inputs.syn_OnBeat);
  flyInOut += inputs.travel * 0.2 * (dt * 60) * (inputs.FOV*0.8+0.2);
  uniforms.fly_in_out_script = flyInOut;


  // decimator++;
  // if (decimator%10==0){
  //   print(t);
  // }

}
function transition() {
  //log(5);
}
