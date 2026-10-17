
float smoothMerge(float d1, float d2, float k)
{
    float h = clamp(0.5 + 0.5*(d2 - d1)/k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0-h);
}


float merge(float d1, float d2)
{
    return min(d1, d2);
}


float mergeExclude(float d1, float d2)
{
    return min(max(-d1, d2), max(-d2, d1));
}


float substract(float d1, float d2)
{
    return max(-d1, d2);
}


float intersect(float d1, float d2)
{
    return max(d1, d2);
}


float pie(vec2 p, float angle)
{
    angle = radians(angle) / 2.0;
    vec2 n = vec2(cos(angle), sin(angle));
    return abs(p).x * n.x + p.y*n.y;
}

float circleDist(vec2 p, float radius)
{
    return length(p) - radius;
}

float triangleDist(vec2 p, float radius)
{
    return max( abs(p).x * 0.866025 + 
                p.y * 0.5, -p.y) 
                -radius * 0.5;
}

float triangleDist(vec2 p, float width, float height)
{
    vec2 n = normalize(vec2(height, width / 2.0));
    return max( abs(p).x*n.x + p.y*n.y - (height*n.y), -p.y);
}

float semiCircleDist(vec2 p, float radius, float angle, float width)
{
    width /= 2.0;
    radius -= width;
    return substract(pie(p, angle), 
                     abs(circleDist(p, radius)) - width);
}

float boxDist(vec2 p, vec2 size, float radius)
{
    size -= vec2(radius);
    vec2 d = abs(p) - size;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - radius;
}

float sdHexagon( in vec2 p, in float r )
{
    const vec3 k = vec3(-0.866025404,0.5,0.577350269);
    p = abs(p);
    p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;
    p -= vec2(clamp(p.x, -k.z*r, k.z*r), r);
    return length(p)*sign(p.y);
}

float lineDist(vec2 p, vec2 start, vec2 end, float width)
{
    vec2 dir = start - end;
    float lngth = length(dir);
    dir /= lngth;
    vec2 proj = max(0.0, min(lngth, dot((start - p), dir))) * dir;
    return length( (start - p) - proj ) - (width / 2.0);
}

float fuzzyShape(float dist, float fade){
	float shape = 1.0-pow(smoothstep(0.0, 0.0+fade, dist),6.0);
	return shape;
}

float fuzzyStroke(float dist, float fade, float thickness){
	float shape = 
    smoothstep(0.0-thickness-fade*0.5, 0.0+fade*0.5, dist)-
    smoothstep(0.0-fade*0.5, 0.0+thickness+fade*0.5, dist);
	return shape;
}

float mix3(float col1, float col2, float col3, float mixVal){
    mixVal *= 2.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    return mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
}

float mix4(float col1, float col2, float col3, float col4, float mixVal){
    mixVal *= 3.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
    float firstTwo = mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
    return mix(firstTwo, mix(col3, col4, mix3), step(2.0, mixVal));
}
float mix5(float col1, float col2, float col3, float col4, float col5, float mixVal){
    mixVal *= 4.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
    float mix4 = clamp(mixVal-3.0, 0.0, 1.0);

    float firstTwo = mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
    float lastTwo = mix(mix(col3, col4, mix3), mix(col4, col5, mix4), step(3.0, mixVal));

    return mix(firstTwo, lastTwo, step(2.0, mixVal));
}

vec3 renderAllShapes(){
	vec2 uv = _uvc;
	float fuzzer = -0.5+_rand(_uv+TIME);
    //Fuzzify
	uv += fuzzer*_uvc*fuzz_shape*fuzz_shape*fuzz_shape*fuzz_shape*5.0+fuzzer*_uvc*fuzz_high_hits*fuzz_high_hits*syn_HighHits;

    //Origin Twitching on OnBeat
    vec2 shapeOrigin = uv;
    vec2 ogOffset = vec2(_statelessContinuousChaotic(syn_BassTime*0.5), _statelessContinuousChaotic(syn_BassTime*0.7))*syn_OnBeat;
    shapeOrigin += ogOffset*0.1*bass_twitcher*bass_twitcher;

    //Shapes
	float distCirc = circleDist(shapeOrigin, 0.3*radius);
	float distTri = triangleDist(shapeOrigin+vec2(0.0,0.18)*radius, 0.5*radius*1.1, 0.4*radius*1.1);
    float distBox = boxDist(shapeOrigin, vec2(0.25)*radius, 0.0);
    float distHex = sdHexagon(shapeOrigin, 0.25*radius);
    //TimeStepping
    float timeVar = mod(TIME, 4.0);
    timeVar = mod(beatTime, 4.0);
    timeVar = floor(timeVar)+pow(fract(timeVar),40.0);
	float mixShape = mix5(distCirc, distTri, distHex, distBox, distCirc, timeVar/4.0);
    //Stroke along SDF
	float shape = fuzzyStroke(mixShape, 0.0, stroke_thickness*stroke_thickness*stroke_thickness)*(1.0);

	vec3 col = vec3(shape);
	col += _rand(_uv+77.0-TIME)*0.1*extra_noise;
	return col;
}

