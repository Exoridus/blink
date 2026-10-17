float rippleTimeIn = syn_BPMSin4;
float colorPhase = syn_HighHits;
float bassTimeInUncorrected = syn_BassTime;
float highsTimeInUncorrected = syn_HighTime;
float vuTimeInUncorrected = syn_Time;
float rgbZoomAmt = syn_BassExpoCurve;
float vuFadeToBlack = syn_FadeInOut;
float bassHits = syn_BassHits;

float mirrorOptionsArray[7] = float[7](0.100, 0.010, 0.001, 0.110, 0.101, 0.011, 0.111);
float mirrorOptionsSelector = floor(mod(mirror_change, 7.0));

vec2 resolution = RENDERSIZE; // the rendering resolution (in pixels)
float time = TIME;
uniform vec2 mousePos = vec2(0.5,0.5);
float bassTimeIn = bassTimeInUncorrected*6 + time;
float highsTimeIn = highsTimeInUncorrected*6 + time;
float vuTimeIn = vuTimeInUncorrected*6 + time;
float beatTime = syn_BPMTwitcher*2.5;

float timeIn = time/5.0;

// ***** for Mirror Pass *****/
vec2 getMirrorPos(vec2 pos, float mirrorOptions){
  //decoding a 3 decimal float into a bvec3. Hacky, but it makes keeps our uniforms only floats.
  bvec3 mirrorOptionsBVec = bvec3(false);
  float hundreds = floor(mirrorOptions/100.0);
  mirrorOptions -= hundreds*100;
  float tens = floor(mirrorOptions/10.0);
  mirrorOptions -= tens*10;
  float ones = mirrorOptions;

  if (hundreds==1.0) mirrorOptionsBVec.r = true;
  if (tens==1.0) mirrorOptionsBVec.g = true;
  if (ones==1.0) mirrorOptionsBVec.b = true;
  bool vertIfTrue = mirrorOptionsBVec.r;
  bool greaterHalfIfTrue = mirrorOptionsBVec.g;
  bool invertIfTrue = mirrorOptionsBVec.b;

  float mirrorVar;
  vec2 mirrorPos = pos;
  if (vertIfTrue){
    mirrorVar = pos.x;
  } else {
    mirrorVar = pos.y;
  }
  if (invertIfTrue){
    mirrorVar = abs(0.5-mirrorVar);
  }
  if (greaterHalfIfTrue){
    if (mirrorVar < 0.5){
      mirrorVar = (0.5-mirrorVar)+0.5;
    }
  } else {
    if (mirrorVar > 0.5){
      mirrorVar = 0.5+(0.5-mirrorVar);
    }
  }
  if (vertIfTrue){
    mirrorPos.x = mirrorVar;
  } else {
    mirrorPos.y = mirrorVar;
  }
  return mirrorPos;
}

// * FIRST PASS ------------------------------------------------------------------------------------------------------------------ */

vec2 getNormPosBotLeft() {
  return vec2(gl_FragCoord.xy/resolution.xy);
}

