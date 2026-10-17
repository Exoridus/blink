/*
	Raymarched Reflections
	----------------------

	A very basic demonstration of raymarching a distance field with reflections 
	and reasonably passable shadows. Definitely not cutting edge, but hopefully, 
	interesting to anyone who isn't quite familiar with the process.

	Reflections are pretty easy: Raymarch to the hit point, then obtain the color 
	at that point. Continue on from the hit point in the direction of the reflected 
	ray until you reach a new hit point. Obtain the color at the new point, then
	add a portion of it to your original color. Repeat the process.

	Unfortunately, the extra work can slow things down, especially when you apply
	shadows, which is probably why you don't see too many shadowed,	reflected 
	examples. However, for relatively simple distance fields, it's pretty doable.

	It was tempting to do this up, but I figured a simpler example would be more
	helpful. Take away the rambling comments, and there isn't a great deal of code.
	I'll post a more sophisticated one later.
*/

vec3 _grad3(vec3 col1, vec3 col2, vec3 col3, float mixVal){
    mixVal *= 2.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    return mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
}

vec3 _grad4(vec3 col1, vec3 col2, vec3 col3, vec3 col4, float mixVal){
    mixVal *= 3.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
    vec3 firstTwo = mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
    return mix(firstTwo, mix(col3, col4, mix3), step(2.0, mixVal));
}

vec3 _grad5(vec3 col1, vec3 col2, vec3 col3, vec3 col4, vec3 col5, float mixVal){
    mixVal *= 4.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
    float mix4 = clamp(mixVal-3.0, 0.0, 1.0);

    vec3 firstTwo = mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
    vec3 lastTwo = mix(mix(col3, col4, mix3), mix(col4, col5, mix4), step(3.0, mixVal));

    return mix(firstTwo, lastTwo, step(2.0, mixVal));
}

vec3 zTime = vec3(0., 0., syn_BassTime*0.2+TIME*0.25);


// Tri-Planar blending function. Based on an old Nvidia writeup:
// GPU Gems 3 - Ryan Geiss: https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch01.html
vec3 tex3D(sampler2D t, in vec3 p, in vec3 n ){
    
    n = max(abs(n) - .2, 0.001);
    n /= dot(n, vec3(1));
    vec3 mirP = p;
    vec3 modP = mod(p, vec3(2.0));
    if (modP.x > 1.0){
        mirP.x = 1.0-p.x;
    }
    if (modP.y > 1.0){
        mirP.y = 1.0-p.y;
    }
    if (modP.z > 1.0){
        mirP.z = 1.0-p.z;
    }
    vec3 tx = _textureMedia(mirP.yz).rgb;
    vec3 ty = _textureMedia(mirP.zx).rgb;
    vec3 tz = _textureMedia(mirP.xy).rgb;

    // Textures are stored in sRGB (I think), so you have to convert them to linear space 
    // (squaring is a rough approximation) prior to working with them... or something like that. :)
    // Once the final color value is gamma corrected, you should see correct looking colors.
    return (tx*tx*n.x + ty*ty*n.y + tz*tz*n.z);
}

#define FAR 30.

// Distance function. This one is pretty simple. I chose rounded
// spherical boxes, because they're cheap and they display the 
// reflections reasonably well.
float map(vec3 p)
{
    float scaleSpace = cube_size;
    // p *= cube_size;
    p += zTime;
    // Positioning the rounded cubes a little off center, in order
    // to break up the space a little.
    //
    // "floor(p)" represents a unique number (ID) for each cube 
    // (based on its unique position). Take that number and produce 
    // a randomized 3D offset, then add it to it's regular position. 
    // Simple.
    float n = sin(dot(floor(p), vec3(27, 113, 57)));
    vec3 rnd = fract(vec3(2097152, 262144, 32768)*n)*.16 - .08;
    
    // Repeat factor. If irregularity isn't your thing, you can get 
    // rid of "rnd" to line things up again.
    p = fract(p + rnd*irregularity*3.0) - .5;
    p.z *= pulse_pillars;
    p.z *= z_stretch;
    // Rounded spherical boxes. The following is made up, but kind of
    // makes sense. Box, minus a bit of sphericalness, gives you a 
    // rounded box.
    p = abs(p); 
    float box = max(p.x, max(p.y, p.z))-0.25*scaleSpace;
    float round = dot(p, p)*0.5-0.05*scaleSpace;
    return mix(box, round, cube_sphere);
    
    //return length(p) - 0.225; // Just spheres.
}
vec3 g = vec3(0.);

// float iterReducer = (5.0-cube_size)*0.2;
float iterReducer = (5.0)*0.2;

