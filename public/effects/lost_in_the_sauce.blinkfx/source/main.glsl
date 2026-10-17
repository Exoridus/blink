mat2 rotate(float x)
{
    vec2 sc = vec2(sin(x), cos(x));
    return mat2(sc.y, sc.x, -sc.x, sc.y);
}

vec3 hue2rgb(float h)
{
    h = fract(h) * 6 - 2;
    vec3 c = vec3(abs(h - 1) - 1, 2 - abs(h), 2 - abs(h - 2));
    return clamp(c, vec3(0), vec3(1));
}

vec3 fade(vec3 x) { return x * x * x * (x * (x * 6 - 15) + 10); }

vec3 phash(vec3 p)
{
    p = fract(mat3(1.2989833, 7.8233198, 2.3562332,
                   6.7598192, 3.4857334, 8.2837193,
                   2.9175399, 2.9884245, 5.4987265) * p);
    p = ((2384.2345 * p - 1324.3438) * p + 3884.2243) * p - 4921.2354;
    return normalize(fract(p) * 2 - 1);
}

float cnoise(vec3 p)
{
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    ip += fp*pixel_garbage*pixel_garbage*0.00001;
    float d000 = dot(phash(ip), fp);
    float d001 = dot(phash(ip + vec3(0, 0, 1)), fp - vec3(0, 0, 1));
    float d010 = dot(phash(ip + vec3(0, 1, 0)), fp - vec3(0, 1, 0));
    float d011 = dot(phash(ip + vec3(0, 1, 1)), fp - vec3(0, 1, 1));
    float d100 = dot(phash(ip + vec3(1, 0, 0)), fp - vec3(1, 0, 0));
    float d101 = dot(phash(ip + vec3(1, 0, 1)), fp - vec3(1, 0, 1));
    float d110 = dot(phash(ip + vec3(1, 1, 0)), fp - vec3(1, 1, 0));
    float d111 = dot(phash(ip + vec3(1, 1, 1)), fp - vec3(1, 1, 1));
    fp = fade(fp);
    // fp = mix(fp, step(fp, vec3(_uv.x+_uv.y+length(_uvc)))*2.0, pixelate);
    return mix(mix(mix(d000, d001, fp.z), mix(d010, d011, fp.z), fp.y),
               mix(mix(d100, d101, fp.z), mix(d110, d111, fp.z), fp.y), fp.x);
}

vec3 magma_quintic( float x )
{
	x = clamp( x, 0.0, 1.0);
	vec4 x1 = vec4( 1.0, x, x * x, x * x * x ); // 1 x x2 x3
	vec4 x2 = x1 * x1.w * x; // x4 x5 x6 x7
	return vec3(
		dot( x1.xyzw, vec4( -0.023226960, +1.087154378, -0.109964741, +6.333665763 ) ) + dot( x2.xy, vec2( -11.640596589, +5.337625354 ) ),
		dot( x1.xyzw, vec4( +0.010680993, +0.176613780, +1.638227448, -6.743522237 ) ) + dot( x2.xy, vec2( +11.426396979, -5.523236379 ) ),
		dot( x1.xyzw, vec4( -0.008260782, +2.244286052, +3.005587601, -24.279769818 ) ) + dot( x2.xy, vec2( +32.484310068, -12.688259703 ) ) );
}

vec3 plasma_quintic( float x )
{
	x = clamp( x, 0.0, 1.0);
	vec4 x1 = vec4( 1.0, x, x * x, x * x * x ); // 1 x x2 x3
	vec4 x2 = x1 * x1.w * x; // x4 x5 x6 x7
	return vec3(
		dot( x1.xyzw, vec4( +0.063861086, +1.992659096, -1.023901152, -0.490832805 ) ) + dot( x2.xy, vec2( +1.308442123, -0.914547012 ) ),
		dot( x1.xyzw, vec4( +0.049718590, -0.791144343, +2.892305078, +0.811726816 ) ) + dot( x2.xy, vec2( -4.686502417, +2.717794514 ) ),
		dot( x1.xyzw, vec4( +0.513275779, +1.580255060, -5.164414457, +4.559573646 ) ) + dot( x2.xy, vec2( -1.916810682, +0.570638854 ) ) );
}

