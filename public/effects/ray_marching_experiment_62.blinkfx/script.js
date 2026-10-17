function ApproachRandomSpot () {
  this.goal = 0.0;
  this.currentSpot = 0.0;
}

ApproachRandomSpot.prototype.update = function(amt) {
  this.currentSpot = this.currentSpot + (this.goal-this.currentSpot)*amt;
}

var mover = new ApproachRandomSpot();

var decimator = 0;
var time = 0.0;
var rate = 0.0;
function update(dt) {

  time += 0.5*((inputs.syn_BassLevel*inputs.syn_BassLevel*0.1 + inputs.syn_BassPresence*0.2 + 0.01)*inputs.bass_time*1.5);

  uniforms.script_time = time;

  // decimator++;
  // if (decimator%10==0){
  //   print(t);
  // }
}

function transition() {
  //log(5);
}
