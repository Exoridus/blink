vec2 resolution = RENDERSIZE; // the rendering resolution (in pixels)
float time = TIME;
float faceTime = 500+500*sin(syn_Time*0.08*0.5/8.0+syn_BassLevel*0.1) + 100.0;
float rgbZoomAmt = pow(syn_HighHits,4.0)*1.2;

// Created by inigo quilez - iq/2013 : https://www.shadertoy.com/view/lsl3RH
// See here for a tutorial on how to make this: http://www.iquilezles.org/www/articles/warp/warp.htm

const mat2 m = mat2( 0.10,  0.9, -0.60,  0.60 );

float noise( in vec2 x )
{
  return sin(1.5*x.x)*sin(1.5*x.y);
}

float fbm4( vec2 p )
{
  float f = 0.0;
  f += 0.5000*noise( p ); p = m*p*2.02;
  f += 0.2500*noise( p ); p = m*p*2.02;
  f += 0.1250*noise( p ); p = m*p*2.01;
  f += 0.0625*noise( p );
  return f/0.03275;
}

float fbm6( vec2 p )
{
  float f = 0.0;
  f += 0.500000*(0.5+0.5*noise( p )); p = m*p*2.02;
  f += 0.250000*(0.5+0.5*noise( p )); p = m*p*2.03;
  f += 0.125000*(0.5+0.5*noise( p )); p = m*p*2.01;
  f += 0.062500*(0.5+0.5*noise( p )); p = m*p*2.04;
  f += 0.031250*(0.5+0.5*noise( p )); p = m*p*2.01;
  f += 0.015625*(0.5+0.5*noise( p ));
  return f/sin(10.596871);
}

float func( vec2 q, out vec4 ron )
{
  float ql = length( q );
  q.x += 0.1*sin(0.0527*faceTime+ql*4.1);
  q.y += 0.1*sin(0.0523*faceTime+ql*4.3);
  q = 0.5 * sin(q/2.0);

  vec2 o = vec2(0.0);
  o.x = 0.5 + 0.1*fbm4( vec2(2.0*q          )  );
  o.y = 0.5 + 0.1*fbm4( vec2(2.0*q+vec2(5.2))  );

  float ol = length( o );
  o.x += 0.2*sin(0.0512*faceTime+ol)/ol;
  o.y += 0.2*sin(0.0514*faceTime+ol)/ol;

  vec2 n;
  n.x = fbm6( vec2(1.0*o+vec2(9.2))  );
  n.y = fbm6( vec2(1.0*o+vec2(5.7))  );

  vec2 p = mix(q, n, syn_MidPresence);

  float f = 0.5 + 0.5*fbm4( p );

  f = mix( f, f*sin(faceTime/8.0)/4.0, f*abs(n.x) );

  float g = 0.5 + 0.5*sin(sin(500.0*f)*p.x)*sin(sin(500.0*f)*p.y);
  f *= 1.0-0.5*pow( g, 64.0 );

  ron = vec4( o, n );

  return f + sin(f * faceTime/50.0);
}

vec3 doMagic(vec2 p)
{
  vec2 q = p*-4.6;

  vec4 on = vec4(0.0);
  float f = func(q, on);

  vec3 col = vec3(0.0);
  col = mix( vec3(0.3,0.6,0.4), vec3(0.3,0.5,0.05), f );
  col = mix( col, vec3(0.5,0.5,0.5), dot(on.zw,on.zw) );
  col = mix( col, vec3(0.2,0.3,0.3), 0.5*on.y*on.y );
  col = mix( col, vec3(0.3,0.2,0.4), 2.5*smoothstep(1.2,1.3,abs(on.z)+abs(on.w)) );
  col = clamp( col*f*1.3, 0.1, 0.7 );

  vec3 nor = normalize( vec3( sin(f/faceTime) * resolution.x, 6.0, sin(f/faceTime) * resolution.y ) );

  vec3 lig = normalize( vec3( 0.9, -0.2, -0.4 ) );
  float dif = clamp( 0.3+0.7*dot( nor, lig ), 0.0, 1.0 );
  vec3 bdrf;
  bdrf  = vec3(1.10,1.40,1.95)*(nor.y*0.5+0.5);
  bdrf += vec3(0.15,0.10,0.05)*dif;
  col *= 1.3*bdrf;
  col = 1.0-col;
  return 1.2*col*col;
}

