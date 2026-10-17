var denoms = [11, 7, 5];
var framecount = 0;

function clamp(x, lo, hi) {
  return Math.max(Math.min(x, hi), lo)
}

function scale(x, lo, hi) {
  return x * (hi - lo) + lo;
}

function getSpectrum() {
  var highs = clamp(scale(inputs.syn_HighPresence, -1., 1.), 0, 1);
  var mids = clamp(scale(inputs.syn_MidPresence - inputs.syn_BassLevel / 2., -0.5, 1), 0, 1);
  var bass = Math.pow(Math.max(0.0, scale(inputs.syn_BassLevel, -.33, 1.)), 0.5);
  var highmids = clamp(scale(inputs.syn_MidHighPresence, -0.5, 1), 0, 1);
  return [bass, mids, highmids, highs];
}

function update(dt) {
  getSpectrum().forEach(function(el, i) {
    uniforms['spectrum_' + i] = el
  })

  uniforms.zoe_denom = denoms[Math.floor((denoms.length - 1) * inputs.wavelength + .5)];

  uniforms.strobe = 1 * (
    framecount % Math.floor(16 * Math.pow(1 - inputs.rate, 2) + 1) == 0 &&
    inputs.rate > 0
  );

  framecount++;
}