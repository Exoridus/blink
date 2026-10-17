vec2 quadrantToPolar(vec2 uv){
  float r = length(uv);
  float theta = 0.0;
  float real = uv.x;
  float imag = uv.y;
  if (real >  0 && imag >= 0) theta = atan(imag/real);
  if (real <= 0 && imag >  0) theta = -1*atan(real/imag)+PI/2;
  if (real <  0 && imag <= 0) theta = atan(imag/real)+PI;
  if (real >= 0 && imag <  0) theta = -1*atan(real/imag)+3*PI/2;
  theta = theta/(2*PI);
  return vec2(r, theta);
}

vec2 resolution = RENDERSIZE;

float starFunc(vec3 p, float changer)
{
  float a = 0.0;
  float fp = 0.75+billions_and_billions*(-0.2)+(-0.08)*patterns_in_the_stars+0.001*changer;
  const int n = 12;
  float pa = 0.;
  int firstiter = 1+3*int(no_big_clumps);
  for(int i = 0; i < n; ++i)
  {
    p=abs(p)/dot(p,p)-fp;
    if (i>firstiter) a+=abs(length(p)-pa);
    pa=length(p);
  }
  
  a /= float(n);
  return pow(a,5.)*.125;
}

vec3 galaxy(vec3 start, vec3 dir)
{

  // float a1=.5+xy_cam.x*2.;
  // float a2=.8+xy_cam.y*2.;
  // mat2 rot1=mat2(cos(a1),sin(a1),-sin(a1),cos(a1));
  // mat2 rot2=mat2(cos(a2),sin(a2),-sin(a2),cos(a2));
  // dir.xz*=rot1;
  // dir.xy*=rot2;
  // vec3 from=vec3(1.,.5,0.5);
  // // from+=vec3(time*2.,time,-2.);
  // from.xz*=rot1;
  // from.xy*=rot2;
  // start = start+from;
  // start.x += fly_forward;

  vec3 c1 = vec3(1.7,1.4,0.2);
  vec3 c2 = vec3(0.2,0.8,1.0);
  vec3 c3 = vec3(8.7,1.2,1.4);
  vec3 c4 = vec3(0.7,0.2,0.1);
  vec3 c5 = vec3(1.7,1.2,1.1);
  float color_palette = 4.0;
  if (purple_stars>0.5){
    c1 = vec3(1.4,0.9,0.9);
    c2 = vec3(2.2,0.4,2.0)*0.5;
    c3 = vec3(0.7,4.2,7.4)*0.8;
    c4 = vec3(8.7,1.2,2.6)*0.8;
    c5 = vec3(3.7,0.7,6.1)*0.8;
  }
  vec3 c = vec3(0.0);
  vec3 p = vec3(0.0);
  float scaleAmt = 0.6-0.5*max(billions_and_billions, patterns_in_the_stars);

  // start.z = fly_forward;
  p = start+dir*mix(6.0, 1.0, flatten_layers);
  p.xyz *= scaleAmt;
  c += vec3(starFunc(p, 0.0)) * pow(c1*1.5,vec3(5.0))*0.01*pow(mix(syn_BassLevel, 1.0, 1.0-audio_brightness),2.0);
  
  p = start+dir*mix(2., 1.0, flatten_layers);
  p.xyz *= scaleAmt;
  c += vec3(starFunc(p, 1.0)) * c2*pow(mix(syn_BassLevel, 1.0, 1.0-audio_brightness),2.0)*1.5;

  p = start+dir*mix(.45, 1.0, flatten_layers);
  p.xyz *= scaleAmt;
  c += vec3(starFunc(p, 2.0)) * c3*pow(mix(syn_MidLevel, 1.0, 1.0-audio_brightness),2.0)*1.5;
    
  p = start+dir*mix(.65, 1.0, flatten_layers);
  p.xyz *= scaleAmt;
  c += vec3(starFunc(p, -1.0)) * c4*pow(mix(syn_BassLevel, 1.0, 1.0-audio_brightness),2.0)*1.5;
  
  p = start+dir*mix(.9, 1.0, flatten_layers);
  p.xyz *= scaleAmt;
  c += vec3(starFunc(p, -2.0)) * c5*mix(syn_HighHits, 1.0, 1.0-audio_brightness)*1.5;
    
  return c*0.02;
}

