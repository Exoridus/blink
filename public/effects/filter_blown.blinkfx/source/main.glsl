// const float PI = 3.141592;

float colRegime = mod(color_palette, 10);

vec4 sigmoid(vec4 x){
  return x/(1.+abs(x));
}

float sigmoid(float x){
  return x/(1.+abs(x));
}

void fromCentToUV(out vec2 posIn){
  posIn *= 0.5;
  posIn += 0.5;
}

float triWave(float var, float period){
    float up = (abs(mod(var,period))-period/2)/period;
    float down = (abs(mod(-var,period))-period/2)/period;
    if (mod(var, period)<period/2){
        return up;
    } else {
        return down;
    }
}

vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d )
{
    return a + b*cos( 6.28318*(c*t+d) );
}

  // finalCol *= palette(fract(redAmt + grnAmt + bluAmt), vec3(0.420, 0.500, 0.500), vec3(0.500, 0.500, 0.500), vec3(0.600, 0.250, 1.200), vec3(0.500, 0.450, 0.500));


float cubicPulse( float c, float w, float x )
{
    x = abs(x - c);
    if( x>w ) return 0.0f;
    x /= w;
    return 1.0f - x*x*(3.0f-2.0f*x);
}

/**
 * Detects edges using the Sobel equation
 * @name syn_pass_edgeDetectSobel
 * @param  {sampler2D} smp texture you wish to detect edges on
 * @returns {float} edges
 */

float sobel_intensity(in vec4 color){
  return sqrt((color.x*color.x)+(color.y*color.y)+(color.z*color.z));
}
float sobel_helper(float stepx, float stepy, vec2 center, sampler2D tex){
  // get samples around pixel
  float tleft = sobel_intensity(texture(tex,center + vec2(-stepx,stepy)));
  float left = sobel_intensity(texture(tex,center + vec2(-stepx,0)));
  float bleft = sobel_intensity(texture(tex,center + vec2(-stepx,-stepy)));
  float top = sobel_intensity(texture(tex,center + vec2(0,stepy)));
  float bottom = sobel_intensity(texture(tex,center + vec2(0,-stepy)));
  float tright = sobel_intensity(texture(tex,center + vec2(stepx,stepy)));
  float right = sobel_intensity(texture(tex,center + vec2(stepx,0)));
  float bright = sobel_intensity(texture(tex,center + vec2(stepx,-stepy)));

  float x = tleft + 2.0*left + bleft - tright - 2.0*right - bright;
  float y = -tleft - 2.0*top - tright + bleft + 2.0 * bottom + bright;
  float color = sqrt((x*x) + (y*y))*pow((3.0-contrast)/3.0,2.0);
  return color;
}
float pass_edgeDetectSobel(sampler2D tex, vec2 texCoords){
  float stepSize = (1.0+cubicPulse(0.5, 0.4, abs(_uvc.y)-triWave(syn_BassTime*0.25,2*PI))*(0.2+pow(syn_BPMSin2/syn_BPMConfidence,2.0))*syn_BassLevel*30.0)*(1.0-motion_blur)*2.0;
  vec2 uv = gl_FragCoord.xy / RENDERSIZE.xy;
  // vec4 color = texture(tex, uv.xy);
  return sobel_helper(stepSize/RENDERSIZE.x, cubicPulse(0.5, 0.1+0.25*(1.0-abs(_uvc.y)), abs(_uvc.x)+abs(_uvc.y)-fract(syn_HighTime*0.25)*1.5+0.8)*_rand(_pixelate(_uvc.x*_uvc.y+_rand(sin(_uv.y*0.0001+TIME*0.1)), 400.0))*0.05*(0.2+syn_HighHits)+stepSize/RENDERSIZE.y, texCoords, tex);
}

vec3 colorPaletteChooser(float colReg, float var){
  vec3 paletteCol = vec3(0.5);
  if (colReg < 1.0){
    paletteCol = palette(var, vec3(0.420, 0.500, 0.500), vec3(0.500, 0.500, 0.500), vec3(0.600, 0.250, 1.200), vec3(0.500, 0.450, 0.500));
  } else if (colReg < 2.0){
    paletteCol = palette(var, vec3(0.500, 0.580, 0.500), vec3(0.190, 0.460, 0.500), vec3(0.760, 0.740, 0.580), vec3(1.000, 0.300, 0.490));
  } else if (colReg < 3.0){
    paletteCol = palette(1.0-var,vec3(0.500, 0.940, 0.900), vec3(0.600, 0.640, 0.350), vec3(0.680, 1.020, 0.405), vec3(0.380, 0.440, 0.095));
  } else if (colReg < 4.0){
    paletteCol = palette(var,vec3(0.500, 0.500, 0.500), vec3(0.500, 0.500, 0.500), vec3(0.500, 0.825, 0.750), vec3(0.500, 0.500, 0.500));
  } else if (colReg < 5.0){
    paletteCol = palette(1.0-var,vec3(0.000, 0.580, 0.453), vec3(0.848, 0.703, 0.110), vec3(0.700, 0.175, 0.542), vec3(0.000, 0.182, 0.915));
  } else if (colReg < 6.0){
    paletteCol = palette(var,vec3(0.129, 0.359, 0.072), vec3(0.933, 0.561, 0.616), vec3(0.334, 1.013, 0.882), vec3(0.597, 0.050, 0.885));
  } else if (colReg < 7.0){
    paletteCol = palette(var,  vec3(-0.060, -0.340, 0.100), vec3(0.940, 0.840, 0.713), vec3(0.600, 0.735, 0.7191), vec3(0.500, 0.260, 0.335));
  } else if (colReg < 8.0){
    paletteCol = palette(var,  vec3(-0.060, -0.340, 0.100), vec3(0.940, 0.840, 0.713), vec3(0.600, 0.735, 0.2191), vec3(0.500, 0.260, 0.335));
  } else if (colReg < 9.0){
    paletteCol = palette(var,vec3(0.000, 0.040, 0.073), vec3(0.000, 0.530, 0.420), vec3(0.485, 0.930, 0.931), vec3(0.400, 0.599, 0.520));
  } else if (colReg < 10.0){
    paletteCol = palette(1.0-var,vec3(1.040, 0.180, 0.260), vec3(0.053, 0.775, 0.330), vec3(0.142, 0.523, 0.800), vec3(0.242, 0.887, 0.000));
  }
  return paletteCol;
}

