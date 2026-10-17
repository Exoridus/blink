function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
  ];
}

function normalize(v) {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  return [v[0]/len, v[1]/len, v[2]/len];
}

time=0;

function update(dt) {
  time+=dt;
  const t2 = [0.2*time*Math.sqrt(2), 0.2*time];

  const RO = [sway_factor * Math.sin(t2[0]), sway_factor*Math.sin(t2[1]), -satellite_distance];
  const LA = [0, 0, 0];
  const Z  = normalize([LA[0]-RO[0], LA[1]-RO[1], LA[2]-RO[2]]);
  const up = [0.2*Math.cos(t2[0]), 0.2*Math.cos(t2[1])+1, 0];
  const X  = normalize(cross(Z, up));
  const Y  = cross(X, Z);

  setUniform('zcolor'    , 0-color_base, color_off0-color_base,color_off1-color_base,color_off2-color_base)
  setUniform('time'      , TIME);
  setUniform('bass_thump', syn_BassHits*syn_BassLevel);
  setUniform('cam_RO'    , RO[0], RO[1], RO[2]);
  setUniform('cam_X'     ,  X[0], X[1], X[2]);
  setUniform('cam_Y'     ,  Y[0], Y[1], Y[2]);
  setUniform('cam_Z'     ,  Z[0], Z[1], Z[2]);
}