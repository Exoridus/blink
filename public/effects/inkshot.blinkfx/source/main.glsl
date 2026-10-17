float vuTimeUncorrected = syn_Time;
float bassTimeUncorrected = syn_BassTime;
float highsTimeUncorrected = syn_HighTime;
float beatTimeUncorrected = syn_BeatTime;
float vuFadeToBlack = syn_FadeInOut;
float highHits = syn_HighHits;
float bassHits = syn_BassHits;
float bassAccum = syn_BassLevel;
float randomizerBeat = syn_RandomOnBeat;

vec2 resolution = RENDERSIZE; // the rendering resolution (in pixels)
float time = TIME;
float vuTime = vuTimeUncorrected * (0.08);// 60000 to "correct", but we want it much smaller actually
float bassTime = bassTimeUncorrected*6 * (0.01);
float beatTime = syn_BeatTime*6;
float highsTime = (syn_HighTime + syn_MidHighTime)*6.0 * (0.03);
float rgbZoomAmt = ((pow(bassAccum,2.0)+syn_BassHits*syn_BassLevel)*auto_pulse+pulse)*0.25*pulse_intensity;

#define TWO_PI (PI * 2.0)

vec2 getNormPos() {
  return vec2(-1+2*(gl_FragCoord.x/resolution.x),-1+2*(gl_FragCoord.y/resolution.y));
}

vec2 getNormPosBotLeft() {
  return vec2(gl_FragCoord.xy/resolution.xy);
}

vec3 resonancePattern(vec2 posIn, float numIters)
{
  vec2 v = posIn;
  // float pulser = ((pow(bassAccum,2.0)+syn_BassHits*syn_BassLevel)*auto_pulse+(1.0-auto_pulse)*pulse)*0.25*pulse_intensity;
  // if (pulse_type>0.5){
  //   v+=normalize(_uvc)*pow(2.0-length(_uvc)*0.1,0.1)*pulser;
  // }

  float col = 0.1;

  for(float i = 0.0; i < numIters; i++)
  {
    // vec2 posTemp = v*10.0*(-10.0+numIters*1.0+i);
    vec2 posTemp = v*70.23+10.0*(numIters);
    float a = i * (TWO_PI/numIters+i*1.023);
    col += cos(TWO_PI*(posTemp.x*cos(a)+posTemp.y*sin(a)+fract(highsTime*TWO_PI*0.1)+i*fract(highsTime*TWO_PI*0.1)+sin(time*0.04)*10.0));
  }

  col /= 5.0;

  return vec3(col);
}

vec3 drippyColoring(float posMod, vec2 modCent){
  vec3 p = vec3((gl_FragCoord.xy)/(resolution.y)*(1.0+posMod),modCent.x+sin(highsTime*0.1));
  for (int i = 0; i < 40; i++){
    p.xzy = vec3(1.3,0.999,0.7-syn_BassPresence*0.1)*(abs((abs(p)/dot(p,p)-vec3(1.0,1.0,modCent.y*0.3))));
  }
  vec3 col = p;
  return col;
}

vec4 renderMain(void)
{
  beatTime += jump*4;
  if (auto_jumper<0.5){
    beatTime = jump*6;
  }

  vec2 modifiedCenter = 0.75+vec2(sin(beatTime*2*PI*0.0215),cos(beatTime*2*PI*0.0237))*1.5;
  if (PASSINDEX == 0.0){
    vec2 posBL = getNormPosBotLeft();
    posBL.x *=resolution.x/resolution.y;
    modifiedCenter.x *=resolution.x/resolution.y;
    posBL *= vec2(1.2, 1.0);
    modifiedCenter *= vec2(1.2, 1.0);
    vec2 modPos = posBL-modifiedCenter;
    modPos = modPos*modPos;
    float modder = modPos.x-modPos.y;
    // if (modder < 0.1){
    //   posBL = vec2(0.0);
    // }
    float bkgNoiseRegime = mod(floor(beatTime+modder),4.0)*2.0+4.0;
    vec3 col = resonancePattern(posBL, bkgNoiseRegime);
    // if (mod(floor(modder),2.0)==0.0){
    //   col = vec3(0.2)-col;
    // }
    float alpha = 1.0;
    if (slices>0.5){
      col *= mod(bkgNoiseRegime/2,2.0);
      alpha = mod(bkgNoiseRegime/2,2.0);
    }
    return vec4(col, alpha);
  }
  else if (PASSINDEX == 1.0){
    vec3 col;
    vec2 posBL = getNormPosBotLeft();
    vec2 modPos = posBL;
    modPos.x *=resolution.x/resolution.y;
    modPos *= vec2(1.2, 1.0);

      rgbZoomAmt*=sin(length(modPos-modifiedCenter)*2*PI)*1.0+0.5;
    
    

    vec2 rPos = (posBL - modifiedCenter)*(1.0/(1.0+rgbZoomAmt*0.05*5.0))+modifiedCenter;
    vec2 gPos = (posBL - modifiedCenter)*(1.0/(1.0+rgbZoomAmt*0.07*5.0))+modifiedCenter;
    vec2 bPos = (posBL - modifiedCenter)*(1.0/(1.0+rgbZoomAmt*0.03*5.0))+modifiedCenter;

    vec3 col1, col2, col3;
    col1 = vec3(1.0, 0.0, 1.0)*(1.0+rgbZoomAmt);
    col2 = vec3(1.0, 1.0, 0.0)*(1.0+rgbZoomAmt);
    col3 = vec3(0.0, 1.0, 1.0)*(1.0+rgbZoomAmt);
    if (whichTwoColors == 0.0){
      col1 = vec3(1.0)*0.33;
    } else if (whichTwoColors == 0.1){
      col2 = vec3(1.0)*0.33;
    } else if (whichTwoColors == 0.2){
      col3 = vec3(1.0)*0.33;
    }

    col1 *= texture(forRGBSplit, rPos).r;
    col2 *= texture(forRGBSplit, gPos).g;
    col3 *= texture(forRGBSplit, bPos).b;
    float alpha = texture(forRGBSplit, bPos).a;
    // return vec4(col1);
    col = col1+col2+col3;
    col *= vuFadeToBlack;

    // col += texture(forRGBSplit, posBL).bgr;

    vec3 colDrip = drippyColoring(rgbZoomAmt*0.01,modifiedCenter*0.5);
    col = pow(col,vec3(1.2));

    if (contrast == 1.0){
      colDrip = vec3(1.0)-colDrip;
      col = pow(col,vec3(2.0));
    }

    vec3 normCol = pow(1.0-texture(forRGBSplit, _uv).rgb,vec3(2.0));

    if (_isMediaActive()){
      col = mix(col*colDrip, _loadMedia().rgb*pow(colDrip,vec3(2.0)*normCol)*alpha, _loadMediaAsMask().r);
    } else {
      col *= colDrip;
    }


    return vec4(col,1.0);
  }
}
