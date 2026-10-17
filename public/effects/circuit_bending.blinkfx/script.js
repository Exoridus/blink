// function BPMCounter () {
//   this.time = 0.0;
//   this.count = 0.0;
//   this.timeWithinBeat = 0.0;
//   this.didIncrement = 0.0;
// }

// BPMCounter.prototype.updateTime = function(bpm, dt) {
//   this.didIncrement = 0.0;
//   var amountToStepThroughBeat = 0.25*bpm*dt/60.0;
//   this.time = this.time+amountToStepThroughBeat;
//   if(this.count !== Math.floor(this.time)){
//     this.count = Math.floor(this.time);
//     this.didIncrement = 1.0;
//   }
//   this.timeWithinBeat = this.time-this.count;
// }

// function SmoothCounter () {
//   this.oldCount = 0.0;
//   this.isGoing = 0.0;
//   this.currentValue = 0.0;
// }

// SmoothCounter.prototype.update = function(dt, newCount, speed) {
//   this.currentValue = this.currentValue+(newCount-this.currentValue)*speed;
// }

function Timer () {
  this.time = 0.0;
}

Timer.prototype.updateTime = function(rate, val, dt) {
  this.time = this.time+rate*dt*val;
}

// var bpmcount = new BPMCounter();
// var downrot = new SmoothCounter();
// var rightrot = new SmoothCounter();

var timevar = new Timer();

var decimator = 0;
var t = 0;

function update(dt) {

  try {
    timevar.updateTime(inputs.rate, 0.1+inputs.syn_BassLevel+inputs.syn_BassHits+inputs.syn_BassPresence, dt);
  }  
  catch (e){
    print(e);
  }

  // timevar.updateTime(inputs.rate_in, 0.1+inputs.syn_Level+inputs.syn_HighLevel+inputs.syn_Hits*0.5, dt);
  uniforms.script_time = timevar.time;
  // downrot.update(dt, inputs.down_rot, 0.1);
  // rightrot.update(dt, inputs.right_rot, 0.1);

  // uniforms.down_rot_scr = downrot.currentValue;
  // uniforms.right_rot_scr = rightrot.currentValue;
  // decimator++;
  // if (decimator%10==0){
  //   print(t);
  // }

}
