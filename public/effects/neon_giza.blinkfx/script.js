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


function update(dt) {
  const hoff=hue_offset;
  setHSVColor("sunColor"  , hoff+0.0 , 0.9 , 0.0005);
  setHSVColor("topColor"  , hoff+0.0 , 0.9 , 0.0001);
  setHSVColor("glowColor0", hoff+0.0 , 0.9 , 0.0001);
  setHSVColor("glowColor2", hoff+0.3 , 0.95, 0.001 );
  setHSVColor("diffColor" , hoff+0.0 , 0.5 , 0.25  );
  setHSVColor("glowCol1"  , hoff+0.2 , 0.85, 0.0125);
  setHSVColor("barCol"    , hoff+0.15, 0.90, 1.0   );
}
