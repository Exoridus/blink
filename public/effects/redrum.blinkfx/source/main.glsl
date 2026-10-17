//Grit/flashing effect by jmpep from Shadertoy.

// #define LINES_AND_FLICKER
#define BLOTCHES
#define GRAIN

#define FREQUENCY 15.0

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

float rand(float c){
	return rand(vec2(c,1.0));
}

float distance_from_point_to_line(vec2 pt, vec2 l1, vec2 l2){
  float returnMe = 0.0;
  float a = (l2.y - l1.y);
  float b = (l2.x - l1.x);
  float c = 0.0;
  
  //  if b is zero, this is a vertical line!
  //  in which case distance is based on x distance alone
  if (b == 0.0) {
    float minY = min(l1.y, l2.y);
    float maxY = max(l1.y, l2.y);
    
    //  if we're between the two points distrance is straight up x diff
    if ((pt.y > minY) && (pt.y < maxY)) {
      returnMe = abs(pt.x-l1.x);
    }
    else  {
      //returnMe = min(distance(pt, l1), distance(pt, l2));
      returnMe = -1.0;
    }
  }
  //  if a is zero, this is a horizontal line
  else if (a == 0.0)  {
    float minX = min(l1.x, l2.x);
    float maxX = max(l1.x, l2.x);
    
    //  if we're between the two points distrance is straight up y diff
    if ((pt.x > minX) && (pt.x < maxX)) {
      returnMe = abs(pt.y - l1.y);
    }
    else  {
      //returnMe = min(distance(pt, l1), distance(pt, l2));
      returnMe = -1.0;
    }
  }
  //  if b isn't 0, solve for c now that we know a, b, and either l1 or l2
  else  {   
    //  here's the tricky bit-
    //  if pt is beyond l1 and l2, we should switch to distance from those points
    //  in order to determine this we need to use the perpendicular lines to the segment l1|l2 that pass through l1 & l2
    //  the slope of the perp line will be -1.0 / slope of original line
    float m = a / b;
    float perpm = -b / a;
    vec2 left_line_pt = l1;
    vec2 right_line_pt = l2;
    if (l1.x > l2.x)  {
      left_line_pt = l2;
      right_line_pt = l1;
    }
    
    float perp_intercept1 = left_line_pt.y - perpm * left_line_pt.x;
    float perp_intercept2 = right_line_pt.y - perpm * right_line_pt.x;
    
    if (m > 0.0)  {
      returnMe = abs(a * pt.x - b * pt.y + l2.x * l1.y - l2.y * l1.x) / sqrt(a*a + b*b);
    }
    else  {
      returnMe = abs(a * pt.x - b * pt.y + l2.x * l1.y - l2.y * l1.x) / sqrt(a*a + b*b);
    }
  }
   
    return returnMe;
}

float randomLine(float seed)
{
	float b = 0.01 * rand(seed);
	float a = rand(seed+1.0);
	float c = rand(seed+2.0) - 0.5;
	float mu = rand(seed+3.0);
	
	float l = 1.0;
	
	if ( mu > 0.2)
		l = pow(  abs(a * _uv.x + b * _uv.y + c ), 1.0/8.0 );
	else
		l = 2.0 - pow( abs(a * _uv.x + b * _uv.y + c), 1.0/8.0 );				
	
	return mix(0.5, 1.0, l);
}

// Generate some blotches.
float randomBlotch(float seed)
{
	float x = rand(seed);
	float y = rand(seed+1.0);
	float s = 0.01 * rand(seed+2.0);
	
	vec2 p = vec2(x,y) - _uv;
	p.x *= RENDERSIZE.x / RENDERSIZE.y;
	float a = atan(p.y,p.x);
	float v = 1.0;
	float ss = s*s * (sin(6.2831*a*x)*0.1 + 1.0);
	
	if ( dot(p,p) < ss ) v = 0.2;
	else
		v = pow(dot(p,p) - ss, 1.0/16.0);
	
	return mix(0.3 + 0.2 * (1.0 - (s / 0.02)), 1.0, v);
}