vec3 samplef(vec2 tc)
{
  if (mod(tc.x, 2.0) > 1.0){
    tc.x = 1.0-tc.x;
  }
  if (mod(tc.y, 2.0) > 1.0){
    tc.y = 1.0-tc.y;
  }
    return pow(_textureMedia(tc).xyz, vec3(2.2, 2.2, 2.2));
}

vec3 blur(vec2 tc, float offs)
{
    vec2 imgScale = textureSize(syn_Media, 0);
    vec4 xoffs = offs * vec4(-2.0, -1.0, 1.0, 2.0) / imgScale.x;
    vec4 yoffs = offs * vec4(-2.0, -1.0, 1.0, 2.0) / imgScale.y;
    
    vec3 color = vec3(0.0, 0.0, 0.0);
    color += samplef(tc + vec2(xoffs.x, yoffs.x)) * 0.00366;
    color += samplef(tc + vec2(xoffs.y, yoffs.x)) * 0.01465;
    color += samplef(tc + vec2(    0.0, yoffs.x)) * 0.02564;
    color += samplef(tc + vec2(xoffs.z, yoffs.x)) * 0.01465;
    color += samplef(tc + vec2(xoffs.w, yoffs.x)) * 0.00366;
    
    color += samplef(tc + vec2(xoffs.x, yoffs.y)) * 0.01465;
    color += samplef(tc + vec2(xoffs.y, yoffs.y)) * 0.05861;
    color += samplef(tc + vec2(    0.0, yoffs.y)) * 0.09524;
    color += samplef(tc + vec2(xoffs.z, yoffs.y)) * 0.05861;
    color += samplef(tc + vec2(xoffs.w, yoffs.y)) * 0.01465;
    
    color += samplef(tc + vec2(xoffs.x, 0.0)) * 0.02564;
    color += samplef(tc + vec2(xoffs.y, 0.0)) * 0.09524;
    color += samplef(tc + vec2(    0.0, 0.0)) * 0.15018;
    color += samplef(tc + vec2(xoffs.z, 0.0)) * 0.09524;
    color += samplef(tc + vec2(xoffs.w, 0.0)) * 0.02564;
    
    color += samplef(tc + vec2(xoffs.x, yoffs.z)) * 0.01465;
    color += samplef(tc + vec2(xoffs.y, yoffs.z)) * 0.05861;
    color += samplef(tc + vec2(    0.0, yoffs.z)) * 0.09524;
    color += samplef(tc + vec2(xoffs.z, yoffs.z)) * 0.05861;
    color += samplef(tc + vec2(xoffs.w, yoffs.z)) * 0.01465;
    
    color += samplef(tc + vec2(xoffs.x, yoffs.w)) * 0.00366;
    color += samplef(tc + vec2(xoffs.y, yoffs.w)) * 0.01465;
    color += samplef(tc + vec2(    0.0, yoffs.w)) * 0.02564;
    color += samplef(tc + vec2(xoffs.z, yoffs.w)) * 0.01465;
    color += samplef(tc + vec2(xoffs.w, yoffs.w)) * 0.00366;

    return color;
}

vec3 glow()
{
    vec2 tc = _uv;

    vec3 color = blur(tc, 2.0);
    color += blur(tc, 3.0);
    color += blur(tc, 5.0);
    color += blur(tc, 7.0);
    color /= 4.0;
    
    color += samplef(tc);
    return color;
}

float _lum(vec3 colIn){
  return dot(colIn, vec3(1.0))/3.0;
}