vec4 genDust() {
  vec2 p = _uvc*(2.0);
  p *= (1.0+_uvc*0.5*_pulse(0.3+length(_uvc), ripple_in_spacetime*1.6, 0.3)*1.0);
  float time= syn_Time*0.1+TIME*1.0;
  float time2 = syn_Time*0.1+TIME*1.0;
  float dustMotion = sin(TIME*0.035)*3.0;

  float an = 1.5 - 0.09*time;
  
  float a1 = 2.4 + 0.05*time2;
  // float a2 = 0.9 + (sin(TIME*0.35) / 20.0);
  float a2 = 0.9 + (dustMotion / 20.0);
  float a3 = -1.4;
  
  mat2 rot_a1 = mat2(cos(a1),sin(a1),-sin(a1),cos(a1));
  mat2 rot_a2 = mat2(cos(a2),sin(a2),-sin(a2),cos(a2));
  mat2 rot_a3 = mat2(cos(a3),sin(a3),-sin(a3),cos(a3));
  
  vec3 ro = vec3( 1.0*cos(an),  2.0*cos(an) ,5.);
  //ro.xy *= rot_a1;
  ro.xz *= rot_a2;
  ro.yz *= rot_a3;  
  
  vec3 rd = vec3(p.x*cos(an) + p.y*sin(an),p.x *(-sin(an)) + p.y*cos(an), 0.1);
  
  rd.xy *= rot_a1;
  rd.xz *= rot_a2;
  rd.yz *= rot_a3;
  
  vec3 bckg = galaxy(ro,rd);
        
  vec3 col = bckg;
  
  col = pow(col,vec3(0.5));
  
  return vec4(col,1.0);
}


vec2 hash(vec2 p) {
  mat2 m = mat2(  13.85, 47.77,
                99.41, 88.48
                );

  return fract(sin(m*p) * 46738.29);
}

vec2 getNormPos() {
  return vec2(-1+2*(gl_FragCoord.x/resolution.x),-1+2*(gl_FragCoord.y/resolution.y));
}

vec2 getNormPosBotLeft() {
  return vec2(gl_FragCoord.xy/resolution.xy);
}

float voronoi(vec2 p) {
  vec2 g = floor(p);
  vec2 f = fract(p);

  float distanceToClosestFeaturePoint = 1.0;
  for(int y = -1; y <= 1; y++)
  {
    for(int x = -1; x <= 1; x++)
    {
      vec2 latticePoint = vec2(x, y);
      float currentDistance = distance(latticePoint + hash(g+latticePoint), f);
      distanceToClosestFeaturePoint = min(distanceToClosestFeaturePoint, currentDistance);
    }
  }

  return distanceToClosestFeaturePoint;
}

vec3 balls(vec2 posIn) {

  float o = 0.0;
  vec3 color = vec3(.0);
  float ballMotion = syn_Time*0.5;
  for (int i = 1; i < 32; ++i) {
    float size = 0.01*i;

    vec2 uv = posIn;
    uv.x += sin(ballMotion*0.1 + o)*1.5 * sin(o * 7.2);
    uv.y += cos(ballMotion*0.3 + o) * cos(o * 12.7);
    float d = length(uv)-size;
    float ball = smoothstep(0.2, -0.01, d);

    vec4 prevColor = texture(backbuffer, gl_FragCoord.xy/resolution).rgba;
    color = color + vec3(0.5)*ball*mix(syn_MidHighHits, 0.5, 1.0-audio_brightness);

    o += 6.0;
  }

  return color;
}

