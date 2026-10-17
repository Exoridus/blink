// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

function v3(x,y,z) {
  const v=new Float32Array(3);
  v[0]=x;
  v[1]=y;
  v[2]=z;
  return v;
}

function v3_add(a, b) {
  return v3(a[0]+b[0], a[1]+b[1],a[2]+b[2]);
}

function v3_sub(a, b) {
  return v3(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
}

function v3_scale(a, s) {
  return v3(a[0]*s,a[1]*s,a[2]*s);
}


function v3_dot(a, b) {
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}

function v3_cross(a, b) {
  return v3(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);
}

function v3_length(a) {
  return Math.sqrt(v3_dot(a,a));
}

function v3_normalize(a) {
  const len=v3_length(a);
  return v3_scale(a,1.0/len);
}

var time=0;
var pos=v3(0.3,0.2,0.0);
var dpos=v3(0.0,0.0,0.01);

function update(dt) {
    time+=dt;

    const center=v3(0,0,0);
    const gd=v3_sub(center,pos);
    const g=v3_scale(v3_normalize(gd),(1e-4*gravity)/v3_dot(gd,gd));

    dpos=v3_add(dpos,v3_scale(g,dt));
    pos=v3_add(pos,v3_scale(dpos,dt));
    
    setUniform('pos',pos[0],pos[1],pos[2]);
    setUniform('dpos',dpos[0],dpos[1],dpos[2]);
    setUniform('ddpos',g[0],g[1],g[2]);
}