float _sqPulseFuzz(float variable, float center, float width, float fuzz){
  return (smoothstep(center-width-fuzz, center-width, variable)-(smoothstep(center+width, center+width+fuzz, variable)));
}
//+PASSINDEX*0.001*mix(0.3588, 2.4224, feed_amt)
vec4 renderMain(void)
{
	if (PASSINDEX == 0){
    	vec2 uv = gl_FragCoord.xy / RENDERSIZE;
        vec3 imgCol = vec3(0.0);
        float lum = 0.0;
        if (_isMediaActive()){
            imgCol = _loadMedia().rgb;
            lum = _lum(imgCol);
        }

        // side lines
        float dx = cnoise(vec3(uv.y*2+syn_CurvedTime*1.0+TIME*0.05))*0.1;
        float dy = cnoise(vec3(uv.x*2+syn_CurvedTime*1.0+TIME*0.05))*0.1;
        float fade = 0.05;
        float thickness = mix(0.905, 0.7, feed_thickness);

        float cVal = smoothstep(thickness, thickness+fade, abs(_uvc.x - dx));
        vec3 lineCol = vec3(0.0);

        float cVal2 = _sqPulse(_uv.x, 0.5, 0.01);
        float pulser = fract(syn_OnBeat)+step(0.9,syn_BassLevel)+1.0;
        vec3 lineCol2 = vec3(pulser)*cVal2*10.0;

        if (mode_2>0.5){
            cVal = cVal2;
            lineCol = lineCol2;
            lineCol = mix(lineCol, lineCol+lum*lum*pulser, media_color);

            // lineCol = magma_quintic(cVal)*cVal;
        } else {
            if ((_isMediaActive())&&(media_feeder>0.5)){
                cVal = pow(lum,2.0)*4.0;
            }
            lineCol = pow(magma_quintic(0.45+0.4*sin(_uv.x*PI+_uv.y*PI+TIME*0.1)), vec3(2.0))*1.5;
            lineCol = mix(lineCol*cVal, imgCol*imgCol*0.25, media_color);
            lineCol = clamp(lineCol, 0, 1)*(1.0+syn_OnBeat);
            lineCol = _rgb2hsv(lineCol);
            lineCol.r += hue_adjust;
            lineCol = _hsv2rgb(lineCol);
        }


        // displacement
        vec2 d = vec2(cnoise(vec3(0.13 - _uvc * 6 * scale, + syn_BassTime*0.15)),
                      cnoise(vec3(3.17 + _uvc * 6 * scale, - syn_BassTime*0.15)))*0.25;

        float rotVar = uv.y*6;
        if (_isMediaActive()){
            d *= mix(1.0, lum*lum*2.0, media_refract);
    		// rotVar *= (1.0+lum*media_refract);
        }
        d = rotate(mix(TIME, syn_BPMTwitcher, synced_twitcher) + rotVar) * d;
        
        // feedback
        d.x *= RENDERSIZE.x / RENDERSIZE.y;
        vec3 fb = texture(finalPass, uv + d*feedback_amt).rgb;

        if (mode_2 > 0.5){
            vec3 hueCol = vec3(0.9, 0.95, 1.0);
            hueCol = _rgb2hsv(hueCol);
            hueCol.r += hue_adjust;
            hueCol = _hsv2rgb(hueCol);
            fb *= hueCol;
            // fb += fb*vec3(0.0,0.0,1.0);
            // fb *= 0.9;
        }

        // coloring
        // vec3 amp = mix(plasma_quintic(0.5+0.5*sin(TIME)), vec3(1.0), 0.9) * 1.05;
        vec3 col = vec3(lineCol + fb*0.9*sqrt(iterations));
        return vec4(col, lum);
    } else if (PASSINDEX == 1){
    	return texture(feedback, _uv);
    } else if (PASSINDEX == 2){
        float cVal2 = _sqPulseFuzz(_uv.x, 0.5, 0.01, 0.000275);
        vec3 lineCol2 = vec3(fract(syn_OnBeat)+step(0.9,syn_BassLevel)+1.0)*cVal2*10.0;

        // return texture(finalPass, _uv);
        float zoomfactor = 0.05+feed_thickness*0.25;
        float lum = texture(feedback, _uv*(1.0-zoomfactor)+zoomfactor*0.5).a;
        vec2 lookupCoords = _uv*(1.0-zoomfactor)+zoomfactor*0.5;
        if (mode_2 > 0.5){
            lookupCoords = _uv;
        }

        vec4 finalCol = texture(finalPass, lookupCoords)*mix(1.0, clamp(pow(lum, 1.5)*1.2,0.0,1.0), media_mask)-lum*media_subtract;
        finalCol -= vec4(lineCol2, 0.0)*mode_2;
        return finalCol;
    }
}