// Standard raymarching routine.
float trace(vec3 ro, vec3 rd){
   
    float t = 0., d;
    
    for (int i = 0; i < 120; i++){

        d = map(ro + rd*t);
        
        // Using the hacky "abs," trick, for more accuracy. 
        if(abs(d)<.0005 || t>FAR) break;        
        
        t += d*.75;  // Using more accuracy, in the first pass.

        g += vec3(.5, .5, .5) * .005 / (.01 + d*d);         //Glow
    }
    
    return t;
}

// Second pass, which is the first, and only, reflected bounce. 
// Virtually the same as above, but with fewer iterations and less 
// accuracy.
//
// The reason for a second, virtually identical equation is that 
// raymarching is usually a pretty expensive exercise, so since the 
// reflected ray doesn't require as much detail, you can relax things 
// a bit - in the hope of speeding things up a little.
float traceRef(vec3 ro, vec3 rd){
    
    float t = 0., d;
    
    for (int i = 0; i < 64; i++){

        d = map(ro + rd*t);
        
        if(abs(d)<.002 || t>(FAR*1.5)) break;
        
        t += d;
    }
    
    return t;
}


// Cheap shadows are hard. In fact, I'd almost say, shadowing repeat objects - in a setting like this - with limited 
// iterations is impossible... However, I'd be very grateful if someone could prove me wrong. :)
float softShadow(vec3 ro, vec3 lp, float k){

    // More would be nicer. More is always nicer, but not really affordable... Not on my slow test machine, anyway.
    const int maxIterationsShad = 24; 
    
    vec3 rd = (lp-ro); // Unnormalized direction ray.

    float shade = 1.;
    float dist = .0035;    
    float end = max(length(rd), .001);

    float stepDist = end/float(maxIterationsShad);
    
    rd /= end;

    // Max shadow iterations - More iterations make nicer shadows, but slow things down. Obviously, the lowest 
    // number to give a decent shadow is the best one to choose. 
    for (int i=0; i<maxIterationsShad; i++){

        float h = map(ro + rd*dist);
        //shade = min(shade, k*h/dist);
        shade = min(shade, smoothstep(0., 1., k*h/dist)); // Subtle difference. Thanks to IQ for this tidbit.
        // So many options here, and none are perfect: dist += min(h, .2), dist += clamp(h, .01, .2), 
        // clamp(h, .02, stepDist*2.), etc.
        dist += clamp(h, .02, .25);
        
        // Early exits from accumulative distance function calls tend to be a good thing.
        if (h<0. || dist > end) break; 
        //if (h<.001 || dist > end) break; // If you're prepared to put up with more artifacts.
    }

    // I've added 0.5 to the final shade value, which lightens the shadow a bit. It's a preference thing. 
    // Really dark shadows look too brutal to me.
    return min(max(shade, 0.) + .25, 1.); 
}

/*
// Standard normal function. It's not as fast as the tetrahedral calculation, but more symmetrical. Due to 
// the intricacies of this particular scene, it's kind of needed to reduce jagged effects.
vec3 getNormal(in vec3 p) {
	const vec2 e = vec2(.002, 0);
	return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy),	map(p + e.yyx) - map(p - e.yyx)));
}
*/

// Tetrahedral normal, to save a couple of "map" calls. Courtesy of IQ.
vec3 getNormal( in vec3 p ){

    // Note the slightly increased sampling distance, to alleviate
    // artifacts due to hit point inaccuracies.
    vec2 e = vec2(.0025, -.0025); 
    return normalize(
        e.xyy * map(p + e.xyy) + 
        e.yyx * map(p + e.yyx) + 
        e.yxy * map(p + e.yxy) + 
        e.xxx * map(p + e.xxx));
}

// Alternating the cube colors in a 3D checkered arrangement.
// You could just return a single color, if you wanted, but I
// thought I'd mix things up a bit.
//
// Color scheme mildly influenced by: Sound Experiment 3 - aiekick
// https://www.shadertoy.com/view/Ml2XWt
vec3 getObjectColor(vec3 p){
    
    // vec3 col = vec3(0.0,0.0,1.0);
    // // "floor(p)" is analogous to a unique ID - based on position.
    // // This could be stepped, but it's more intuitive this way.
    // vec3 scaledP = p*scaleSpace;
    // scaledP += zTime;
    // if(fract(dot(floor(scaledP), vec3(0.5))) > .001){
    //     col = vec3(1.0, 0.0, 0.0);
    // }
    vec3 col = vec3(1.0, 0.0, 0.0);
    col = _hsv2rgb(vec3(p.z*0.03+p.x*0.02, 1.0, 1.0));
    return col;
    
}

