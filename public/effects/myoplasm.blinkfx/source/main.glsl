float time = syn_HighTime * 0.6;
float cameratime = syn_Time * 0.25;
float shake = syn_BassLevel+syn_BassHits;
float darken = syn_BassPresence;
float size = syn_BassLevel;
float fade = syn_FadeInOut;

vec3 palette(float i){

    float T = 1400. + 1300.*i;
    vec3 spec =  vec3(7.4, 5.6, 4.4);
    vec3 spec1 = vec3(4.4, 5.6, 7.4);
    vec3 spec2 = vec3(7.4, 4.6, 5.4);
    vec3 spec3 = vec3(9, 10, 6);
    vec3 spec4 = vec3(6.0, 5.5, 5.0);
    spec = mix(spec, spec1, r1);
    spec = mix(spec, spec2, r2);
    spec = mix(spec, spec3, r3);
    spec = mix(spec, spec4, r4);
    // spec += spec*vec3(-0.0, 0.4, 0.0)*volume*c4;
    spec = pow(spec,vec3(5.0 - darken)) * (exp(1.43e5/(T*spec))-1.0);
    return 1.0-exp(-5e8/spec);
}

vec3 hash(vec3 n) {
  float p = sin(dot(n, vec3(7, 157, 113)));
  return fract(vec3(2097152, 262144, 32768)*p);
}

float voronoi(vec3 p){
  p.z += time - TIME;
  p*=zoom;
	vec3 b, r, g = floor(p);
	p = fract(p);

	// Maximum value
	float d = 1;

  float levelsFixed = 1000000;
  if (levels<0.99){
    levelsFixed = pow(levels,2.0)*100;
  } 

	for(float j = -1.; j < 1.01; j++) {
	    for(float i = -1.; i < 1.01; i++) {

		    b = vec3(i, j, -1.);
		    r = b - p + hash(g+b)*(1.0-arranged);
		    d = min(d, dot(r,r));

		    b.z = 0.0;
		    r = b - p + hash(g+b)*(1.0-arranged);
		    d = min(d, dot(r,r));

		    b.z = 1.;
		    r = b - p + hash(g+b)*(1.0-arranged);
		    d = min(d, dot(r,r));

        d = _pixelate(d, levelsFixed);
	    }
	}

  d += (c3+c1)*d*5*(1-size);
  d = pow(d, 0.5 + size/2);

	return d;
}

vec2 shakeUV (vec2 uv) {
  float amount = smoothstep(0.8, 1.0, shake);
  vec2 shaker= vec2(
                    _noise(      time) - 0.5,
                    _noise(100 + time) - 0.5
                    ) * 0.1;

  return uv + shaker * amount;
}

vec4 renderMain() {
  if (PASSINDEX == 0){
  	vec2 uv = _uvc;
    uv = mix(uv, uv*1.7, r3);
  	// uv += (vec2(sin(cameratime), cos(cameratime+1000)) - 0.5)*0.25;
    uv = shakeUV(uv);

  	vec3 rd = normalize(vec3(uv.x, uv.y, 3.1415926535898/8.0));

    // rd.xy = _rotate(rd.xy, (1-round(c2))*mod(time*0.25,2*PI));
    rd.xy = _rotate(rd.xy, -rotation);
    rd.xy-=xyPos*0.1;

  	float c = voronoi(rd*2);

  	c = max(c + dot(hash(rd)*2.-1., vec3(0.015)), 0.);

    c *= sqrt(c)*(1.5 + r3);
    vec3 col = palette(c);

    col = mix(1 - col, col, round(n3 + n2));

    if (color_mode > 0.5){
      col = 1.0-(col-(dFdx(col)+dFdy(col))*10.0);
    }

    if (_isMediaActive()){
      col = mix(col, 1.0-(col-(dFdx(col)+dFdy(col))*10.0), _loadMediaAsMask().r);
    }

  	return mix(texture(syn_FinalPass, _uv), vec4(clamp(col * fade, 0., 1.), 1.), pow(feedback,2.0));
  }
}
