function mix(x, y, a) {
  return x*(1.0 - a) + y*a;
}

function clamp(x, minVal, maxVal) {
  return Math.min(Math.max(x, minVal), maxVal);
}

function step(edge, x) {
  return x < edge ? 0.0 : 1.0;
}

function smoothstep(edge0, edge1, x) {
  var t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

var rotationTime      = [0, 0, 0];
var rotationSpeed     = [0, 0, 0];
var rotationUniforms  = ["rotation_components_0","rotation_components_1","rotation_components_2"];
function update(dt) {
  var hits      = [syn_BassHits,syn_MidHits,syn_MidHighHits];
  var baseSpeed = [0.25,0.25,0.25];
  var hitSpeed  = [1   ,1   ,1   ];
  var falloff   = [7   ,7   ,7   ];
  var levels    = [0.5 ,0.5 ,0.5 ];
  for(var idx=0;idx<3;++idx) {
    if (hits[idx] > 1.41*levels[idx]) {
      rotationSpeed[idx] = hitSpeed[idx];
    } else {
      rotationSpeed[idx] = mix(baseSpeed[idx], rotationSpeed[idx], Math.pow(falloff[idx], -dt));
    }
    rotationTime[idx] = (rotationTime[idx]) + dt * rotationSpeed[idx];
    var a = rotationTime[idx];
    var c = Math.cos(a);
    var s = Math.sin(a);
    setUniform(rotationUniforms[idx], c, s, -s, c);
  }
}