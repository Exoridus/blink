float time = syn_Time*0.5;

float volume = syn_Hits;
float brightness = syn_HighHits;
float onBeat = syn_OnBeat;
float bassAccum = syn_BassLevel;
float speedTime = syn_Time * 0.3;
float bassTime = syn_BassTime * 0.3;
float randomizerBeat = syn_ToggleOnBeat;

vec2 resolution = RENDERSIZE;
float WIDTH = 888;
float HEIGHT = 500;

struct ColorRegime
{
  vec3 col1;
  vec3 col2;
};

ColorRegime reg1 = ColorRegime(vec3(1.0,0.7,0.25), vec3(0.8, 0.8, 1.0));
ColorRegime reg2 = ColorRegime(vec3(0.9,0.1,0.45), vec3(0.3,0.02,0.15));
ColorRegime reg3 = ColorRegime(vec3(0.0,0.3,0.7), vec3(0.7, 0.7, 1.0));
ColorRegime reg4 = ColorRegime(vec3(0.5,0.2,0.0), vec3(0.9, 0.8, 0.65));
ColorRegime reg5 = ColorRegime(vec3(0.0,0.7,0.0), vec3(0.2, 0.6, 1.0));

// Gets the pixel in the backbuffer at (X,Y)
float current(float x, float y) {
 return texture(backbuffer, vec2(x,y)).x;
}

// Gets the previous pixel in the backbuffer at (X,Y)
float past(float x, float y) {
 return texture(backbuffer, vec2(x,y)).y;
}

// Gets normal to surface based on scenedist
vec2 getNormal(vec2 pos){
  float x = pos.x;
  float y = pos.y;
  float eps = 1.0/WIDTH/2;
  return normalize(vec2(
    IMG_NORM_PIXEL(backbuffer, vec2(x + eps, y)).x - IMG_NORM_PIXEL(backbuffer, vec2(x - eps, y)).x,
    IMG_NORM_PIXEL(backbuffer, vec2(x, y + eps)).x - IMG_NORM_PIXEL(backbuffer, vec2(x, y - eps)).x));
  }

// Supplies a configuration for 'source' pixels generating waves
float configuration(float i) {
  float width = WIDTH;
  float height = HEIGHT;
  float xp = floor(gl_FragCoord.x) - (width/2.0);
  float yp = floor(gl_FragCoord.y) - (height/2.0);
  vec2 pos = vec2(xp,yp);
  
  if (_isMediaActive()){
    if (logo_type < 0.5){
      float logoFloat = _loadMediaAsMask().r;
      return volume*volume*1.0*logoFloat;
    }
  }
  
  // Concentric Circle
  if (i == 0.0) {
    vec2 mirrorPos = abs(pos);
    float disty = length(pos-vec2(height*0.2*sin(speedTime*2*PI*0.08+randomizerBeat),height*0.2*cos(speedTime*2*PI*0.124+randomizerBeat)));
    if(disty < 40.0) {
      return volume*volume*1.5*pow(disty/40.0,4.0);
    }
  // Big Concentric Circles
  } else if (i == 1.0) {
    if (mod(length(pos),height/2.0) <= 5.0) {
      return volume*volume*1.5;
    }
  // Random dots
  } else if (i == 2.0) {
    if(_rand(vec2(xp, yp)) < 0.001) {
      return volume*volume*(3+3*volume);
    }
  // Square
  } else if (i == 3.0) {
    if((abs(xp) == 100 && abs(yp) <= 100 )||( abs(xp) <= 100 && abs(yp) == 100)) {
      return volume*volume;
    }
  // Blotches
  } else if (i == 4.0) {
    float noise = _noise(vec3(_uv*20.0, speedTime));
      if (noise*noise - 0.9 > 0.0) {
        return volume*volume * noise*noise * 10.0;
      }
  // Motor boat in ocean
  } else if (i == 5.0) {
    float retVal = 0.0;
    for (int k=-2; k<=2; k++){
      if(xp == k*140 && abs(_uv.y-mod(-abs(k*1.5)+speedTime*0.5,10.0)/10.0) < .01) {
         retVal += 0.5;
      }
    }
    return retVal;
  }
  return 0.0;
}

