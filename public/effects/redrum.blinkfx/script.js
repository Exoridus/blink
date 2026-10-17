function SmoothCounter () {
  this.oldCount = 0.0;
  this.isGoing = 0.0;
  this.currentValue = 0.0;
}

SmoothCounter.prototype.update = function(dt, newCount, speed) {
  this.currentValue = this.currentValue+(newCount-this.currentValue)*speed;
}

var manslice = new SmoothCounter();

var decimator = 0;
var tAtLast0 = 0;
var t = 0;

function update(dt) {

  manslice.update(dt, inputs.manual_slice, 0.2);

  uniforms.manslice_scr = manslice.currentValue;

  // decimator++;
  // if (decimator%10==0){
  //   print(manslice.currentValue);
  // }

}
function transition() {
  //log(5);
}
