var time = 0;

function rotX(a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [
    1, 0, 0,
    0, c, s,
    0,-s, c
  ];
}

function rotY(a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [
     c, 0, s,
     0, 1, 0,
    -s, 0, c
  ];
}

function rotZ(a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [
     c, s, 0,
    -s, c, 0,
     0, 0, 1
  ];
}

// multiply two mat3 stored as 9-element arrays (column-major)
function mul(a, b) {
  var r = new Array(9);
  for (var c = 0; c < 3; ++c) {
    for (var row = 0; row < 3; ++row) {
      r[c*3+row] = a[row]*b[c*3] + a[3+row]*b[c*3+1] + a[6+row]*b[c*3+2];
    }
  }
  return r;
}

function update(dt) {
  time += dt;
  var m = mul(rotZ(3.7), mul(rotY(-0.6 + 0.2*Math.sin(0.123*time)), rotX(0.5*time)));
  setUniform('rot_x', m[0], m[1], m[2]);
  setUniform('rot_y', m[3], m[4], m[5]);
  setUniform('rot_z', m[6], m[7], m[8]);
}