// chromatic dispersion samples
#define SAMPLES 32

// channels to use for displacement, either xy or zw
#define CH xy


vec3 contrast(vec3 x) {
	return 1.0 / (1.0 + exp(-mix(4.5, 12.0, dispersion_contrast) * (x - 0.5)));    
}

vec2 normz(vec2 x) {
	return x == vec2(0) ? vec2(0) : normalize(x);
}

/*
	This function supplies a weight vector for each color channel.
	It's analogous to (but not a physically accurate model of)
	the response curves for each of the 3 cone types in the human eye.
	The three functions for red, green, and blue have the same integral
    over [0, 1], which is 1/3.
    Here are some other potential terms for the green weight that 
	integrate to 1/3:
        2.0*(1-x)*x
        10.0*((1-x)*x)^2
        46.667*((1-i)*i)^3
        210.0*((1-x)*x)^4
        924.0*((1-x)*x)^5
    By the way, this series of coefficients is OEIS A004731 divided by 3,
    which is a pretty interesting series: https://oeis.org/A002457
*/
vec3 sampleWeights(float i) {
	return vec3(i * i, 46.6666*pow((1.0-i)*i,3.0), (1.0 - i) * (1.0 - i));
}

vec4 texMirror(sampler2D samplerIn, vec2 uvIn){
  if (mod(uvIn.x, 2.0) > 1.0){
    uvIn.x = 1.0-uvIn.x;
  }
  if (mod(uvIn.y, 2.0) > 1.0){
    uvIn.y = 1.0-uvIn.y;
  }
  return texture(samplerIn, uvIn);
}


vec3 sampleDisp(sampler2D mySamp, vec2 uv, vec2 dispNorm, float disp) {
    vec3 col = vec3(0);
    const float SD = 1.0 / float(SAMPLES);
    float wl = 0.0;
    vec3 denom = vec3(0);
    for(int i = 0; i < SAMPLES; i++) {
        vec3 sw = sampleWeights(wl);
        denom += sw;
        col += sw * texMirror(mySamp, uv + dispNorm * disp * wl).xyz;
        wl  += SD;
    }
    
    // For a large enough number of samples,
    // the return below is equivalent to 3.0 * col * SD;
    return col / denom;
}


vec4 renderMain(void)
{
	if (PASSINDEX == 0.0){
		return vec4(renderAllShapes(), 1.0);
	} else if (PASSINDEX == 1.0){
		vec4 tex = texture(mainRender, _uv);
        // return tex;
		float lum = clamp(tex.r, 0.0, 1.0);
		vec2 norm = (_uvc)*vec2(RENDERSIZE.y/RENDERSIZE.x, 1.0);

		float mediaLum = dot(_loadMedia().rgb, vec3(1.0))/3.0;

		if (shape_affect_media > 0.5){
				norm += normalize(_rotate(vec2(0.0,1.0),2*PI*lum));
		}
		norm += normalize(_rotate(vec2(0.0,1.0),2*PI*mediaLum))*media_affect_dispersion;
		norm = _rotate(norm, syn_BassTime*bass_rotate*0.25);
		vec3 finalCol = vec3(0.0);
		if ((media_on < 0.5)||(!_isMediaActive())){
				finalCol = sampleDisp(mainRender, _uv, norm, sign(dispersion_amount)*dispersion_amount*dispersion_amount);
		} else {
				finalCol = sampleDisp(syn_Media, _correctMediaCoords(), norm, sign(dispersion_amount)*dispersion_amount*dispersion_amount);
		}
		finalCol = contrast(finalCol);
		finalCol *= 1.0+extra_brightness*extra_brightness;
		finalCol *= mix3(1.0, 1.0+lum, lum, mask_shape);
		return vec4(finalCol, 1.0);
	}
}