vec4 doCindersPass0()
{
    vec2 pos = getNormPos();
    pos.x *= resolution.x/resolution.y;

    vec2 posBL = getNormPosBotLeft();
    float depth = 3.0-3.0*posBL.y;
    float time= syn_Time*0.1+TIME;

    vec2 noisePos = pos-1.0+2.0*_fbm(pos+time*0.0015);
    vec2 pulser = (_uvc*_pulse(0.3+pow(length(_uvc),0.9)*1.2, pow(ripple_in_spacetime,1.2)*1.6, 0.3))*30.0;
    float voroBkg = voronoi(noisePos*100.0 + pulser - vec2(10.0*sin(syn_HighTime*0.06),10.0*cos(syn_HighTime*0.06)));
    vec3 bkgCol = vec3(pow(voroBkg,10.0));

    vec3 ballCol = balls(pos*vec2(1.2,1.0));
    // ballCol = ;

    vec3 finalColor;
    finalColor = ballCol*bkgCol;
    // finalColor += bkgCol*(0.65+starry_night*0.35);

    return vec4(finalColor, 1.0);
}


vec4 renderMain(void)
{
  if (PASSINDEX == 0.0){
    return genDust();
	} else if (PASSINDEX == 1.0){
    vec4 feedbackCol = doCindersPass0()+texture(backbuffer, _uv)*pow(starry_night,0.4);
    // feedbackCol = clamp(feedbackCol*0.999, vec4(0.0), vec4(1.0));
    if (dot(feedbackCol.rgb, vec3(1.0))>1.0){
      feedbackCol -= 0.01*starry_night;
    }
    feedbackCol -= 0.002*starry_night*starry_night*starry_night;
    return feedbackCol;
  }
  else if (PASSINDEX == 2.0){
    vec3 ogCol = texture(backbuffer, _uv).rgb;
    vec3 col = ogCol;
    vec3 dustCol = texture(dustPass, _uv).rgb;
    // dustCol = mix(col, dustCol, layer_mix);
    // col = mix(col, dustCol, layer_mix);
    ;
    float colMix = min(star_dust_mix, 0.5);
    float dustMix = max(star_dust_mix, 0.5);

    col *= mix(0.0, 1.00, colMix)*2.0;
    dustCol *= mix(1.0, 0.0, dustMix)*2.0;
    vec3 nebulaCol = vec3(texture(base_img, abs(_uvc)).rgb)*1.0;
    nebulaCol *= (1.0-nebula_off);

    if (purple_stars>0.5){
      nebulaCol = nebulaCol*vec3(1.1, 0.5, 1.3)*0.8+0.15*nebulaCol.gbr;
    }
    vec3 mixedCol = pow(dustCol,vec3(1.0));

    vec3 logoCol = _loadMedia().rgb;
    if (syn_MediaType<0.5){
      logoCol = vec3(0.0);
    }

    mixedCol = mixedCol*nebulaCol*pow(logoCol,vec3(3.0)); //BUGBUG??

    float fbmmer = pow(_fbm(vec3(_uvc*10.0, syn_Time*0.01)),3.0)*2.0;

    vec3 logoMix = logoCol*fbmmer*1.0*pow(dustCol,vec3(2.0))*20.0;

    nebulaCol = pow(nebulaCol*fbmmer,vec3(3.0))*syn_FadeInOut;
    mixedCol *= syn_BassLevel;

    col = col*(1.0+syn_HighPresence)+dustCol+nebulaCol+mixedCol+logoCol*nebulaCol+logoMix + logoCol*dustCol*0.5 + logoCol*col*0.5 + logoCol*pow(syn_MidPresence,2.0)*0.0;

    vec3 col2 = ogCol*logoCol;
    vec3 col3 = dustCol*(1.0-logoCol);

    if(syn_MediaType>0.5){
      col = mix(col, col2*1.5+col3*1.5, _nclamp(media_split_mix));
      if (media_mask > 0.5){
        col *= _loadMediaAsMask().rgb;
      }
    }

    // col = ogCol*logoCol;
    col *= 1.1;
    return vec4(col, 1.0);
  }
}
