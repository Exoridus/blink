function Camera () {
  this.rad = 26.0;
  this.x = 0.2;
  this.y = 0.2;
  this.z = 0.2;
  this.unitX = 0.2;
  this.unitY = 0.2;
  this.unitZ = 0.2;
  this.dx = 0.0;
  this.dy = 0.0;
  this.dz = 0.0;

  this.lookX = 0.0;
  this.lookY = 0.0;
  this.lookZ = 0.0;
}

function Looker () {
  this.x = 0;
  this.y = 0;
  this.z = 0;
}

Camera.prototype.getUnit = function() {
  var magnitude = Math.sqrt(Math.pow(this.x,2)+Math.pow(this.y,2)+Math.pow(this.z,2));
  this.unitX = this.x/magnitude;
  this.unitY = this.y/magnitude;
  this.unitZ = this.z/magnitude;
}

Camera.prototype.confineToSphere = function () {
  this.getUnit();
  this.x = this.unitX*this.rad;
  this.y = this.unitY*this.rad;
  this.z = this.unitZ*this.rad;
}

Camera.prototype.move = function (dt, speed) {
  this.x += this.dx * dt * speed;
  this.y += this.dy * dt * speed;
  this.z += this.dz * dt * speed;

  this.confineToSphere();
}

Camera.prototype.updateVelocity = function() {
  this.dx = (-0.5+inputs.syn_BassPresence)*10.0;
  this.dy = (-0.5+inputs.syn_MidPresence)*10.0;
  this.dz = (-0.5+inputs.syn_HighPresence)*10.0;
}

Camera.prototype.calculateLookDirection = function (speed) {
  var base1x = 1;
  var base1y = 1;
  var base1z = 0;
  base1z = (-base1x*this.x-base1y*this.y)/this.z; //Dot product to find arbitrary othogonal vector

  var base2x = 0;
  var base2y = 0;
  var base2z = 0;
  base2x = base1y*this.z-base1z*this.y;
  base2y = base1z*this.x-base1x*this.z;
  base2z = base1x*this.y-base1y*this.x;//Cross product to find the third and last orthogonal vector

  var magnitude1 = Math.sqrt(Math.pow(base1x,2)+Math.pow(base1y,2)+Math.pow(base1z,2));
  var magnitude2 = Math.sqrt(Math.pow(base2x,2)+Math.pow(base2y,2)+Math.pow(base2z,2));

  base1x/=magnitude1;
  base1y/=magnitude1; 
  base1z/=magnitude1;
  base2x/=magnitude2;
  base2y/=magnitude2; 
  base2z/=magnitude2; //Make them unit vectors
 
  var lookTime = (inputs.syn_HighTime*0.2+inputs.syn_BassTime*0.1+inputs.syn_Time*0.05)*0.25*speed;
  var lookTime2 = lookTime*0.77777;

  this.lookX = this.x+base1x*Math.sin(lookTime)+base2x*Math.cos(lookTime2);
  this.lookY = this.y+base1y*Math.sin(lookTime)+base2y*Math.cos(lookTime2);
  this.lookZ = this.z+base1z*Math.sin(lookTime)+base2z*Math.cos(lookTime2);

}


var camera = new Camera();
var looker = new Looker();
var time = 0;
uniforms.camera = camera;
uniforms.rad = camera.rad;
uniforms.camLookAtJS = looker;
var decimator = 0;
function update(dt) {
  camera.rad = 26.0+inputs.zoom_out*15.0;
  time += inputs.racer_speed;
  decimator++;
  if (inputs.racer > 0.5){
    camera.x = Math.sin(time*0.5)/Math.sqrt(1+0.1*0.1)*camera.rad*0.9;
    camera.y = Math.cos(time*0.5)/Math.sqrt(1+0.1*0.1)*camera.rad*0.9;
    camera.z = 0.1/Math.sqrt(1+0.1*0.1)*camera.rad*0.9;
    looker.x = Math.sin(time*0.5+inputs.racer_look)/Math.sqrt(1+0.1*0.1+0.1)*camera.rad*0.86;
    looker.y = Math.cos(time*0.5+inputs.racer_look)/Math.sqrt(1+0.1*0.1+0.1)*camera.rad*0.86;
    looker.z = 0.1/Math.sqrt(1+0.1*0.1)*camera.rad*0.86;
  } else {
    camera.updateVelocity();
    camera.move(dt, inputs.syn_BPMSin4*2.5+inputs.zoom_out*5.0);
    camera.calculateLookDirection(1.0);
    looker.x = camera.lookX*0.96*(1.0-inputs.zoom_out*0.1);
    looker.y = camera.lookY*0.96*(1.0-inputs.zoom_out*0.1);
    looker.z = camera.lookZ*0.96*(1.0-inputs.zoom_out*0.1);
  }

  if(decimator%50==0){
    // console.log(looker.x, "x");

    // console.log(looker.y, "y");

    // console.log(looker.z, "z");

  }

}
function transition() {
}