bool getAnimationMask(){
  vec2 shape = vec2(-2.0);
  if (animation_style < 1.0){
    return false; //do no modification
  } else if (animation_style < 2.0){
    vec2 tempPos = _uvc;
    return fract((0.001+syn_OnBeat+manual_animation)*10.0*(abs(tempPos.x)*(shape.x) + abs(tempPos.y)*shape.y)) < 0.05*abs(tempPos.y);
  } else if (animation_style < 3.0){
    vec2 tempPos = _uvc*(-1+(syn_ToggleOnBeat-(1.0-manual_animation)*0.5)*2.0);
    return (abs(_uvc.x)*fract(pow(syn_OnBeat+manual_animation,1.5)*20.0*dot((abs(tempPos)+0.5+_rand(_uvc)*0.1)*vec2(shape),abs(tempPos)*vec2(shape))) > 2.0*abs(tempPos.y));
  }
}

vec2 offsetTex(){
  return -_uv+((_uvc*vec2(1.0, RENDERSIZE.x/RENDERSIZE.y))*vec2((1.0+syn_BPMSin4*0.15), (1.0+syn_BPMSin4*0.125))+0.5)*0.5+0.25;
}

vec4 firstPass() {
  vec4 oldCol = texture(firstBuffer, _uv);
  vec4 newCol = vec4(0.0);

  if (!_isMediaActive()){
    newCol = vec4(0.0);
  } else if (syn_MediaType < 1.5){
    newCol = vec4(_loadMedia(offsetTex()).rgb, 1.0);
  } else {
    newCol = vec4(_loadMedia().rgb, 1.0);
  }

  if (getAnimationMask()){
    oldCol = 1.0-oldCol;
    newCol = 1.0-newCol;
  }

  // vec4 retCol = oldCol;
  // if (_rand(_pixelate(_uvc+syn_BeatTime,100.0))>0.5){
  //   retCol = _loadMedia();
  // }

  return vec4(mix(oldCol.rgb, newCol.rgb, motion_blur*motion_blur*motion_blur), oldCol.a);
  // return retCol;
}

vec4 secondPass() {
  vec4 oldCol = texture(firstBuffer, _uv);
  vec4 newCol = vec4(0.0);

  if (!_isMediaActive()){
    newCol = vec4(0.0);
  } else if (syn_MediaType < 1.5){
    newCol = vec4(_loadMedia(offsetTex()).rgb, 1.0);
  } else {
    newCol = vec4(_loadMedia().rgb, 1.0);
  }
  vec3 maxCol = max(oldCol.rgb, newCol.rgb);
  vec3 minCol = min(oldCol.rgb, newCol.rgb);

  vec3 colDiff = pow(maxCol-minCol,vec3(contrast));
  float colPicker = clamp(length(colDiff),0.0,1.0);
  colPicker = colPicker+color_oscillator*colPicker*sin(_uvc.y+TIME*0.2);
  if (colPicker > 1) colPicker = 1.0-(colPicker-1);


  vec3 paletteCol = vec3(0.0);
  if (invert_regime > 0.5){
    colPicker = 1.0-colPicker;
  }
  paletteCol = colorPaletteChooser(colRegime, colPicker);

  return vec4(paletteCol, 0.0);
}

vec4 thirdPass() {
  vec4 mainImg = texture(secondBuffer, _uv);
  float edges = pass_edgeDetectSobel(syn_Media, _correctMediaCoords());

  float colPicker = clamp(edges*0.5,0.0,1.0);
  colPicker = colPicker+syn_Presence*colPicker*sin(_uvc.y)+color_oscillator*colPicker*sin(_uvc.y+TIME*0.2);
  colPicker = clamp(colPicker, 0.0, 1.0);
  if (invert_regime > 0.5){
    colPicker = 1.0-colPicker;
  }

  // if (getAnimationMask()){
  //   colPicker = abs(0.5-colPicker*0.5);
  // }

  vec3 paletteCol = colorPaletteChooser(colRegime, colPicker);
  // return vec4(mainImg.a);
  return MODE_1_OR_2 < 0.5 ? vec4(paletteCol,0.0) : mainImg;
}

vec4 renderMain () {
  if (PASSINDEX == 0.0){
    return firstPass();
  }
  else if (PASSINDEX == 1.0){
    return secondPass();
  } else if (PASSINDEX == 2.0){
    return thirdPass();
  }
  return vec4(1.0, 0.0, 0.0, 1.0);
}