// Supplies a configuration for putting "dead zones" in when bass hits
float bassConfiguration(float i) {
  float width = WIDTH;
  float height = HEIGHT;
  float xp = floor(gl_FragCoord.x) - (width/2.0);
  float yp = floor(gl_FragCoord.y) - (height/2.0);
  vec2 pos = vec2(xp, yp);

  if (_isMediaActive()){
    if (logo_type > 0.5){
      float logoFloat = _loadMediaAsMask().r;
      return 1.0*logoFloat;
    }  
  }

    // Concentric Circles
  if (i == 0) {
    if (mod(length(pos),height/5.0) <= 5.0) {
      return 1.0;
    }
    // Concentric Squares
  } else if (i == 2) {
    if (mod(max(abs(pos.x),abs(pos.y)),height/10.0) <= 2.0) {
      return 1.0;
    }
    // Random pixels
  } else if (i == 3) {
    if(_rand(floor(pos/20.0)*20.0) < 0.3) {
      return 1.0;
    }
    // Motor boat in ocean
  } else if (i == 4) {
    float retVal = 0.0;
    for (int k=-2; k<=2; k++){
      if(length(pos-vec2(160*k,-height/2+height*fract((TIME*0.02+bassTime*0.04-abs(0.1*k))))) < 50.0) {
        retVal += 1.0;
      }
    }
    return retVal;
    //big pixels
  } else if (i == 5) {
    if(_rand(100.243+floor(vec2(0.0,TIME)+pos/50.0)*50.0) < 0.2) {
      return 1.0;
    }
  }
//  } else if (i < 0.6) {
//    return 0.0;
//  }
  return 0.0;
}

float WAVESPEED = 0.2+0.05*cos((1.0-volume)*PI) + WAVE_SPEED;
// float WAVESPEED = 0.2;

// float config = 1;
// float bassconfig = 1;
// float colRegimeSelector = 2;


// Provides the actual wave simulation
vec3 passOne() {
  float pos;

  // vec2 coord = _rotate(gl_FragCoord.xy - RENDERSIZE/2, ROTATE) + RENDERSIZE/2;
  float rot_mod = ROTATE;
  if (abs(ROTATE)<0.015){
    rot_mod = 0;
  }
  float drift_mod = DRIFT;
  if (abs(DRIFT)<0.2){
    drift_mod = 0;
  }
  vec2 coord = _rotate(_uv - 0.5*vec2(1.0, RENDERSIZE.x/RENDERSIZE.y), rot_mod * abs(rot_mod)) + 0.5*vec2(1.0, RENDERSIZE.x/RENDERSIZE.y);
  coord += vec2(sin(TIME/10), cos(TIME/10)) * drift_mod / RENDERSIZE.y;

  coord += (vec2(
    _fbm(vec3(coord * 10, TIME)),
    _fbm(vec3(coord * 10, TIME + 100))
    )  - 0.5) * DISTORTION / 100;

  float x = coord.x;
  float y = coord.y;

  // Initlialize pixel if it hasnet been yet
  if(texture(backbuffer,vec2(x,y)).z != 0.25) {
    return vec3(0.0, 0.0, 0.25);
  }

  float r = WAVESPEED;

  // Calculate next positon based on diffrential equation
  float constDamping = 0.01;

  pos = r*r*(
    current(x-1/RENDERSIZE.x,y) + current(x+1/RENDERSIZE.x,y) +
    current(x,y-1/RENDERSIZE.y) + current(x,y+1/RENDERSIZE.y) -
    4 * current(x,y)) + 
    2 * current(x,y) - past(x,y) -
    - constDamping*(current(x,y) - past(x,y));

  // Alter position of pixel if it is one of the source pixels
  if (auto_painter >= 0.5){
    float configData = configuration(config);
    if (configData > 0) {
      pos = configData;
    }
  } else {
    float disty = length(_uvc-vec2(paint_position.x, paint_position.y)*vec2(1.0, RENDERSIZE.y/RENDERSIZE.x)*0.9);
    if(disty < 0.075) {
      pos = volume*volume*1.5*pow(disty+1.0,4.0);
    }
  }

//  pos = 1.0;
  float bassConfigData = bassConfiguration(bassconfig);
  if (bassConfigData > 0) {
    pos = pos*pow((1.0-bassAccum),0.2);
  }

  // fade out based on decay (DIFFERENT from damping)
  float decay = _scale(syn_FadeInOut, 0.90, 0.999);
  pos *= decay;

  // clamp position to make sure things dont get too wild
  pos = clamp(pos, -2.0, 2.0);

  // Return position, the last position
  return vec3(pos, current(x,y), 0.25);
}

