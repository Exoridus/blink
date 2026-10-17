var pos = [0, 2, 0];
var vel = [1, 0, 0.5];
var angVel = [0, 0, 0];
var rotAxis = [1, 0, 0];
var rotAngle = 0.0;

const INNER_R = 1.0;
const OUTER_R = 4.0;
const BOUNCE_R = OUTER_R - INNER_R;
const GRAVITY = 4.8;
const DAMPING = 1.0;
const ANG_DAMPING = 0.995;
const ROUGHNESS = 0.15;

function srand() {
  return -1+2*Math.random();
}

function len(v) {
  return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
}

function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
  ];
}

function randomGaussian() {
  var u = 1 - Math.random();
  var v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function perturbNormal(nx, ny, nz) {
  var px = nx + randomGaussian() * ROUGHNESS;
  var py = ny + randomGaussian() * ROUGHNESS;
  var pz = nz + randomGaussian() * ROUGHNESS;
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

function update(dt) {
  if(drop_ball>.5) {
    pos = [0, 2, 0];
    vel = [2*srand(), 2*srand(), 2*srand()];
  }
  // Gravity
  vel[1] -= GRAVITY * dt;

  // Integrate position
  pos[0] += vel[0] * dt;
  pos[1] += vel[1] * dt;
  pos[2] += vel[2] * dt;

  // Accumulate rotation
  var w = len(angVel);
  if (w > 0.0001) {
    var deltaAxis = [angVel[0]/w, angVel[1]/w, angVel[2]/w];
    var deltaAngle = w * dt;
    var r = composeRotations(rotAxis, rotAngle, deltaAxis, deltaAngle);
    rotAxis  = r.axis;
    rotAngle = r.angle;
  }

  // Collision
  var dist = Math.sqrt(pos[0]*pos[0] + pos[1]*pos[1] + pos[2]*pos[2]);
  if (dist > BOUNCE_R) {
    // True normal for position correction
    var nx = pos[0] / dist;
    var ny = pos[1] / dist;
    var nz = pos[2] / dist;

    pos[0] = nx * BOUNCE_R;
    pos[1] = ny * BOUNCE_R;
    pos[2] = nz * BOUNCE_R;

    // Perturbed normal for reflection + spin
    var pn = perturbNormal(nx, ny, nz);
    var pnx = pn[0], pny = pn[1], pnz = pn[2];

    var vDotN = vel[0]*pnx + vel[1]*pny + vel[2]*pnz;
    vel[0] = (vel[0] - 2*vDotN*pnx) * DAMPING;
    vel[1] = (vel[1] - 2*vDotN*pny) * DAMPING;
    vel[2] = (vel[2] - 2*vDotN*pnz) * DAMPING;

    var vDotN2 = vel[0]*pnx + vel[1]*pny + vel[2]*pnz;
    var vTan = [
      vel[0] - vDotN2*pnx,
      vel[1] - vDotN2*pny,
      vel[2] - vDotN2*pnz
    ];
    var spin = cross([pnx, pny, pnz], vTan);
    angVel[0] = spin[0] / INNER_R;
    angVel[1] = spin[1] / INNER_R;
    angVel[2] = spin[2] / INNER_R;
  }

  angVel[0] *= ANG_DAMPING;
  angVel[1] *= ANG_DAMPING;
  angVel[2] *= ANG_DAMPING;

  var m = rotationFromAxisAngle(rotAxis, rotAngle);

  setUniform('u_sphere_pos', pos[0], pos[1], pos[2]);
  setUniform('u_rot_x', m[0][0], m[0][1], m[0][2]);
  setUniform('u_rot_y', m[1][0], m[1][1], m[1][2]);
  setUniform('u_rot_z', m[2][0], m[2][1], m[2][2]);
}