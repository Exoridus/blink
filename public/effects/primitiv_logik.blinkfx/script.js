
function SmoothCounter () {
  this.oldCount = 0.0;
  this.isGoing = 0.0;
  this.currentValue = 0.0;
}

SmoothCounter.prototype.update = function(dt, newCount, speed) {
  this.currentValue = this.currentValue+(newCount-this.currentValue)*speed;
}
var smCount = new SmoothCounter();

var decimator = 0;
var tAtLast0 = 0;
var iters = 0;
var bassT = 0.0;

function syncBouncer () {
  this.x = 0.0;
  this.y = 0.0;
  this.absTime = 0.0;
  this.intTime = 0.0;
  this.lastPressAbsTime = 0.0;
  this.currentFreq = 1.0;
}

syncBouncer.prototype.updateBouncer = function(didBounce, dt) {
  this.absTime += dt;
  if (didBounce>0.1){
    this.intTime = 0.0;
    this.currentFreq = (this.absTime - this.lastPressAbsTime)*0.5;
    this.lastPressAbsTime = this.absTime;
  }
  this.intTime += dt;
  this.x = 0.5+0.5*Math.sin(this.intTime*3.1415*(1/this.currentFreq));
  this.y = this.intTime*(1/this.currentFreq);

}

var myBouncer = new syncBouncer();
var changer = 0.0;
var lastVal = 0.0;
var bouncerTime = 0.0;
var decimator = 0;
function update(dt) {

  if (inputs.TOGGLE_ON_BEAT == 1.0 && lastVal == 0.0){
      changer = 1.0;
      lastVal = 1.0;
    } else if (inputs.TOGGLE_ON_BEAT == 0.0 && lastVal == 1.0){
      changer = 1.0;
      lastVal = 0.0;
    }
    myBouncer.updateBouncer(changer, dt);
    changer = 0.0;
    // bouncerTime += myBouncer.x;
  uniforms.beatTime = myBouncer.y;
  // decimator++;
  // if (decimator == 10.0){
  //   decimator = 0;
  //   print(myBouncer.y);
  // }
  // this.uniforms.bouncerTime = bouncerTime;

}
function transition() {
  //log(5);
}
