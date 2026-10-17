
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

vec3 rgb2hsv(vec3 c)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 firstPass()
{
  vec2 pos = _uvc;
  vec2 polarPos = _toPolar(_uvc);
  vec3 dataCol = texture(firstBuffer, _uv).xyz;

  float s2 = syn_Presence*0.4;

  fromCentToUV(pos);
  pos = pos + dataCol.xy*(3.0+8.0*syn_MidPresence);
  pos = pos;
  vec3 oldCol = texture(firstBuffer, pos).xyz;
  float greenModder = fire;
  float redModder = 1.0;
  if (fire > 1.0){
    greenModder = (fire-1.0)*20.0;
  }
  if (_isMediaActive()){
    vec4 logoCol = _loadMediaAsMask();
    redModder = 0.3+length(logoCol)*(0.2+syn_HighHits)*0.9;
  } else {
    redModder = 1.0-fract(polarPos.x*s2*10.0+polarPos.x*(-3.0*_uv.y))*s2;
  }
    

  vec3 col = vec3(redModder, pow(_uv.y,greenModder)*0.6, 0.5);
  col += vec3(5.0)*step(length(_uvc-vec2(0.0,0.0+sun_pierce*0.2)),0.1+sun_pierce*0.1)*sun_pierce;


  col *= 1.5-polarPos.x;
  col += vec3(0.7*syn_HighHits*(smoothstep(fract(polarPos.y*10.0), 0.1, 0.2))*clamp((1.0-_uv.y*2.0),0.0,1.0), syn_HighLevel*abs(_uvc.y)*polarPos.x, 0.0);
  col += vec3(0.0,0.0,-0.5*syn_OnBeat*_uvc.y);
  col.z = mix(dataCol.z, col.z, 0.5-sun_pierce);

  bool frameRefresh = false;
  if ((manual_reset > 0.05)||((syn_BassHits > 0.5)&&(auto_reset>0.5))){
    frameRefresh = true;
    col = col;
    float mountainMotion = _uv.x+direction*TIME;
    oldCol = vec3(step(_uv.y+_fbm(mountainMotion), syn_BassPresence));
    // oldCol = vec3(tan(length(_uvc)));
  }

  vec3 finalCol = dataCol;
  if (mod(FRAMECOUNT,ceil(stutter))==0){
    finalCol = mix(col, oldCol, 0.5);
  }


  finalCol += step(dot(abs(_uvc), vec2(cos(bright*PI-0.1),sin(bright*PI))),0.00)*sqrt(bright);
  finalCol -= step(dot(abs(_uvc), vec2(cos(dark*PI-0.1),sin(dark*PI))),0.00)*sqrt(dark);

  // finalCol = mix(finalCol, 1.0-finalCol, data.g);

  // if (syn_HighHits>0.5){
  //   finalCol = mix(col, oldCol, 0.5);
  // }

  return finalCol;
}


//Second
vec3 secondPass()
{

  vec3 col = texture(firstBuffer, _uv).xyz*0.8;
               // + texture(secondFB, uv+d*vec2(1.,0.))
               // + texture(secondFB, uv+d*vec2(-1.,0.))
               // + texture(secondFB, uv+d*vec2(0.,-1.))
               // + texture(secondFB, uv+d*vec2(0.,1.))
               // );

  float intensity = 1.0-syn_Presence;
  col = col*intensity + pow(col, vec3(3.0))*(1.0-intensity);

  col += vec3(0.0,0.0,texture(firstBuffer, _uv+_fbm(_uv+TIME)*0.01).r)*syn_MidLevel*0.5;

  return col;
}

vec4 renderMain () {
  if (PASSINDEX == 0.0){
    vec3 col = firstPass();
    return vec4(col, 1.0);
  }
  else if (PASSINDEX == 1.0){
    vec3 col = secondPass();
    col = col*feedback+texture(secondBuffer, _uv-vec2(0.0,syn_BassLevel)*0.01).rgb*(1.0-feedback);
    return vec4(col, col.b);
  } else if (PASSINDEX == 2.0){
    vec3 col = texture(secondBuffer, _uv).rgb;
    if (invert >= 0.5){
      col = 1.0-col;
    }
    vec3 hsv = rgb2hsv(col);
    hsv.r += fract(hue);
    float actualLevels = smoothstep(0.0,0.25,levels)*10.0+smoothstep(0.25,0.5,levels)*50.0+smoothstep(0.5,0.75,levels)*500.0+smoothstep(0.75,1.0,levels)*10000.0;
    col = hsv2rgb(_pixelate(hsv,pow(actualLevels,0.5)));

    return vec4(col, 1.0);
  }

  return vec4(1.0, 0.0, 0.0, 1.0);
}
