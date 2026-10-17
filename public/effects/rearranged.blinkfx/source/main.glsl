
#line 0

float cubicPulse( float c, float w, float x )
{
    x = abs(x - c);
    if( x>w ) return 0.0f;
    x /= w;
    return 1.0f - x*x*(3.0f-2.0f*x);
}

// ******** BOX *********
const float pi = 3.14159;

float time = TIME;
vec2 mouse = vec2(0.5);

float rand(vec3 co){
    return 0.9+0.1*fract(sin(co.z+dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
}


vec3 rotate(vec3 v,vec2 r) 
{
  mat3 rxmat = mat3(1,   0    ,    0    ,
        0,cos(r.y),-sin(r.y),
        0,sin(r.y), cos(r.y));
  mat3 rymat = mat3(cos(r.x), 0,-sin(r.x),
           0    , 1,    0    ,
        sin(r.x), 0,cos(r.x));
  
  
  return (v*rxmat)*rymat;
  
}

vec3 norm(vec3 v)
{
  //box made of 6 planes
  float tp = dot(v,vec3(0,-1,0))*3.;
  float bt = dot(v,vec3(0,1,0))*3.;
  float lf = dot(v,vec3(1,0,0))*3.;
  float rt = dot(v,vec3(-1,0,0))*3.;
  float fr = dot(v,vec3(0,0,1))*3.;
  float bk = dot(v,vec3(0,0,-1))*3.;
  
  return v/min(min(min(min(min(tp,bt),lf),rt),fr),bk);
}

float grid(vec3 v)
{
  float g;
  
  g = (length(v));
  g = (1.0-(g*g)*2.0)*2.0*rand(v);
  return g*g-0.125*cos(fract(time)*pi*2.0);
}

vec3 boxPattern( void ) {

  vec2 res = vec2(RENDERSIZE.x/RENDERSIZE.y,1.0);
  vec2 p = ( gl_FragCoord.xy / RENDERSIZE.y ) -(res/2.0);
  
  p = mix(p,p * (1.0-dot(p,p)*1.5),length(p)*1.5);
  
  vec2 m = vec2(syn_Presence+syn_BassLevel*0.3+syn_Time*0.01, syn_BPMTwitcher*0.1)*pi*vec2(2.,1.);
  
  vec3 color = vec3(0.0);
  
  vec3 pos = norm(rotate(vec3(p,0.5),vec2(m)));
  
  float c = grid(pos);
  return pos;
}

// ******** MAIN *********

vec4 renderMain(void)
{
	vec3 bkgGradient = mix(_normalizeRGB(251,131,104), _normalizeRGB(239, 109, 119), 1.0-_uv.x);
	vec3 bkgGradientInv = mix(_normalizeRGB(239, 109, 119), _normalizeRGB(251,131,104), 1.0-_uv.x);

	vec2 uv = _uv;
	vec2 uvc = _uvc;
	if (rotating > 0.5){
		uvc = _rotate(uvc, syn_CurvedTime*0.1);
		uv = _rotate(_uvc,syn_CurvedTime*0.1)*vec2(RENDERSIZE.y/RENDERSIZE.x, 1.0)+0.5;
	}

	vec2 gridSpace = mod(uvc*4.5*pow(2, ceil(resolution)), 2.0)-1.0;

	float xDivisor = 4.0*pow(2, ceil(resolution));
	float yDivisor = 2.25*pow(2, ceil(resolution));
	vec2 index = vec2(floor(uv.x*xDivisor), floor((uv.y-0.5)*yDivisor));
	float selectedOne = step(0.9, _rand(pow(2, index.x/xDivisor)*pow(2, index.y/yDivisor) + floor(syn_BPMTwitcher)));
	float selectedOthers = step(0.7, _rand(pow(2, index.x/xDivisor)*pow(2, index.y/yDivisor)*273.2 + floor(syn_BPMTwitcher)));

	float sizeMod = (ceil(resolution)/6.0)*0.2;
	float circ = 1.0-smoothstep(0.12+sizeMod, 0.22+sizeMod, 
		length(gridSpace)-
		selectedOne*pow(syn_OnBeat,0.4)*(0.4+sizeMod));
	vec3 circCol = mix(_normalizeRGB(72, 196, 201),vec3(1.0),selectedOne*syn_OnBeat)*(0.2+0.8*syn_Presence);
	circCol = mix(circCol, bkgGradient, cubicPulse(uv.y+abs(uvc.x), 0.4, fract(TIME*0.2)*2.0-0.3)*selectedOthers);
	circCol *= circ;
	// circCol -= circ*cubicPulse(uv.y+abs(uvc.x), 0.4, (syn_BPMTri2/syn_BPMConfidence)*2.0-0.3)*0.2;

	float noise = _rand(uv*10.0+_pixelate(TIME, 10.0))*0.1;

	float shading = length(gridSpace)*pow(syn_BassLevel,2.0)*2.5;

	vec3 finalCol = vec3(0.0);

	finalCol += pulser*cubicPulse(0.8*index.y/yDivisor, 0.2+selectedOne*0.9, (-1.0+2.0*scanDirection)*(fract(syn_BPMTwitcher)*1.2-1.0+0.2*(1.0-scanDirection)))*cubicPulse(length(gridSpace*2.0),0.1,0.5+sizeMod*3.0);

	vec2 smallGridSpace = mod(uvc*4.5*pow(2, ceil(resolution_2)), 2.0)-1.0;
	float smallXDiv = 4.0*pow(2, ceil(resolution_2));
	float smallYDiv = 2.25*pow(2, ceil(resolution_2));
	vec2 smallIndex = vec2(floor(uv.x*smallXDiv), floor((uv.y-0.5)*smallYDiv));

	vec3 image = pow(boxPattern(),vec3(4.6))*200.0;
	if (_isMediaActive()){
		image = _textureMedia(vec2(smallIndex.x/smallXDiv, smallIndex.y/smallYDiv + 0.501)).rgb;
	}
	float imgBri = dot(image, vec3(1.0))/3.0;

	float circSmall = 1.0-smoothstep((0.0+imgBri*0.8*(0.5+syn_HighHits*0.5))*intensity, (0.05+imgBri*0.8*(0.5+syn_HighHits*0.5))*intensity, 
	length(smallGridSpace));

	// finalCol = vec3(index.x/xDivisor, index.y/yDivisor, 0.0)+selectedOne-circ - length(circSpace);
	// finalCol = vec3(step(gridSpace.x*gridSpace.y,0.7));
	vec3 userImageCol = vec3((-1.0+black_or_white*2.0)*circSmall);

	finalCol += mix(bkgGradient, bkgGradientInv, shading)+userImageCol*grid_2-noise;
	vec2 angle = vec2(1.0);
	if (shape_angle>0.5){
		gridSpace.y = -gridSpace.y;
	}
	float modder = gridSpace.x*angle.x+gridSpace.y*angle.y;
	if (shape_type_2 > 0.5){
		modder = gridSpace.x*gridSpace.y;
	}
	if (shape_type_1 > 0.5){
		modder = abs(modder);
	}
	if (mask > 0.5){
		finalCol -= smoothstep(0.45,0.5, pow(modder,3.0));
	}
	
	finalCol *= (1.0-circ*grid_1);
	finalCol += circCol*grid_1;

	finalCol = mix(finalCol, 1.0-finalCol, invert);

	// finalCol = image;

	return vec4(finalCol,0.0);
}
