vec2 glitchPos;

float rand(vec2 uv, float t) {
    return fract(sin(dot(uv, vec2(1225.6548, 321.8942))) * 4251.4865 + t);
}
vec2 trueUV = _uv;
vec3 hash3( vec2 p )
{
    vec3 q = vec3( dot(p,vec2(127.1,311.7)), 
				   dot(p,vec2(269.5,183.3)), 
				   dot(p,vec2(419.2,371.9)) );
	return fract(sin(q)*43758.5453);
}

float lum(vec3 colIn){
  return dot(colIn, vec3(1.0))/3.0;
}

vec3 diamondsPattern(vec2 uvIn) {
	vec2 p = -0.5+uvIn;
	p = _rotate(p, PI/2.0);
	if (save_fps>0.5){
		return vec3(sin(cos(p.x+p.y+syn_BassTime*0.1)*10.0+p.x*100.0), sin(p.y*100.0+cos(p.x*10.0+syn_BassTime)), sin(p.x*sin(TIME)*10.0+p.y*100.0));
	}
	float f=0., f2=0., r = 0.0, r2 = 0.0;
  float timeVar = syn_BeatTime*beat_jump+TIME*0.05+syn_BPMTwitcher*0.05;
	const float I = 30.;
	vec2 p2 = vec2(-p);
	for(float i=1.; i<=I; i++) {
		if(abs(p.x)+abs(p.y)<1.+syn_Presence*0.25) {
		  r = cos(timeVar+.3*i)/2.;
		  p += atan(i*rand(vec2(i), syn_BeatTime*beat_jump))*0.1;
			if(p.x<2.*r) {
				p.x -= r-.5;
				p /= r+.5;
			} else {
				p.x -= r+.5;
				p /= r-.5;
			}
		  f = i/I;
		}
		if(abs(p2.x)+abs(p2.y)<1.+syn_Presence*0.25) {
		  r2 = cos(timeVar+.3*i)/2.;
		  p2 += atan(i*rand(vec2(i), syn_BeatTime*beat_jump))*0.1;
			if(p2.x<2.*r2) {
				p2.x -= r2-.5;
				p2 /= r2+.5;
			} else {
				p2.x -= r2+.5;
				p2 /= r2-.5;
			}
		  f2 = i/I;
		}
	}
	float colSpot = 1.0-floor(mod(f*13.3, 4.0));
	float colSpot2 = 1.0-floor(mod(f2*13.3, 4.0));

	colSpot = clamp(colSpot, 0.0, 1.0);
	colSpot2 = clamp(colSpot2, 0.0, 1.0);

	vec3 colOut = vec3(mix(colSpot+colSpot2, colSpot-colSpot2, mix_type));
  // vec3 colOut = _hsv2rgb(vec3(mix(0.7, 0.0, step(0.5, f)), colSpot, mod(f*17.7,2.0)-1.0));
  // colOut = clamp(colOut, 0.0, 1.0);
  // colOut = pow(colOut, vec3(2.0));
	return colOut;
}

float iqnoise( in vec2 x, float u, float v )
{
	x += anger_shake*glitchPos*RENDERSIZE;
  x += RENDERSIZE*_uvc*_pulse(length(_uvc)*length(_uvc), 0.5-pow(ripple_snap,0.5), 0.5*sqrt(ripple_snap))*0.2;

    vec2 p = floor(x);
    vec2 f = fract(x);
		
	float k = 1.0+63.0*pow(1.0-v,6.0);
	
	float va = 0.0;
	float wt = 0.0;
    for( int j=-2; j<=2; j++ )
    for( int i=-2; i<=2; i++ )
    {
      vec2 g = vec2( float(i),float(j) );
			vec3 o = hash3( p + g )*vec3(u,u,1.0);
			vec2 r = g - f + o.xy;
			float d = dot(r,r);
			float ww = pow( 1.0-smoothstep(0.0,1.414,sqrt(d)), k );
			va += o.z*ww;
			wt += ww;
    }
	
    return va/wt;
}

vec3 _grad3(vec3 col1, vec3 col2, vec3 col3, float mixVal){
    mixVal *= 2.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    return mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
}


vec3 loadMediaMirrored(vec2 offset){
  vec2 uv = _correctMediaCoords();
  uv = _applyMediaScale(uv);
  uv += anger_shake*glitchPos;
  uv += _uvc*_pulse(length(_uvc)*length(_uvc), 0.95-pow(ripple_snap,0.5)*1.5, 0.5*sqrt(ripple_snap))*0.2;
  uv += offset;
  
  vec3 colOut = vec3(0.0);

	if (_isMediaActive()){
		vec3 pat = diamondsPattern(uv*vec2(RENDERSIZE.x/RENDERSIZE.y, 1.0)-vec2(0.25*RENDERSIZE.x/RENDERSIZE.y, 0.0));
		if (media_glitch > 0.5){
			uv = uv*pat.rg;
		}
		if (mod(uv.x, 2.0) > 1.0){
    	uv.x = 1.0-uv.x;
  	}
  	if (mod(uv.y, 2.0) > 1.0){
    	uv.y = 1.0-uv.y;
  	}
		colOut = texture(syn_Media, uv).rgb;
		colOut = mix(colOut, colOut*pat, pattern_media_multiply);
	} else {
	  colOut = diamondsPattern(uv);
	}

  return colOut;
}

vec3 loadImageMirrored(sampler2D sampIn, vec2 offset){
	vec2 uv = _uv;  
  uv += offset;
  uv += anger_shake*glitchPos;
  uv += _uvc*_pulse(length(_uvc)*length(_uvc), 0.95-pow(ripple_snap,0.5)*1.5, 0.5*sqrt(ripple_snap))*0.2;
	if (mod(uv.x, 2.0) > 1.0){
    uv.x = 1.0-uv.x;
  }
  if (mod(uv.y, 2.0) > 1.0){
    uv.y = 1.0-uv.y;
  }
  
  return texture(sampIn, uv).rgb;
}

