function fract(x) {
  return x - Math.floor(x);
}

function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}

function mix(a, b, t) {
  return a * (1.0 - t) + b * t;
}

function setHSVColor(uniformName,hue,sat,val) {
  const px = Math.abs(fract(hue + 1  )*6 - 3);
  const py = Math.abs(fract(hue + 2/3)*6 - 3);
  const pz = Math.abs(fract(hue + 1/3)*6 - 3);

  const clampedX = clamp(px - 1, 0, 1);
  const clampedY = clamp(py - 1, 0, 1);
  const clampedZ = clamp(pz - 1, 0, 1);

  setUniform(
    uniformName
  , val * mix(1, clampedX, sat)
  , val * mix(1, clampedY, sat)
  , val * mix(1, clampedZ, sat)
  );
}

function setNormalizedVec3(uniformName,x,y,z) {
  const il=1/Math.sqrt(x*x+y*y+z*z);
  setUniform(
    uniformName
  , x*il
  , y*il
  , z*il
  );
}

function update(dt) {
  const OFF=base_hue;
  setUniform("OFF",OFF);
  setHSVColor("BY",0.05+OFF,0.7,0.8)
  setHSVColor("BG",0.95+OFF,0.6,0.3)
  setHSVColor("BW",0.55+OFF,0.2,2.0)
  setHSVColor("BF",0.82+OFF,0.6,2.0)
  setHSVColor("FC",1.0-color_burn_hue,color_burn_saturation,color_burn_intensity)
  setNormalizedVec3("RN",ring_direction.x,1,ring_direction.y);
  setNormalizedVec3("LD",1,light_direction.y,light_direction.x);
  setUniform("GG",gas_giant_position.x, gas_giant_position.y, 1000, 400);
}
