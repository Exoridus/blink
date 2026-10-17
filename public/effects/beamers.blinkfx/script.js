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
  t += (1. - Math.exp(-bpmcount.timeWithinBeat*9.));
  uniforms.script_time = t;

  // decimator++;
  // if (decimator%10==0){
  //   print(t);
  // }

}
function transition() {
  //log(5);
}