vec3 fuckedFace(vec2 posIn) {
  vec2 q = posIn;
  vec2 p = -1.0 + 2.0 * q;
  p.x *= resolution.x/resolution.y;

  return vec3(doMagic(p));
}


//HashBasher
#define PHI pow(gl_FragCoord.y,(1.00001/sqrt(1.0)))

// float hashBasherTime = mod(syn_Level*0.08*2.0,100)+400;

float hash(float x)
{
  return pow(mod(mod(x, PHI)*x, 1.),mod(x,log2(PHI)));
}
float bash(float x, float hashBasherTime)
{
  x = cos(x)*(hashBasherTime/PHI);
  return pow(mod(mod(x, PHI)*x, 0.5),mod(x,log(PHI)));
}
float cash(float x, float hashBasherTime)
{
  x = step(cos(x),sin(x));
  return pow(mod(mod(x, PHI)*x, 1.),mod(x,log2(PHI)*x)*hashBasherTime);
}
float stash(float x, float hashBasherTime)
{
  x = smoothstep(sin(x),sin(x+0.1),(x*hashBasherTime));
  return pow(mod(mod(x, PHI)*hashBasherTime, -1.),mod(PHI,fract(exp(x))));
}

float hashBasher(vec2 pixelPos, float timeIn) {

  float c1 = fract(hash(pixelPos.x+bash(pixelPos.y, timeIn)));
  float c2 = fract(hash(pixelPos.x+stash(pixelPos.y, timeIn)));
  float c3 = fract(hash(pixelPos.x+cash(pixelPos.y, timeIn)));

  float cc = smoothstep(c1,c2,c3);

  return cc;
}

