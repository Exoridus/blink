function ApproachRandomSpot () {
  this.goalX = 0.0;
  this.goalY = 0.0;
  this.goalZoom = 1.0;
  this.x = 0.0;
  this.y = 0.0;
  this.z = 1.0;

}

ApproachRandomSpot.prototype.update = function(amt) {
  this.x = this.x + (this.goalX-this.x)*amt;
  this.y = this.y + (this.goalY-this.y)*amt;
  this.z = this.z + (this.goalZoom-this.z)*amt;
}

var mover = new ApproachRandomSpot();

var decimator = 0;
var time = 0;

function update(dt) {

  if (((inputs.syn_OnBeat > 0.9)&&(inputs.auto_camera_jumps > 0.5))||(inputs.random_camera > 0.5)){
    mover.goalX = -0.5+1.0*Math.random();
    mover.goalY = -0.5+1.0*Math.random();
    mover.goalZoom = 0.25+Math.random()*1.25;

  }
  // mover.goal = 0.5+0.5*Math.sin(inputs.TIME);
  mover.update(0.01);
  uniforms.random_spot = mover;

  // decimator++;
  // if (decimator%10==0){
  //   print(t);
  // }
}

function transition() {
  //log(5);
}
