const N0 = [0, 1/Math.SQRT2,  1/Math.SQRT2];
const N1 = [0, 1/Math.SQRT2, -1/Math.SQRT2];
const N2 = [0, 0, -1];
const N3 = [0, 0, 1];
const GRAVITY = [0, -5, 0];
const RESTITUTION = 1.0;
const RADIUS = 1.0;
const ROUGHNESS = 0.15;
const ANG_DAMPING = 0.5; // matches your SPIN_DECAY logic

var pos = [0, 5, 0];
var vel = [0, 0, 3];
var angVel = [0, 0, 0];
var rotAxis = [1, 0, 0];
var rotAngle = 0.0;
var time = 0;

// --- Math helpers ---

function dot(a, b) {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
  ];
}

function len(v) {
  return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
}

function reflect(v, n) {
  var d = dot(v, n);
  return [v[0] - 2*d*n[0], v[1] - 2*d*n[1], v[2] - 2*d*n[2]];
}

function randomGaussian() {
  var u = 1 - Math.random();
  var v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function perturbNormal(n) {
//  var px = n[0] + randomGaussian() * ROUGHNESS;
  var px = n[0];
  var py = n[1] + randomGaussian() * ROUGHNESS;
  var pz = n[2] + randomGaussian() * ROUGHNESS;
  var l = Math.sqrt(px*px + py*py + pz*pz);
  return [px/l, py/l, pz/l];
}

function composeRotations(ax1, an1, ax2, an2) {
  var s1 = Math.sin(an1/2), c1 = Math.cos(an1/2);
  var s2 = Math.sin(an2/2), c2 = Math.cos(an2/2);
  var q1 = [ax1[0]*s1, ax1[1]*s1, ax1[2]*s1, c1];
  var q2 = [ax2[0]*s2, ax2[1]*s2, ax2[2]*s2, c2];
  var qx = q1[3]*q2[0] + q1[0]*q2[3] + q1[1]*q2[2] - q1[2]*q2[1];
  var qy = q1[3]*q2[1] - q1[0]*q2[2] + q1[1]*q2[3] + q1[2]*q2[0];
  var qz = q1[3]*q2[2] + q1[0]*q2[1] - q1[1]*q2[0] + q1[2]*q2[3];
  var qw = q1[3]*q2[3] - q1[0]*q2[0] - q1[1]*q2[1] - q1[2]*q2[2];
  var sinHalf = Math.sqrt(qx*qx + qy*qy + qz*qz);
  if (sinHalf < 0.0001) return { axis: [1,0,0], angle: 0 };
  return {
    axis: [qx/sinHalf, qy/sinHalf, qz/sinHalf],
    angle: 2 * Math.atan2(sinHalf, qw)
  };
}

// --- Collision ---

function collidePlane(normal, w) {
  var dist = dot(pos, normal) + w;
  if (dist < RADIUS) {
    // Push out using true normal
    var penetration = RADIUS - dist;
    pos[0] += normal[0] * penetration;
    pos[1] += normal[1] * penetration;
    pos[2] += normal[2] * penetration;

    if (dot(vel, normal) < 0) {
      // Perturbed normal for reflection and spin only
      var pn = perturbNormal(normal);
//      var pn = normal;

      var rv = reflect(vel, pn);
      vel[0] = rv[0] * RESTITUTION;
      vel[1] = rv[1] * RESTITUTION;
      vel[2] = rv[2] * RESTITUTION;

      // Spin from tangential velocity after bounce
      var vDotPn = dot(vel, pn);
      var vTan = [
        vel[0] - vDotPn*pn[0],
        vel[1] - vDotPn*pn[1],
        vel[2] - vDotPn*pn[2]
      ];
      var spin = cross(pn, vTan);
      angVel[0] = spin[0] / RADIUS;
      angVel[1] = spin[1] / RADIUS;
      angVel[2] = spin[2] / RADIUS;
    }
  }
}

function rotationFromAxisAngle(axis, angle) {
  var c = Math.cos(angle);
  var s = Math.sin(angle);
  var t = 1 - c;
  var l = len(axis);
  var ax = axis[0]/l, ay = axis[1]/l, az = axis[2]/l;

  return [
    [t*ax*ax + c,      t*ax*ay - s*az,  t*ax*az + s*ay],
    [t*ax*ay + s*az,  t*ay*ay + c,      t*ay*az - s*ax],
    [t*ax*az - s*ay,  t*ay*az + s*ax,  t*az*az + c    ]
  ];
}

// --- Main loop ---

function update(dt) {
  time += dt;

  // Gravity
  vel[0] += GRAVITY[0] * dt;
  vel[1] += GRAVITY[1] * dt;
  vel[2] += GRAVITY[2] * dt;

  // Integrate position
  pos[0] += vel[0] * dt;
  pos[1] += vel[1] * dt;
  pos[2] += vel[2] * dt;

  // Integrate rotation
  var w = len(angVel);
  if (w > 0.0001) {
    var deltaAxis = [angVel[0]/w, angVel[1]/w, angVel[2]/w];
    var r = composeRotations(rotAxis, rotAngle, deltaAxis, w * dt);
    rotAxis  = r.axis;
    rotAngle = r.angle;
  }

  // Collisions
  collidePlane(N0, 1);
  collidePlane(N1, 1);
  collidePlane(N2, 4);
  collidePlane(N3, 4);

  // Exponential spin decay
  var decay = Math.exp(-ANG_DAMPING * dt);
  angVel[0] *= decay;
  angVel[1] *= decay;
  angVel[2] *= decay;

  var m = rotationFromAxisAngle(rotAxis, rotAngle);

  setUniform('u_sphere_pos', pos[0], pos[1], pos[2]);
  setUniform('u_rot_x', m[0][0], m[0][1], m[0][2]);
  setUniform('u_rot_y', m[1][0], m[1][1], m[1][2]);
  setUniform('u_rot_z', m[2][0], m[2][1], m[2][2]);
}