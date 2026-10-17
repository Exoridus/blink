function BPMCounter () {
  this.time = 0.0;
  this.count = 0.0;
  this.timeWithinBeat = 0.0;
  this.didIncrement = 0.0;
}

BPMCounter.prototype.updateTime = function(bpm, dt) {
  this.didIncrement = 0.0;
  var amountToStepThroughBeat = 0.5*bpm*dt/60.0;
  this.time = this.time+amountToStepThroughBeat;
  if(this.count != Math.floor(this.time)){
    this.count = Math.floor(this.time);
    this.didIncrement = 1.0;
  };
  this.timeWithinBeat = this.time-this.count;
}

function SmoothCounter () {
  this.oldCount = 0.0;
  this.isGoing = 0.0;
  this.currentValue = 0.0;
}

SmoothCounter.prototype.update = function(dt, newCount, speed) {
  this.currentValue = this.currentValue+(newCount-this.currentValue)*speed;
}

var bpmcount = new BPMCounter();
var downrot = new SmoothCounter();
var rightrot = new SmoothCounter();

var decimator = 0;
var tAtLast0 = 0;
var t = 0;

function update(dt) {

  var bpm = inputs.syn_BPM;
  bpmcount.updateTime(bpm, dt);

  if (bpmcount.didIncrement == 1.0){
    tAtLast0 = t;
  }
  t = tAtLast0;
  t += (1. - Math.exp(-bpmcount.timeWithinBeat*5.));
  uniforms.script_time = t;

  downrot.update(dt, inputs.down_rot, 0.1);
  rightrot.update(dt, inputs.right_rot, 0.1);

  uniforms.down_rot_scr = downrot.currentValue;
  uniforms.right_rot_scr = rightrot.currentValue;

  // decimator++;
  // if (decimator%10==0){
  //   print(t);
  // }

}
function transition() {
  //log(5);
}