// Renders the pixels to screen
vec3 passTwo() {
  vec2 uv = _uv - 0.5;
  vec3 data = IMG_NORM_PIXEL(backbuffer,_uv).rgb;
  //Height reaches 2.0, divide by half and then pow it.
  float height = pow(clamp(data.x/2.0,0.0,1.0),0.5);
//  float height = data.x;


  // Provide noise based coloring function
 // vec3 col = vec3(
 //     _fbm(vec3(_uv.x,_uv.y, TIME/30.0)),
 //     _fbm(vec3(_uv.x+10,_uv.y, TIME/30.0)),
 //     _fbm(vec3(_uv.x+20,_uv.y, TIME/30.0))
 //   );
 // col = mix(col, vec3(0.8, 0.8, 1.0), brightness * height);

  // mix gold with silver

  vec3 col1, col2, bkgCol;
  if (colRegimeSelector == 0){
    col1 = reg1.col1;
    col2 = reg1.col2;
  } else if (colRegimeSelector == 1){
    col1 = reg2.col1;
    col2 = reg2.col2;
  } else if (colRegimeSelector == 2){
    col1 = reg3.col1;
    col2 = reg3.col2;
  } else if (colRegimeSelector == 3){
    col1 = reg4.col1;
    col2 = reg4.col2;
  } else if (colRegimeSelector == 4){
    col1 = reg5.col1;
    col2 = reg5.col2;
  }

  bkgCol = vec3(0.0);
  vec2 norm = getNormal(_uv);
  vec2 light = vec2(sin(brightness+TIME/5.0), cos(brightness+TIME/5.0)*2.0);

  float ref = dot(norm, uv - light)/2.0;

  // uncomment to debug lighting
//   return vec3(ref);

  float colorMixer = clamp((1.0+0.5*sin(uv.x*3.973+speedTime*0.35) + 0.5*sin(uv.y*2.315+speedTime*0.4))/2.0,0.0,1.0);
//  colorMixer = mix(colorMixer, 1.0-colorMixer, brightness);

  vec3 col = mix(col1, col2, colorMixer);
  col = col*(1.0+5.0*pow(clamp(ref, 0.0, 0.9),3.0));

  // Mix to bkg, brightness based on wave height
  vec3 finalCol =  mix(bkgCol, col, height);

  if ((bassconfig >= 0.2&&bassconfig <0.3)||((bassconfig >=0.4)&&bassconfig == 0.5)){
    finalCol *= 2.5;
  }

  return finalCol * 2;
}

vec4 renderMain () {
    if (PASSINDEX == 0) {
      return vec4(passOne(),1.0);
    } else if (PASSINDEX == 1) {
      return vec4(passTwo()*(1-dot(_uv - 0.5,_uv -0.5)*2.3),1.0);
    } 
return vec4(0);
}
