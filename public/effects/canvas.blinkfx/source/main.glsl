float triGen(vec2 pos, float grower){
  pos.x *= (RENDERSIZE.x / RENDERSIZE.y);
  pos *= vec2(3.0,2.0)*2.0;
  pos += vec2(0.0,0.2+grower*8.0);
  pos.y += abs(pos.x);

  //        float r = triRand(sin(pos.y), grower);
  float r = tan(pos.y);
  float retVal = r;
  for (int i=0;i<10;i++){
    retVal -= sin(syn_BassTime+pos.x*(i+1)/10.0);
  }

  return retVal;
}

float pulseTime = fract(length(_uvc)*0.9 - (syn_BPMTri2/syn_BPMConfidence)*bpm_pulse + manual_pulse +0.12)*3.5;
float pulse = smoothstep(0.0,0.4,pulseTime)-smoothstep(0.4,0.55,pulseTime);

vec4 renderMain(void)
{
  float data = 0.0;
  data += pulse*pulser_on;

  data += syn_OnBeat*beat_flasher_on;
  data += clamp(pow(2*syn_BPMTri/syn_BPMConfidence,0.9),0.0,1.0)*bpm_flasher_on;

  float disty = length(_uvc-vec2(manual_painter.x, manual_painter.y)*vec2(1.0, RENDERSIZE.y/RENDERSIZE.x)*0.9);
  if (auto_painter>0.5){
    disty = length(_uvc-vec2(sin(syn_Time*2*PI*0.08*0.25+syn_RandomOnBeat),cos(syn_Time*2*PI*0.124*0.25+syn_RandomOnBeat))*0.3);
  }
  if(disty < pow(brush_size+paint_pulse*brush_size,3.0)) {
    data += pow(disty+1.0,4.0)*painter_on;
  }

  float backbuffer = texture(syn_FinalPass, _uv).r;

  data = mix(data, backbuffer, pow(feedback,0.2));

  data -= clamp(pow(_rand(_uvc*10000.0+TIME+_uvc.x*_uvc.y*1000.0),4.0)*noise_on,0.0,1.0);

  if (_isMediaActive()){
    data = mix(data, 1.0-data, _loadMediaAsMask().r);
  }

  data *= brightness;

  data = mix(data, 1.0-data, invert);

  vec4 colorOut = vec4(vec3(data), 1.0);
  return colorOut;
}