vec4 addGrain(sampler2D tex)
{
	vec4 fragColor = vec4(0.0);
		// Set frequency of global effect to 15 variations per second
		float t = float(int(TIME * FREQUENCY));
		
		// Get some image movement
		vec2 s_uv = _uv + 0.01*pow(shake,2.0) * vec2( rand(t), rand(t + 23.0));
		vec2 s_uv2 = _uv + 0.01*pow(shake,2.0) * vec2( _statelessContinuousChaotic(syn_CurvedTime*0.1), _statelessContinuousChaotic(syn_CurvedTime*0.1 + 23.0));

		// Get the image
		vec3 image = texture( tex, vec2(s_uv.x, s_uv.y) ).xyz;
		vec3 image2 = texture( tex, vec2(s_uv2.x, s_uv2.y) ).xyz;
		image = mix(image, image2, 0.5);

		// Convert it to B/W
		float luma = dot( vec3(0.2126, 0.7152, 0.0722), image );
		vec3 bwImage = luma * vec3(0.7, 0.7, 0.7);
		vec3 oldImage = mix(image, bwImage, syn_HighHits);
		// oldImage = image;
		// Create a time-varying vignetting effect
		float vI = 16.0 * (_uv.x * (1.0-_uv.x) * _uv.y * (1.0-_uv.y));
		// vI *= mix( 0.7, 1.0, rand(t + 0.5));
		
		// Add additive flicker
		vI += 1.0 + 0.4 * rand(t+8.);
		
		// Add a fixed vignetting (independent of the flicker)
		// vI *= mix(1.0, pow(16.0 * _uv.x * (1.0-_uv.x) * _uv.y * (1.0-_uv.y), 0.4), vignette);
		
		// Add some random lines (and some multiplicative flicker. Oh well.)
		// #ifdef LINES_AND_FLICKER
		// int l = int(8.0 * rand(t+7.0));
		
		// if ( 0 < l ) vI *= randomLine( t+6.0+17.* float(0));
		// if ( 1 < l ) vI *= randomLine( t+6.0+17.* float(1));
		// if ( 2 < l ) vI *= randomLine( t+6.0+17.* float(2));		
		// if ( 3 < l ) vI *= randomLine( t+6.0+17.* float(3));
		// if ( 4 < l ) vI *= randomLine( t+6.0+17.* float(4));
		// if ( 5 < l ) vI *= randomLine( t+6.0+17.* float(5));
		// if ( 6 < l ) vI *= randomLine( t+6.0+17.* float(6));
		// if ( 7 < l ) vI *= randomLine( t+6.0+17.* float(7));
		
		// #endif
		
		// Add some random blotches.
		#ifdef BLOTCHES
		int s = int( max(8.0 * rand(t+18.0) -2.0, 0.0 ));

		if ( 0 < s ) vI *= randomBlotch( t+6.0+19.* float(0));
		if ( 1 < s ) vI *= randomBlotch( t+6.0+19.* float(1));
		if ( 2 < s ) vI *= randomBlotch( t+6.0+19.* float(2));
		if ( 3 < s ) vI *= randomBlotch( t+6.0+19.* float(3));
		if ( 4 < s ) vI *= randomBlotch( t+6.0+19.* float(4));
		if ( 5 < s ) vI *= randomBlotch( t+6.0+19.* float(5));
	
		#endif
	
		// Show the image modulated by the defects
    fragColor.xyz = oldImage * vI;
		
		// Add some grain (thanks, Jose!)
		#ifdef GRAIN
      fragColor.xyz *= (1.0+(rand(_uv+t*.01)-.2)*.15)*(1.0+syn_HighHits*5.0);		
    #endif	
		// fragColor.rgb += vec3(1.0, 0.3, 0.0)*syn_BassPresence*vI*0.1;
		return fragColor;

}