// Using the hit point, unit direction ray, etc, to color the 
// scene. Diffuse, specular, falloff, etc. It's all pretty 
// standard stuff.
vec3 doColor(in vec3 sp, in vec3 rd, in vec3 sn, in vec3 lp, float t){
    
    vec3 ld = lp-sp; // Light direction vector.
    float lDist = max(length(ld), .001); // Light to surface distance.
    ld /= lDist; // Normalizing the light vector.
    
    // Attenuating the light, based on distance.
    float atten = 1. / (1. + lDist*.2 + lDist*lDist*.1);
    
    // Standard diffuse term.
    float diff = max(dot(sn, ld), 0.);
    // Standard specualr term.
    float spec = pow(max( dot( reflect(-ld, sn), -rd ), 0.), 8.);
    
    // Coloring the object. You could set it to a single color, to
    // make things simpler, if you wanted.
    vec3 objCol = getObjectColor(sp);
    vec3 texCol = tex3D(syn_Media, sp+zTime, sn);
    texCol = pow(texCol, vec3(2.0))*10.0;
    objCol = mix(objCol, texCol, media_color);

    // Combining the above terms to produce the final scene color.
    vec3 lightCol = vec3(1.0,1.0, 1.0);
    float tMod = _pulse(t, 0.0, 0.01);
    // objCol = tMod*darker_edges*vec3(-10.0);
    // objCol = mix(objCol, objCol+tMod*vec3(-10.0), darker_edges);
    vec3 sceneCol = (objCol*(diff + (.15+media_color*0.2)) + lightCol*spec*4.) * atten;
    // sceneCol = _palette(1.0-dot(normalize(sn), rd)*2.0, vec3(1.020, 0.520, 0.500), vec3(0.500, 0.500, 0.500), vec3(0.500, 0.240, 0.750), vec3(0.480, 0.090, 0.870));


    // Return the color. Performed once every pass... of which there are
    // only two, in this particular instance.
    return sceneCol;
    
}

#define AA_ON