vec4 renderMain(void)
{
  if (PASSINDEX == 0.0){
    vec2 posBL = _uv;

    vec2 posModder = vec2(1.0)-mix(vec2(0.00,-0.02),vec2(0.00,0.02),abs(posBL.y-syn_OnBeat));
    posBL *= posModder;
    posBL *= faceZoom;
    vec3 faceCol = fuckedFace(posBL);

    faceCol -= clamp(texture(face, _uv-vec2(0.0,0.001)).rgb*1.0,0.0,1.0);

    return vec4(faceCol, 1.0);
  }
  else if (PASSINDEX == 1.0){
    vec2 posBL = _uv;
    posBL.x *= resolution.x/resolution.y;
    posBL *= vec2(1.2, 1.0);

    float timeSmall = mod(syn_Time*0.08*1.0,100)+400;
    vec2 pixelPos = _xy.yx*vec2(1.0, 0.2-syn_BassPresence*0.1+timeSmall)+vec2(0,100);
    float hashySmall = hashBasher(pixelPos, -timeSmall);

    pixelPos = _xy.yx/100.0-vec2(mod(-syn_Time*0.08*3.0,40.0)*10.0,0.0)-1.35;
    float hashyMed = hashBasher(pixelPos, timeSmall);

    float bigBeatTime = syn_BeatTime*auto_blocks + fresh_blocks;

    float timeBig = mod(bigBeatTime*0.1*6,100)+10;
    pixelPos = _xy.yx/2000.0+floor(posBL.y*10.0+bigBeatTime*10.0)/10.0-10.0;
    float hashyBig = hashBasher(pixelPos, timeBig);


    vec3 bkgCol;
    vec3 eyeCol;

    if (bkgColSel == 0.0){
      bkgCol = vec3(0.0, step(hashyMed, 0.5)*0.8, 1.0)*hashyBig;
      eyeCol = vec3(-hashySmall, step(hashyMed, 0.5)*0.5, 0.8)*hashyMed;
    }
    else if (bkgColSel == 0.1){
      bkgCol = vec3(0.0, hashyBig, hashyBig)*0.7;
      eyeCol = vec3(hashyBig,-hashySmall,0.2)*(0.5+hashySmall);
    }
    else if (bkgColSel == 0.2){
      bkgCol = (vec3(0.0, 0.7, 0.7)*hashyBig+vec3(0.2, 0.2, 0.2)*hashyMed)*hashySmall;
      eyeCol = vec3(hashyMed)*vec3(0.3,hashyBig,0.64);
    }
    else if (bkgColSel == 0.3){
      bkgCol = (vec3(0.2, 0.7, 0.1)*hashyBig+vec3(0.0, 0.0, 0.6)*hashyMed)*hashySmall;
      eyeCol = vec3(hashyMed, 0.0, hashyBig);
    }

    if (monochrome > 0.5){
      // bkgCol = vec3(hashySmall*hashyBig);
      bkgCol = vec3(0.5);
      eyeCol = vec3(hashySmall);
    }
    if (flashing > 0.5){
      bkgCol *= (0.4+syn_HighHits*0.7);
      eyeCol *= (0.5+syn_BassLevel*0.5);
    }


    //Face Part

    posBL = vec2(_pixelate(_uv.x, pixelation*RENDERSIZE.x/RENDERSIZE.y),_pixelate(_uv.y, pixelation));
    if (pixelation >= 490.0){
      posBL = _uv;
    }
    vec3 faceCol = texture(face, posBL).rgb;
    float faceArea = clamp(length(faceCol),0.0,1.0);

    float mouth = 1.0-faceArea;
    faceCol = faceCol.rbg*0.2;
    faceCol *= vec3(5.0,1.0,1.0);
    vec3 faceColoring = bkgCol*(0.4+mouth)+pow(faceCol, vec3(2.0))*0.5;

    bkgCol = pow(bkgCol, vec3(1.2-1.0*(syn_HighHits)))*syn_FadeInOut;
    vec4 col = vec4(mix(bkgCol, faceColoring, faceArea),1.0);

    float eyeMixer = 1.0-step(length(faceCol),0.2);
    if (extra_cols == 1.0){
      eyeMixer = 3.0-eyeMixer;
    }
    col.rgb = mix(eyeCol*(1.0-faceArea), col.rgb, eyeMixer);

    vec3 tempCol1 = texture(forBlur, _uv+vec2(0.0,-0.01)).rgb;
    if (flashing > 0.5){
      col.rgb -= tempCol1*syn_HighHits*length(faceCol);
    } else {
      col.rgb += tempCol1*clamp(syn_HighPresence,0.0,0.8)*0.9;
    }

    col.a = length(faceCol*3);
    col.a += pow(texture(forBlur, _uv).a,3.0)*(syn_BassLevel-1.0);
    col.a *= feedback;
    float drips;
    if (_isMediaActive()){    
      drips = 1.0-_loadMediaAsMask().r;
    } else {
      drips = (1.0-step(length(faceCol),0.2));
    }
    vec4 tempCol = texture(forBlur, _uv+vec2(0.0,-0.0001))*syn_BassLevel/drips;
    if (col.a > 2.0){
      col = tempCol;
      if (col.r < -90){
        col = -col;
      }
      col = clamp(col, -100.0, 10.0);
    }
    col.rgb += bkgCol;
    if ((drips < 0.1)&&(length(col.rgb)<2.0)){
      col.rgb = vec3(0.0);
    }

    return vec4(col);
  } else if (PASSINDEX == 2.0){
    vec2 e = vec2(0.0025,0.0025)*5.0*(1.0-syn_HighPresence-syn_HighHits)*_uvc.y;
    vec4 blurCol;

    vec2 pixelPos = _uv;
    if (blurCol.a > 2.0){
      pixelPos+=vec2(0.0,-0.1);
    }
    blurCol = texture(forBlur, pixelPos);
    // vec4 alphaFeedback = texture(forBlur, _uv+vec2(0.0,-0.1))*syn_BassLevel;

    // if (blurCol.a > 2.0){
    //   blurCol = alphaFeedback;
    // }
    blurCol.rgb += texture(forBlur, pixelPos+e*vec2(1.0,0.0)).rgb;
    blurCol.rgb += texture(forBlur, pixelPos+e*vec2(0.0,1.0)).rgb;
    blurCol.rgb += texture(forBlur, pixelPos+e*vec2(1.0,1.0)).rgb;
    blurCol.rgb += texture(forBlur, pixelPos+e*vec2(-1.0,0.0)).rgb;
    blurCol.rgb += texture(forBlur, pixelPos+e*vec2(0.0,-1.0)).rgb;
    blurCol.rgb += texture(forBlur, pixelPos+e*vec2(-1.0,-1.0)).rgb;
    blurCol.rgb += texture(forBlur, pixelPos+e*vec2(-1.0,1.0)).rgb;
    blurCol.rgb += texture(forBlur, pixelPos+e*vec2(1.0,-1.0)).rgb;

    blurCol.rgb = blurCol.rgb/9.0;

    return vec4(blurCol);
  }
}