const float MAGIC_BOX_MAGIC = 0.56;

float magicBox(vec3 p) {
    // The fractal lives in a 1x1x1 box with mirrors on all sides.
    // Take p anywhere in space and calculate the corresponding position
    // inside the box, 0<(x,y,z)<1
    p = 1.0 - abs(1.0 - mod(p, 2.0));
    
    float tot = 0.0;
    float L = length(p), L2;
    
    // This is the fractal.  More iterations gives a more detailed
    // fractal at the expense of more computation.
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;
    p = abs(p)/(L*L) - MAGIC_BOX_MAGIC; L2 = length(p); tot += abs(L2-L); L = L2;

    
    return tot;
}

// A random 3x3 unitary matrix, used to avoid artifacts from slicing the
// volume along the same axes as the fractal's bounding box.
const mat3 M = mat3(0.28862355854826727, 0.6997227302779844, 0.6535170557707412,
                    0.06997493955670424, 0.6653237235314099, -0.7432683571499161,
                    -0.9548821651308448, 0.26025457467376617, 0.14306504491456504);


vec4 renderMain(void)
{
	if (PASSINDEX == 0.0){
		vec2 zoomIn = -_uvc*vec2(RENDERSIZE.y/RENDERSIZE.x, 1.0)*(punch_out-punch_in*2.0)*(0.1+0.7*intensity_punch)*_rand(_toPolarTrue(_uvc).y+TIME*0.1);
		// float dripAmt = _rand(_pixelate(_uv.x,50.0))*(0.5+0.5*sin(_uv.y*5.0+TIME));
		vec4 oldData = texture(dataPass, _uv+zoomIn);

		float dripAmt = pow(oldData.b, 2.0);

		vec4 oldDataA = texture(dataPass, _uv+vec2(0.0,dripAmt*50.0)/RENDERSIZE+zoomIn);

		//DRIP EFFECT
		float bloodVal = oldData.b;
		float aboveBlood = oldDataA.b;

		if (bloodVal < aboveBlood){
			oldData.b = oldDataA.b; //make this pixel's data set to its above pixels data
		}

		bloodVal = oldData.b; //reset bloodVal to the new one

		float oldSlice = oldData.a;

		//FOR CIRCLE DRIPS
		float rotoAmt = -0.5+_fbm(vec3(_uvc*30.0,syn_HighTime*0.01));
		vec4 above4 = texture(dataPass, _uv+_rotate(vec2(0.0,0.001),rotoAmt)+zoomIn);
		vec4 below4 = texture(dataPass, clamp(_uv-_rotate(vec2(0.0,0.03+syn_BassLevel*0.06),rotoAmt)+zoomIn,0.0,1.0));

		float above = above4.r;
		float below = below4.r;

		if (above > oldData.r){
			oldData.r = above;
		}

		float circleDrip = oldData.r;
		circleDrip *= 0.9+abs(below-above)*0.1; //decrease timeVal, making blood older
		circleDrip = clamp(circleDrip, 0.0, 1.0);
		//FADE EFFECT
		//subtract some amount from bloodVal alpha, letting us know it is old.
		bloodVal *= 0.98;

		//NEW SPLATS
		float mbox = magicBox(vec3(_uvc+sin(vec2(syn_BeatTime*23.7, TIME*3.0)*0.1)*20.0, sin(TIME)*20.0));
    float a = smoothstep(14., 16., mbox);

		float pattern = a;
		if (_isMediaActive()){
			pattern = (0.3*a+_loadMediaAsMask().r*0.7);
		}
		// pattern = max(a*syn_HighHits, a2*syn_BassLevel);
		//limit pattern spatially
		pattern *= smoothstep(0.0, 9.0-1.5*syn_Presence, 1/distance(_uvc, vec2(sin(TIME*107.18), cos(TIME*103.7))*0.7));

		vec4 wall1 = _loadImage(wall1Tex, vec2(TIME*0.3));
		vec4 wall2 = _loadImage(wall2Tex, vec2(-TIME*0.3));
		vec4 wall3 = _loadImage(wall3Tex, vec2(-TIME*17.34,TIME*10.329));
		vec4 texMix = mix(min(wall1, wall2), wall3, 0.5+0.5*sin(TIME));

		float texMixFloat = dot(texMix.rgb, vec3(1.0))/3.0;

		pattern *= texMixFloat;

		float bloodBeat = mix(step(0.5,manual_splatter), max(step(0.98, syn_OnBeat),step(0.99, syn_HighHits)), auto_splatter);
		//timeVal and bloodVal need the new splats.
		float circlePat = step(100.0+40.0*sin(TIME*1074.43), 1/distance(_uvc, vec2(sin(TIME*107.18), cos(TIME*103.7))*0.7));
		circleDrip += circlePat*bloodBeat*syn_Level*less_blood*extra_drips;
		bloodVal += pattern*bloodBeat*more_blood*less_blood;

		vec2 pointOnLine;

// vec2(_rand(TIME), _rand(TIME*0.97)), vec2(_rand(TIME+0.43), _rand(TIME*0.97+0.29))
		float s = sin(mix(floor(manslice_scr)*0.5+PI*mod(floor(manslice_scr),2.0), syn_BeatTime*10.0+TIME*0.5, auto_slicer));
		float c = cos(mix(floor(manslice_scr)*0.5+PI*mod(floor(manslice_scr),2.0), syn_BeatTime*10.0+TIME*0.5, auto_slicer));
		mat2 m = mat2(c, -s, s, c);

    float disty = distance_from_point_to_line(_uvc*10.0, vec2(-1.0,sin(TIME)-0.2)*m, vec2(cos(TIME*0.33)+0.2,1.0)*m);
		
		oldSlice *= 0.9;
		float sliceBeat = mix(clamp(fract(1.0-manslice_scr),0.0,1.0), syn_OnBeat, auto_slicer);
		float slicePattern = _pulse(disty, 0.0+texMixFloat-0.5, 0.2+a)*sliceBeat*_pulse((_uvc*m).x, -1.0+sliceBeat*2.0, 0.4)*5.0;
		oldSlice += slicePattern;
		bloodVal += slicePattern*0.15*less_blood;
		vec4 finalCol = vec4(circleDrip, pattern, bloodVal, oldSlice);

		return finalCol;
	}
	else if (PASSINDEX == 1.0){
		vec4 data = texture(dataPass, _uv);

		float circleDrip = data.r;
		float bloodVal = data.b;
		float slice = data.a;
		slice = smoothstep(0.0,1.0,slice);

		vec4 finalBlood = pow(bloodVal,1.5)*2.0 * vec4(0.9,0.0,0.0,1.0);

		finalBlood += circleDrip*vec4(0.9, 0.0, 0.0, 1.0);
		finalBlood += slice*mix(vec4(-0.15, 1.0, 1.0, 1.0), vec4(0.9,0.0,0.0,1.0), 1.0-constrast_slices)*0.5;

		vec4 finalCol = finalBlood;

		// finalCol.a = clamp(lastA,0.0,1.0);
		return vec4(finalCol.rgb,1.0);
	} else if (PASSINDEX == 2.0){
		vec4 passThru = texture(dataPass, _uv);

		// return vec4(passThru.a)*2.0;

		// return passThru;
		vec4 colOut = addGrain(simPass);
		float lum = dot(colOut.rgb, vec3(1.0))/3.0;
		colOut = mix(colOut, (1.0-colOut)*(4.0-more_blood), pow((1.0-lum),5.0)*syn_HighHits*dot(passThru.rba, vec3(1.0))*highs_glitch);

		return colOut;
	}
}