vec3 hsv2rgb(vec3 c)
{
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rgb2hsv(vec3 c)
{
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 spectralColor(float l){ // RGB <0,1> <- lambda l <400,700> [nm]
  l=l*300+400;
  float r=0.0,g=0.0,b=0.0;
  if ((l>=400.0)&&(l<410.0))      { float t=(l-400.0)/(410.0-400.0); r=    +(0.33*t)-(0.20*t*t); }
  else if ((l>=410.0)&&(l<475.0)) { float t=(l-410.0)/(475.0-410.0); r=0.14         -(0.13*t*t); }
  else if ((l>=545.0)&&(l<595.0)) { float t=(l-545.0)/(595.0-545.0); r=    +(1.98*t)-(     t*t); }
  else if ((l>=595.0)&&(l<650.0)) { float t=(l-595.0)/(650.0-595.0); r=0.98+(0.06*t)-(0.40*t*t); }
  else if ((l>=650.0)&&(l<700.0)) { float t=(l-650.0)/(700.0-650.0); r=0.65-(0.84*t)+(0.20*t*t); }
  if ((l>=415.0)&&(l<475.0))      { float t=(l-415.0)/(475.0-415.0); g=             +(0.80*t*t); }
  else if ((l>=475.0)&&(l<590.0)) { float t=(l-475.0)/(590.0-475.0); g=0.8 +(0.76*t)-(0.80*t*t); }
  else if ((l>=585.0)&&(l<639.0)) { float t=(l-585.0)/(639.0-585.0); g=0.82-(0.80*t)           ; }
  if ((l>=400.0)&&(l<475.0))      { float t=(l-400.0)/(475.0-400.0); b=    +(2.20*t)-(1.50*t*t); }
  else if ((l>=475.0)&&(l<560.0)) { float t=(l-475.0)/(560.0-475.0); b=0.7 -(     t)+(0.30*t*t); }

  return vec3(r,g,b);
}

float fireNoise(vec2 pos, float persistence, float scale, float time)
{
  float v = 0.0;
  float p = 1.0;
  int octaves = 10;
  for (int i=octaves-1; i>=0; --i)
  {
    v += (sin(pos.x)+cos(pos.y))*p;
    pos += sin(pos.yx+vec2(time, 0.6));
    p *= persistence;
    pos /= scale;
  }
  return v;
}


// * PASS SPLIT ------------------------------------------------------------------------------------------------------------------ */


float e = 0.02;
float radOfBackground = 40;
float radOrbIn;
float radOfInnerSphere;
float radMoon;
float radMoonOrbitInput;
float radMoonOrbit;
float glowAmt = 2.0+colorPhase*4.0;
float bassTime = bassTimeIn/50.0;

vec2 getNDCAspectCorrected() {
  vec2 pos = vec2(-1+2*(gl_FragCoord.x/resolution.x),-1+2*(gl_FragCoord.y/resolution.y));
  float aspectRatio = resolution.y/resolution.x;
  pos.y *= aspectRatio;
  return pos;
}

vec3 rotate(vec3 vector){
  return vector;
}

vec3 offset(vec3 pos, vec3 amount) {
  return pos - amount;
}

float distSphere(vec3 pos, float radius, vec3 origin) {
  vec3 posOffset = offset(pos, origin);
  return length(posOffset) - radius;
}

float invertedSphere( vec3 pos, float radius, vec3 origin) {
  vec3 posOffset = offset(pos, origin);
  return radius - length(posOffset);
}

float distOrb(vec3 pos) {
  return distSphere(pos, radOfInnerSphere, vec3(0.0));
}

float distMoon(vec3 pos, vec3 originMoon){
  return distSphere(pos, radMoon, originMoon);
}

vec2 distUnion(vec3 pos, float r, vec3 originMoon){
  vec2 distData;
  float distO, distBkg, moonDist;
  distO = distOrb(pos);
  moonDist = min(distMoon(pos, originMoon), distMoon(pos, -originMoon));
  distBkg = invertedSphere(pos, r, vec3(0.0));
  float objIndex;
  if (min(distO, moonDist)<distBkg){
    objIndex = 1.0; //moon or orb at 1.0
  }
  else {
    objIndex = 2.0;
  }
  if (objIndex < 2.0){
    distData.r = _smin(moonDist,distO, 2.0);
    objIndex = clamp(1.0-0.1*abs(distO-moonDist),0.0,1.0);
  }
  else if (objIndex == 2.0){
    distData.r = distBkg;
  }
  distData.g = objIndex;
  return distData;
}

#define PHI pow(gl_FragCoord.x,(1.00001/sqrt(1.0)))

float hash(float x)
{
  return pow(mod(mod(x, PHI)*x, 1.),mod(x,log2(PHI)));
}
float bash(float x)
{
  x = cos(x)*(time/PHI);
  return pow(mod(mod(x, PHI)*x, 0.5),mod(x,log(PHI)));
}
float cash(float x)
{
  x = step(cos(x),sin(x));
  return pow(mod(mod(x, PHI)*x, 1.),mod(x,log2(PHI)*x));
}
float stash(float x)
{
  x = smoothstep(sin(x),sin(x+0.1),(x));
  return pow(mod(mod(x, PHI), -1.),mod(PHI,fract(exp(x))));
}

mat2 rot(float angle){
  return mat2(cos(angle),-sin(angle),
              sin(angle),-cos(angle));
}

vec3 weirdTex(vec3 pos) {

  float c1 = fract(hash(pos.x+bash(pos.y)));
  float c2 = fract(hash(pos.x+stash(pos.y)));
  float c3 = fract(hash(pos.x+cash(pos.y)));

  vec3 cc = vec3(smoothstep(c1,c2,c3));

  //	     col.xy *= rot(time/PHI);
  //	     col.xz *= rot(time/col.y);
  //	     col.yz *= rot(time/col.x);

  return vec3(cc);

}

vec2 getMirrorPosSimple(vec2 pos, int horVert) {
  vec2 newPos = pos;
  if (horVert == 0){
    newPos.x = abs(newPos.x);
  }
  if (horVert == 1){
    newPos.y = abs(newPos.y);
  }
  return newPos;
}

float triGen(vec2 pos, float grower){
  pos.x *= (resolution.x / resolution.y);
  pos *= vec2(3.0,2.0)*2.0;
  pos += vec2(0.0,0.2);
  pos.x = abs(pos.x);
  pos.y += abs(pos.x);
  
  //        float r = triRand(sin(pos.y), grower);
  float retVal;
  if (refract_type < 0.5){
    retVal = 0;
  } else if (refract_type < 1.5){
    retVal = tan(pos.y+beatTime*0.5);
  } else if (refract_type < 2.5){
    retVal = atan(pos.y*1000.0*(1.0-0.2*cos(beatTime))-pos.x*1000.0*(1.0-0.2*sin(beatTime)))*5.0;
  }

  if (_isMediaActive()){
    retVal = length(_uvc+vec2(sin(TIME*0.5),cos(TIME*0.567)))*_loadMediaAsMask().r*3.0;
  }
  
  return retVal;
}

vec4 loadMask(sampler2D imageName, vec2 imageSize) {
  float wr = RENDERSIZE.x/imageSize.x;
  float hr = RENDERSIZE.y/imageSize.y;
  float ratio = min(wr, hr);
  vec2 uv = _uv;
  
  uv.y *= hr/ratio;
  uv.x *= wr/ratio;
  
  uv.x += -wr/ratio/2 + 0.5;
  uv.y += -hr/ratio/2 + 0.5;
  
  if (uv.x < 0.0 || uv.y < 0.0 || uv.y > 1.0 || uv.x > 1.0) {
    return vec4(0.0);
  }
  
  vec4 colorOut = texture(imageName, uv);
  colorOut *= colorOut.a;
  
  if (max(max(colorOut.r,colorOut.g),colorOut.b) >= 0.25){
    colorOut = vec4(1.0);
  } else {
    colorOut = vec4(0.0);
  }
  
  return colorOut;
}

vec4 renderMain(void){
  radOrbIn = _scale(syn_Intensity, 0.0, 9.0);
  radOfInnerSphere = 2.0+radOrbIn+colorPhase*0.3;
  radMoon = 1.0+radOrbIn/2.0;
  radMoonOrbitInput = _scale(syn_BassLevel, 1.0, 4.0);
  radMoonOrbit = pow(radMoonOrbitInput/3.0,2.0)*3.5+radOrbIn*radMoonOrbitInput/4.0;
  glowAmt = 2.0+colorPhase*4.0;
  bassTime = bassTimeIn/50.0;

  if (PASSINDEX == 0){
    vec3 col;
    vec2 pos = getNormPosBotLeft();

    float rippleAmt = 0.1*smoothstep(0.0, 0.5, abs(pos.y - rippleTimeIn*1.0));
    pos.y += rippleAmt;

    //Create fireNoise pattern in two floats
    float colNoise = 0.0;
    float briNoise = 0.0;
    float c = fireNoise(pos*10.0, 0.5, 0.5, highsTimeIn/6.0);
    for (int i=0; i<10; i++){
      colNoise += cos(c*pow(2.0,i-0.0)*0.5+0.5)/10.0;
      briNoise += cos(c*pow(2,i-4.0))/9.0;
    }
    //Create pattern in color
    col = spectralColor(colNoise*0.3+0.87)*(2.0*pow(briNoise,1.3));

    //Final color shifting
    col = rgb2hsv(col);
    col.x = fract(col.x+timeIn*0.05+0.2*sin(pos.y*2.8)+0.8*col.b+colorPhase*0.4);
    col = hsv2rgb(col);

    return vec4(col, 1.0);
  }

  else if (PASSINDEX == 1){
    vec3 col;
    //Moon Motion
    float orbitTime = bassTime*0.9;
    float sM = orbitTime; //Radial motion
    float orbitHemisphere = floor(mod(orbitTime,2.0)); //Says which half of orbit its in. Important to get phi smooth.
    float tM = PI*mix(fract(orbitTime),-1+fract(orbitTime),orbitHemisphere); //Updown angle from 0 to PI
    vec3 surfaceOfSphereMoon = vec3(cos(sM) * sin(tM), cos(tM), sin(sM) * sin(tM));
    vec3 originMoon = radMoonOrbit*surfaceOfSphereMoon;

    //Camera moves around surface of sphere at r = 25 always looking towards center
    float rad = 30;
    float camTime = vuTimeIn/200.0+0.01;
    float camOrbitHemisphere = floor(mod(camTime,2.0));
    float s = PI*mix(camTime*0.2,0.2*camTime+1.0,camOrbitHemisphere);
    float t = PI*mix(fract(camTime),1.0-fract(camTime),camOrbitHemisphere);
    vec3 surfaceOfSphere = vec3(cos(s) * sin(t), cos(t), sin(s) * sin(t));
    vec3 camOrigin = rad*surfaceOfSphere;
    vec3 camLookAt = vec3(0.0);

    //Camera Setup
    vec3 camUpVector = mix(vec3(0.0,1.0,0.0),vec3(0.0,-1.0,0.0),camOrbitHemisphere);
    vec3 vpn = normalize(camLookAt-camOrigin);
    vec3 u = normalize(cross(camUpVector,vpn));
    vec3 v = cross(vpn,u);
    vec3 vcv = (camOrigin+vpn);
    vec2 vPos = getNDCAspectCorrected()*vec2(1.15,1.0);
    vec3 scrCoord = vcv+vPos.x*u*0.8+vPos.y*v*0.8;
    vec3 rayPath = normalize(scrCoord-camOrigin);

    //Raymarching
    const float maxd = 100.0; //Max Depth
    float dist = 10.0; //greater than 0.01
    float depth=0.0;

    vec3 rayPos;
    vec2 objData;
    vec3 colGlow = vec3(0.0);
    float glowDist;
    vec2 planetCoords = vec2(1.0,1.0);

    //Raymarching loop
    for(int i=0; i<20; i++){
      if ((abs(dist) < 0.001)|| (depth > maxd)) {
        break;
      }

      //Find rayPos where contact with object occurs
      rayPos = camOrigin+rayPath*depth;
      vec3 normalToSurface = normalize(rayPos);
      planetCoords.x = 0.5 - atan(normalToSurface.z, normalToSurface.x) / (2*PI);
      planetCoords.y = 0.5 - asin(-normalToSurface.y) / PI;
      planetCoords *= vec2(0.63,1.0); //Vec2(0.63,1.0) is a magic number to make it seamless.
      vec4 sunTexData = texture(sunTexIn, planetCoords);

      objData = distUnion(rayPos, radOfBackground, originMoon);
      dist = objData.r;
      depth += dist;

      //at every step along the way, if you are close to the surface of the sun, color yourself
      if (mod(i,2)==0){
        glowDist = distOrb(rayPos)+_rand(planetCoords)*2.0;
        if ((glowDist < 4.0)){
          vec3 colFixed = pow(sunTexData.rgb,vec3(3.5));
          if (color_scheme>0.5){
            colFixed = mix(vec3(0.0), color_high, (0.01+length(colFixed)*0.5)*glowDist);
          }
          vec3 tempColGlow = 0.9*(1/(glowDist*0.2+0.5))*colFixed;
          colGlow += tempColGlow*glowAmt;
        }
      }
    }
    colGlow *= intns_atmos;

    //Post stepping coloring
    if (depth < maxd){
      if (objData.g < 2.0){
        //Color Sun and Moon the same, but check if the blob is very detached by using origin moon. Then make it darker.
        col = texture(sunTexIn, planetCoords).rgb*mix(0.2, 1.0, clamp(1.0+radOfInnerSphere-length(rayPos),0.0,1.0))*2.0;
        if (color_scheme>0.5){
          col = mix(vec3(0.0), color_low, pow(length(col),2.0)*2.0);
        }
      }
      else {
        col = vec3((abs(rayPos.z))/400.0)*weirdTex(rayPos/1000.0);
      }
      col *= intns_planet;
    }
    else {
      col = vec3(0.0);
    }
    col += colGlow;
    //Final color mixing
    col.g *= 0.8;
     return vec4(col,1.0);

  }
  else if (PASSINDEX == 2){
    vec2 posBL = getNormPosBotLeft();
    vec2 mirrorPos;
    if (mirror_on > 0.5){
      mirrorPos = getMirrorPos(posBL, mirrorOptionsArray[int(mirrorOptionsSelector)]*1000.0);
    } else {
      mirrorPos = posBL;
    }
     return texture(forMirroring, mirrorPos);
  }
  else if (PASSINDEX == 3){
    vec3 col;
    vec2 posBL = getNormPosBotLeft();
    vec2 posTri = getNDCAspectCorrected();
    posTri = getMirrorPosSimple(posTri, 1);
    posTri *= vec2(0.5,-1.0);
    float tri = triGen(posTri, rgbZoomAmt*0.5);
    posBL = posBL + posBL*tri*0.01;
    if (RGB_Split > 0.5){
      vec2 modifiedCenter = vec2(cos(time), sin(time))*0.5;
      vec2 rPos = (posBL - modifiedCenter)*(1.0/(1.0+rgbZoomAmt*0.31*sin(time*0.23)))+modifiedCenter;
      vec2 gPos = (posBL - modifiedCenter)*(1.0/(1.0+rgbZoomAmt*0.398*sin(time*0.2)))+modifiedCenter;
      vec2 bPos = (posBL - modifiedCenter)*(1.0/(1.0+rgbZoomAmt*0.33*sin(time*0.3)))+modifiedCenter;

      rPos = abs(rPos);
      if (rPos.x >= 0.9999){
        rPos.x = 0.9999-rPos.x;
      }
      if (rPos.y >= 0.9999){
        rPos.y = 0.9999-rPos.y;
      }

      gPos = abs(gPos);
      if (gPos.x >= 0.9999){
        gPos.x = 0.9999-gPos.x;
      }
      if (rPos.y >= 0.9999){
        gPos.y = 0.9999-gPos.y;
      }

      bPos = abs(bPos);
      if (bPos.x >= 0.9999){
        bPos.x = 0.9999-bPos.x;
      }
      if (rPos.y >= 0.9999){
        bPos.y = 0.9999-bPos.y;
      }

      col.r = texture(forRGBSplit, rPos).r;
      col.g = texture(forRGBSplit, gPos).g;
      col.b = texture(forRGBSplit, bPos).b;
    }
    else {
      col = texture(forRGBSplit, posBL).rgb;
    }

    col *= vuFadeToBlack;

    return vec4(col,1.0);
  }
}
