function Timer () {

    this.time = 0.0;
  
  }
  
  
  
  Timer.prototype.updateTime = function(rate, val, dt) {
  
    this.time = this.time+rate*dt*val;
  
  }

  Timer.prototype.reset = function() {
  
    this.time = 0.0;
  
  }

function CameraAxis () {

  this.x = 0.0;
  this.y = 0.0;

}

CameraAxis.prototype.update = function(newX, newY) {

    this.x = newX;
    this.y = newY;

}

CameraAxis.prototype.reset = function() {

  this.x = 0.0;
  this.y = 0.0;

}
  
  
  
function SmoothCounter () {

  this.oldCount = 0.0;

  this.isGoing = 0.0;

  this.currentValue = 0.0;

}
  
  
SmoothCounter.prototype.update = function(newCount) {

  this.currentValue = this.currentValue+(newCount-this.currentValue);

}

SmoothCounter.prototype.reset = function() {

  this.currentValue = 0.0;

}

var bass_eq, dynTime = 0.0;
var timevar = new Timer();
var bassTimevar = new Timer();
var geoBassTimevar = new Timer();
var autoRoll = new Timer();
var autoTurn = new Timer();
var autoFlip = new Timer();
var look = new CameraAxis();

function update(dt) {

    bass_eq =
      inputs.syn_BassLevel * 2.0 +
      inputs.syn_BassPresence +
      inputs.syn_BassHits * 2.0;

    bassTimevar.updateTime(0.25, bass_eq * inputs.rate_in, dt);
    geoBassTimevar.updateTime(0.25, bass_eq * inputs.cube_rate, dt);

    timevar.updateTime(0.7, inputs.rate_in, dt);

    autoRoll.updateTime(0.15, inputs.auto_roll, dt);
    autoTurn.updateTime(0.15, inputs.auto_turn, dt);
    autoFlip.updateTime(0.15, inputs.auto_flip, dt);

    look.update(inputs.LookXY.x, inputs.LookXY.y);

    if (inputs.center_cam > 0.5 || inputs.hold_center_cam > 0.5) {
      autoRoll.reset();
      autoTurn.reset();
      autoFlip.reset();
    }

    if (inputs.hold_center_cam > 0.5) {
      look.reset();
    }

    dynTime = inputs.reactive_time > 0.5 ? bassTimevar.time : timevar.time;

    uniforms.script_time = timevar.time;
    uniforms.bass_time = bassTimevar.time;
    uniforms.geo_time = geoBassTimevar.time;
    uniforms.dynamic_time = dynTime;
    uniforms.roll = autoRoll.time;
    uniforms.turn = autoTurn.time;
    uniforms.flip = autoFlip.time;

    uniforms.lookY = look.y;
    uniforms.lookX = look.x;
}

function transition() {

}