vec4 renderMain(void)
{
	glitchPos = 0.1*vec2(_statelessContinuousChaotic(TIME*100.0), _statelessContinuousChaotic(TIME*77.0));

	if (PASSINDEX == 0.0){
	  vec3 color = vec3(0.0);
	  float scale = 250.0;  
	  vec2 vigUv = _uv;
	  vec2 uv = _uv;
	  //Create Vignette Var
	  vigUv *=  1.0 - vigUv.yx;   //vec2(1.0)- uv.yx; -> 1.-u.yx; Thanks FabriceNeyret !
	  float vig = vigUv.x*vigUv.y * 15.0; // multiply with sth for intensity
	  vig = pow(vig, 0.6+vignette_invert*0.8); // change pow for modifying the extend of the  vignette
	  vig = mix(0.0, mix(vig, 1.0-vig, vignette_invert), vignette);
	  //Create voronoise
	  float voronoise = iqnoise(_uvc*scale*0.1+syn_BeatTime*10.0, 1.0, 0.4);
	  voronoise *= (1.0-vig);

	  //Create pixely noise
	  float voronoise3 = iqnoise(_uvc*scale*0.01+syn_BeatTime*10.0, 1.0, 0.1);
	  vec2 largePixels = _pixelate(_uvc, floor(20.0*(1.0+voronoise3)));
	  vec2 largerPixels = _pixelate(_uvc, 100.0);
	 	float voronoise2 = iqnoise(_rotate(_uvc, syn_BeatTime*10.0)*scale*0.1+syn_BeatTime*10.0+17.7, 1.0, 0.1);
	 	// return vec4(voronoise2);
	  uv = mix(voronoise2*uv, largePixels, step(0.5,rand(largerPixels, TIME*100.0)));
	  float smallNoise = rand(uv, TIME);
	  vec2 offset = (smallNoise - 0.5) * 2.0 * vec2(1.0);
	  // return vec4(abs(offset), 0.0, 0.0);
	  vec2 totOff = vec2(1.0,-1.0)*_uvc*2.0*offset*voronoise2;
	  totOff *= (syn_HighHits+glitch_constant);

	  // **** GLITCH ****
	  color = loadMediaMirrored(vec2(0.0)).rgb;
	  float lumAtOrig = lum(color);
	  vec3 noiseC = loadMediaMirrored(totOff*glitch_scale*0.05).rgb;
	  totOff = _rotate(totOff, PI*0.5);
	 	vec3 noiseM = loadMediaMirrored(totOff*glitch_scale*0.05).rgb;
	 	totOff = _rotate(totOff, PI*0.5);
	  vec3 noiseY = loadMediaMirrored(totOff*glitch_scale*0.05).rgb;
	  vec3 noise = noiseC*mix(vec3(1.0,0.0,0.0), vec3(0.0,1.0,1.0), rgb_vs_cmyk)+noiseM*mix(vec3(0.0,1.0,0.0), vec3(1.0,0.0,1.0), rgb_vs_cmyk)+noiseY*mix(vec3(0.0,0.0,1.0), vec3(1.0,1.0,0.0), rgb_vs_cmyk);
	  noise *= 2.0-rgb_vs_cmyk;

	  color = mix(color, max(color, noise), (glitch_flashes*sqrt(syn_HighHits)+glitch_constant)*(1.0-vig));



	  // **** FEEDBACK ****
	  float pixelateRoto = floor(voronoise2*16);
	  vec2 feedbackOffset = _rotate(vec2(1.0,0.0), pixelateRoto*PI*0.25);
	  float feedbackNoise = iqnoise(_uvc*scale*0.1+vec2(syn_BeatTime), 1.0, 0.4);
	  feedbackOffset *= feedback_scale*feedback_scale*feedback_scale*0.1;
	  vec3 last = loadImageMirrored(feedback, feedbackOffset).rgb;
	  float mixAmt = (1.0-vig);
	  mixAmt = clamp(mixAmt*feedback_amt, 0.0, 1.0);
	  color = mix(color, mix(last, max(color, last), feedback_style), mixAmt);


	  // **** FUZZ ****
	  vec2 fuzzyOffset = vec2(-0.5+_rand(_uv+TIME*0.743), -0.5+_rand(_uv+TIME*0.543))*0.1;
	  vec3 fuzzyImg = loadMediaMirrored(fuzzyOffset*fuzz_scale*mix(1.0, syn_BassLevel, fuzz_flashes));
	  vec3 fuzzyImg2 = loadMediaMirrored(-fuzzyOffset*fuzz_scale*mix(1.0, syn_BassLevel, fuzz_flashes));
	  fuzzyImg = fuzzyImg+fuzzyImg2;
	  float fuzzer = lum(fuzzyImg);
	  fuzzer *= fuzzer;
	  vec3 warmCol = _grad3(vec3(1.0,0.3,0.0), vec3(1.0,0.6,0.0), vec3(1.0,0.8,0.3), fuzzyImg.r*0.75+fuzzyImg2.g*0.75);
	  color += fuzz_flashes*warmCol*fuzzer*syn_BassLevel*(1.0-vig)+fuzz_constant*warmCol*fuzzer*(1.0-vig);


	  color = clamp(color, -1.0, 2.0);
	  return vec4(color, 1.0);
	} else if (PASSINDEX == 1.0){
		return texture(feedback, _uv);
	}

}

