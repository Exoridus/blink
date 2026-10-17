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



// var bpmcount = new BPMCounter();

var moveRight = new SmoothCounter();
var moveUp = new SmoothCounter();
var rotateRight = new SmoothCounter();
var rotateUp = new SmoothCounter();


var timevar = new Timer();



var decimator = 0;

var t = 0;



function update(dt) {



  try {

    timevar.updateTime(1, inputs.const_rate + inputs.syn_BassLevel*inputs.bass_rate, dt);

    uniforms.script_time = timevar.time;

    moveRight.update(dt, inputs.move_right, 0.2);
    moveUp.update(dt, inputs.move_up, 0.2);
    rotateRight.update(dt, inputs.rotate_right, 0.1);
    rotateUp.update(dt, inputs.rotate_up, 0.1);

    uniforms.moveRightScr = moveRight.currentValue;
    uniforms.moveUpScr = moveUp.currentValue;
    uniforms.rotateRightScr = rotateRight.currentValue;
    uniforms.rotateUpScr = rotateUp.currentValue;
  } 



    catch (e){

    print(e);

  }



}