var warp_beat_script1;
var warp_beat_script2;
var b1Old=0.0;
var b2Old=0.0;

function update(dt) {

  var b1 = Math.pow(syn_BassLevel,bass_pow)*bass_mix.x;
  var b2 = Math.pow(syn_BassHits, bass_pow)*bass_mix.y;
  b1Old = b1*0.3+b1Old*0.7;
  b2Old = b2*0.3+b2Old*0.7;

  warp_beat_script1 = b1Old;
  warp_beat_script2 = b2Old;
	setUniform('warp_beat_script1', warp_beat_script1+warp_beat_script2);
	// setUniform('warp_beat_script2', warp_beat_script2)
}