vec4 renderMainImage() {
	vec4 fragColor = vec4(0.0);
	vec2 fragCoord = _xy;
#ifdef AA_ON
int AA = 1+int(anti_aliasing_fps);
vec4 tot = vec4(0.0);
for( int m=0; m<AA; m++ )
for( int nm=0; nm<AA; nm++ )
    {
    vec2 o = vec2(float(m),float(nm)) / float(AA) - 0.5;
    o /= RENDERSIZE.y;
#else
    vec2 o = vec2(0.0);
#endif


    vec2 screenPos = -1.0 + 2.0 * _uv;
    screenPos.x *= RENDERSIZE.x / RENDERSIZE.y;
    screenPos = screenPos + o;

    vec2 n = vec2(_rand(_uvc+fract(TIME))) - 0.5;

    float x = screenPos.x;
    float y = screenPos.y;
    float z = (length(vec3(1.0))-sqrt(abs(x)*abs(x)+ abs(y)*abs(y)));

    vec3 normb = normalize(vec3(x,y,z+FOV));

    normb = mix(normalize(vec3(x, y, mix(0.3, 10.0, FOV*FOV*FOV))), normb, fisheye);


    // Screen coordinates.
	vec2 uv = (fragCoord.xy - RENDERSIZE.xy*.5) / RENDERSIZE.y;
    
    // Unit direction ray.
    vec3 rd = normb;
    

    // Some cheap camera movement, for a bit of a look around. I use this far
    // too often. I'm even beginning to bore myself, at this point. :)
    // float cs = cos(camera.x * PI);
    // float si = sin(camera.y * PI);
    // rd.xy = mat2(cs, si, -si, cs)*rd.xy;
    // rd.xz = mat2(cs, si, -si, cs)*rd.xz;
    rd.xz = _rotate(rd.xz, camera.x*PI+rotateRightScr*(PI/3.5));

    rd.yz = _rotate(rd.yz, camera.y*PI+rotateUpScr*(PI/3.5));

    // Ray origin. Doubling as the surface position, in this particular example.
    // I hope that doesn't confuse anyone.
    vec3 ro = vec3(0.0)+vec3(moveRightScr, moveUpScr, 0.0);
    
    // Light position. Set in the vicinity the ray origin.
    vec3 lp = ro + vec3(light_pos.x*5.0, light_pos.y*5.0, 5.0+light_z*5.0);
    
    
    // FIRST PASS.
    
    float t = trace(ro, rd);
    
   
    vec3 sp = ro + rd*t;
    // Advancing the ray origin, "ro," to the new hit point.
    ro += rd*t;
    
    // Retrieving the normal at the hit point.
    vec3 sn = getNormal(ro);
    
    // Retrieving the color at the hit point, which is now "ro." I agree, reusing 
    // the ray origin to describe the surface hit point is kind of confusing. The reason 
    // we do it is because the reflective ray will begin from the hit point in the 
    // direction of the reflected ray. Thus the new ray origin will be the hit point. 
    // See "traceRef" below.
    vec3 sceneColor = doColor(ro, rd, sn, lp, t);
    
    // Checking to see if the surface is in shadow. Ideally, you'd also check to
    // see if the reflected surface is in shadow. However, shadows are expensive, so
    // it's only performed on the first pass. If you pause and check the reflections,
    // you'll see that they're not shadowed. OMG! - Better call the shadow police. :)
    float sh = softShadow(ro, lp, 16.);
    
    
    // SECOND PASS - REFLECTED RAY
    
    // Standard reflected ray, which is just a reflection of the unit
    // direction ray off of the intersected surface. You use the normal
    // at the surface point to do that. Hopefully, it's common sense.
    rd = reflect(rd, sn);
    
    float tSave = t;
    // The reflected pass begins where the first ray ended, which is the suface
    // hit point, or in a few cases, beyond the far plane. By the way, for the sake
    // of simplicity, we'll perform a reflective pass for non hit points too. Kind
    // of wasteful, but not really noticeable. The direction of the new ray will
    // obviously be in the direction of the reflected ray. See just above.
    //
    // To anyone who's new to this, don't forgot to nudge the ray off of the 
    // initial surface point. Otherwise, you'll intersect with the surface
    // you've just hit. After years of doing this, I still forget on occasion.
    t = traceRef(ro +  rd*.01, rd);
    
    // Advancing the ray origin, "ro," to the new reflected hit point.
    ro += rd*t;
    
    // Retrieving the normal at the reflected hit point.
    sn = getNormal(ro);
    
    // Coloring the reflected hit point, then adding a portion of it to the final scene color.
    // How much you add, and how you apply it is up to you, but I'm simply adding 35 percent.
    vec3 reflCol = doColor(ro, rd, sn, lp, t);
    vec3 texRefCol = tex3D(syn_Media, ro, sn);
    reflCol = mix(reflCol, texRefCol, media_reflect);
    sceneColor = _grad3(sceneColor, reflCol+sceneColor, reflCol, reflectivity);
    // Other combinations... depending what you're trying to achieve.
    //sceneColor = sceneColor*.7 + doColor(ro, rd, sn, lp, t)*.5;
    
    
    // APPLYING SHADOWS
    //
    // Multiply the shadow from the first pass by the final scene color. Ideally, you'd check to
    // see if the reflected point was in shadow, and incorporate that too, but we're cheating to
    // save cycles and skipping it. It's not really noticeable anyway. By the way, ambient
    // occlusion would make it a little nicer, but we're saving cycles and keeping things simple.
    sceneColor *= sh;
    
    // Fog factor -- based on the distance from the camera.
    float fogF = smoothstep(0., .95, tSave/mix(FAR, FAR*0.1, fog_amt));
    fogF += smoothstep(0., .95, t/mix(FAR, FAR*0.1, fog_amt));
    
    // Applying the background fog. Just black, in this case, but you could
    // render sky, etc, as well.
    sceneColor = mix(sceneColor, vec3(0), fogF); 

    //Add in Glow
    vec3 glowCol = mix(vec3(.9, .2, .4), vec3(.3, cos(TIME)*.1, .2), 0.0);
    glowCol.r *= (0.5+0.5*sin(TIME));
    glowCol = _palette(1.0-sn.y, vec3(1.020, 0.520, 0.500), vec3(0.500, 0.500, 0.500), vec3(0.500, 0.240, 0.750), vec3(0.480, 0.090, 0.870));
    float glowPow = clamp(glow_amt, 1.0, 2.0)-1.0;
    float glowAmt = 1.0/pow(distance(sp, lp),3.0-glowPow*2.0);
    float glowDim = clamp(glow_amt, 0.0, 1.0);
    sceneColor += glowDim*glowAmt*glowCol * pow(g*4/(AA*AA),vec3(2.0))* .0009;

    // Clamping the scene color, performing some rough gamma correction (the "sqrt" bit), then 
    // presenting it to the screen.
    #ifdef AA_ON
    tot += vec4(sqrt(clamp(sceneColor, 0., 1.)), 1);
  }
    tot /= float(AA*AA);
    // vec4 color = pow(tot, vec4(1.75));
    vec4 color = tot;
    #else
    vec4 color = vec4(sqrt(clamp(sceneColor, 0., 1.)), 1);
    color = pow(color, vec4(2.0));
    #endif
	return color; 
 } 


vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderMainImage();
	}
}