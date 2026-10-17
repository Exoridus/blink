//Psybernautic Neuron - Psybernautics - Alex Tiemann 2021
#define FAR 50.0

float smin( float a, float b, float k )
{
    float h = max(k-abs(a-b),0.0);
    return min(a, b) - h*h*0.25/k;
}

vec2 smin( vec2 a, vec2 b, float k )
{
    float h = clamp( 0.5+0.5*(b.x-a.x)/k, 0.0, 1.0 );
    return mix( b, a, h ) - k*h*(1.0-h);
}

float sdBoundingBox( vec3 p, vec3 b, float e )
{
       p = abs(p  )-b;
  vec3 q = abs(p+e)-e;
  return min(min(
      length(max(vec3(p.x,q.y,q.z),0.0))+min(max(p.x,max(q.y,q.z)),0.0),
      length(max(vec3(q.x,p.y,q.z),0.0))+min(max(q.x,max(p.y,q.z)),0.0)),
      length(max(vec3(q.x,q.y,p.z),0.0))+min(max(q.x,max(q.y,p.z)),0.0));
}

vec3 re(vec3 p, float d) 
{return mod(p - d * .5, d) - d * .5;}


void amod(inout vec2 p, float d) 
{
    float a = re(vec3(atan(p.y, p.x)), d).x;
    p = vec2(cos(a), sin(a)) * length(p);
}

float map( vec3 p)
{
    float shape;

	vec3 q = p;;
    p.z -= dynamic_time;
    p.z = re(p, 10.0).z;
    p.xy -= 2.5;
    
    float bt = geo_time;

    p.xy = _rotate(p.xy, bt);

    float tvar = abs(sin(geo_time));
    float scale = 0.33333;
	shape = sdBoundingBox(p, vec3(mix(1.0, scale, mix(0.0, tvar, cube_shift)))*cube_scale, 0.01);

    
    p.xz = _rotate(p.xz, bt*scale); 
    float shape2 = sdBoundingBox(p, vec3(mix(scale, 1.0, mix(0.0, tvar, cube_shift)))*cube_scale, 0.01);

    shape = smin(shape,shape2, 0.1) - PI*0.015625*cube_scale;

    q = re(q, 5.0);
        
    amod(q.xy, 2.0*PI / (4.0));      

    q.x -= 1.1+ abs(sin(q.z*0.5)*(1.0/(1.0)));
    

    amod(q.xy, 2.0*PI / tunnel_density);

    q.x -= (1.0+abs(sin(q.z*0.5)))*clamp(syn_BassPresence, 0.2, 0.9);
    
    float tube = length(q.xy) - tube_size;
    
    shape = mix(smin(shape, tube, 0.25), tube, no_cube);

	return shape;

}

float trace(vec3 o, vec3 r){

    float t = 0., d;
    for (int i = 0; i<60; i++) {

        d = map(o + r*t)*0.5;
        if(abs(d)<.001*(t*.125 + 1.) || t>FAR) break;

        t += d;
        t += t<.25 ? d*.7 : d;
    }

    return min(t, FAR);
}

float cAO(in vec3 pos, in vec3 nor)
{
	float sca = 1., occ = 0.0;
    for( int i=0; i<5; i++ ){

        float hr = 0.01 + float(i)*0.35/4.0;
        float dd = map(nor * hr + pos);
        occ += (hr - dd)*sca;
        sca *= 0.7;
    }
    return clamp(1.0 - occ, 0.0, 1.0 );
}

// Tetrahedral normal, to save a couple of "map" calls. Courtesy of IQ.
vec3 nrm(vec3 p) {

   vec2 e = vec2(.0025, -.0025); 

    return normalize(

        e.xyy * map(p + e.xyy) + 

        e.yyx * map(p + e.yyx) + 

        e.yxy * map(p + e.yxy) + 

        e.xxx * map(p + e.xxx));
}

vec3 getObjectColor(vec3 p, float caustic){

    vec3 col = caustic < 0.5 ? base_color : vec3(1.0) - base_color;
    float colorSphere = length(p*0.015) - bass_time*0.125;
    col = mix(col, _hsv2rgb(vec3(colorSphere, 0.5, 1.0)), rainbow);
    return col;
}

// Tri-Planar blending function. Based on an old Nvidia writeup:

// GPU Gems 3 - Ryan Geiss: https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch01.html

vec3 tex3D(sampler2D t, in vec3 p, in vec3 n ){

    

    n = max(abs(n) - .2, 0.001);

    n /= dot(n, vec3(1));

    vec3 mirP = p;

    vec3 modP = mod(p, vec3(2.0));

    if (mod(mirP.x, 2.0) > 1.0){

        mirP.x = 1.0-mirP.x;

    }

    if (modP.x > 1.0){

        mirP.x = 1.0-p.x;

    }

    if (modP.y > 1.0){

        mirP.y = 1.0-p.y;

    }

    if (modP.z > 1.0){

        mirP.z = 1.0-p.z;

    }

    vec3 tx = _contrast(_invertImage(vec4(texture(t, mirP.yz).xyz, 0.0)), _Media_Contrast).rgb;

    vec3 ty = _contrast(_invertImage(vec4(texture(t, mirP.zx).xyz, 0.0)), _Media_Contrast).rgb;

    vec3 tz = _contrast(_invertImage(vec4(texture(t, mirP.xy).xyz, 0.0)), _Media_Contrast).rgb;


    return (tx*tx*n.x + ty*ty*n.y + tz*tz*n.z);

}

vec3 doColor(in vec3 sp, in vec3 rd, in vec3 sn, in vec3 lp){

    vec3 ld = lp-sp;

    float lDist = max(length(ld), .001);

    ld /= lDist;

    float atten = 1. / (1. + lDist*.2 + lDist*lDist*.1);

    float diff = max(dot(sn, ld), 0.01);

    float spec = pow(max( dot( reflect(ld, sn), -rd ), 0.1), 20.0);

    vec3 objCol = getObjectColor(sp, 0.0);

    vec3 texCol = tex3D(syn_UserImage, sp, sn);

    texCol = pow(texCol, vec3(2.0));

    objCol = mix(objCol, texCol, media_col);

    vec3 lightCol = vec3(1.0) - objCol;
    vec3 sceneCol = (objCol*(diff*34.5) + lightCol*spec*70.0) * atten;
    return sceneCol;
}

//shadow technique based off of techniques by Shane
float softShadow(vec3 ro, vec3 lp, float k){

    const int maxIterationsShad = 24; 
    vec3 rd = (lp-ro);
    float shade = 1.;
    float dist = .0035;    
    float end = max(length(rd), .001);
    float stepDist = end/float(maxIterationsShad);
    rd /= end;

    for (int i=0; i<maxIterationsShad; i++){

        float h = map(ro + rd*dist);
        shade = min(shade, smoothstep(0., 1., k*h/dist));
        dist += clamp(h, .02, .25);
        if (h<0. || dist > end) break; 
    }

    return min(max(shade, 0.) + .25, 1.); 
}


vec4 renderMainImage() {
	vec4 fragColor = vec4(0.0);
	vec2 fragCoord = _xy;

	vec2 uv = (fragCoord.xy - RENDERSIZE.xy*0.5)/RENDERSIZE.y;

    vec3 o = vec3(2.5, 2.5,-5.0 + dynamic_time);

	vec3 lp = o;
    float range = 6.0;
    lp.x += range*sin(bass_time);
    lp.y += range*cos(bass_time);


    vec3 r = normalize(vec3(uv, f_o_v));

    r.yz = _rotate(r.yz, lookY*PI);
    r.xz = _rotate(r.xz, lookX*PI);
    r.xy = _rotate(r.xy, roll);
    r.xz = _rotate(r.xz, turn);
    r.yz = _rotate(r.yz, flip);

    float t = trace(o, r);

    vec3 sc = vec3(0.0);

    if(t<FAR){

        vec3 sp = o + r*t;
        vec3 sn = nrm(sp);
        float ao = cAO(sp, sn);


        sc = doColor(sp, r, sn, lp);
        sc *= (softShadow(sp + 0.1*sn, r, 10.0))*ao;

        //caustic lighting, based on a technique by Shane
        vec3 caustic = sc*abs(tan(t*(2.0)))*(vec3(1.0) - getObjectColor(sp, 1.0))*caustic_presence*syn_MidHits*1.35;
        sc = mix(sc+caustic, caustic, caustic_presence);        

    }
    float fog = 1./(1. + t*.005208333*FAR);
    sc = mix(vec3(0), sc, fog);
    uv = fragCoord/RENDERSIZE.xy;
    sc *= pow(16.*uv.x*uv.y*(1. - uv.x)*(1. - uv.y) , .125);


	fragColor = vec4(sqrt(max(sc, 0.)), 1);
	return fragColor;
 }


vec4 sobelIntensity(in vec4 color){

  return color;

}

vec4 sobelHelper(float stepx, float stepy, vec2 center, sampler2D tex){

  vec4 tleft = sobelIntensity(texture(tex,clamp(center + vec2(-stepx,stepy), 0.0, 1.0)));

  vec4 left = sobelIntensity(texture(tex,clamp(center + vec2(-stepx,0), 0.0, 1.0)));

  vec4 bleft = sobelIntensity(texture(tex,clamp(center + vec2(-stepx,-stepy), 0.0, 1.0)));

  vec4 top = sobelIntensity(texture(tex,clamp(center + vec2(0,stepy), 0.0, 1.0)));

  vec4 bottom = sobelIntensity(texture(tex,clamp(center + vec2(0,-stepy), 0.0, 1.0)));

  vec4 tright = sobelIntensity(texture(tex,clamp(center + vec2(stepx,stepy), 0.0, 1.0)));

  vec4 right = sobelIntensity(texture(tex,clamp(center + vec2(stepx,0), 0.0, 1.0)));

  vec4 bright = sobelIntensity(texture(tex,clamp(center + vec2(stepx,-stepy), 0.0, 1.0)));



  vec4 x = tleft + 2.0*left + bleft - tright - 2.0*right - bright;

  vec4 y = -tleft - 2.0*top - tright + bleft + 2.0 * bottom + bright;

  vec4 color = sqrt((x*x) + (y*y));

  return color*(1.0+3.0*syn_BassPresence);

}

vec4 edgeDetectSobel(sampler2D tex){

	float stepSize = 0.15;

  vec2 uv = _uv;

  if (uv.x < 0.0 || uv.y < 0.0 || uv.y > 1.0 || uv.x > 1.0) {

    return vec4(0.0);

  } 

  return sobelHelper(stepSize/RENDERSIZE.x, stepSize/RENDERSIZE.y, uv, tex);

}

vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderMainImage();
	}

    if (PASSINDEX == 1.0) {
        vec4 fragColor = vec4(0.0);
        vec4 normalCol = texture(mainPass, _uv);

        vec4 edges = clamp(edgeDetectSobel(mainPass), 0.0, 1.0);

        vec4 edgesCol = vec4(0.0);

        edgesCol = normalCol*edges*2.0;

        fragColor = mix(normalCol, edgesCol, 0.5);


        return fragColor;

    }

    if(PASSINDEX == 2.0){

        vec4 img = texture(secondPass, _uv);
        vec2 uv = _uv;
        vec2 uvL = _uv;

        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }

        if (uvL.x > 0.5) {
            uvL.x = 1.0 - uvL.x;
        }

		vec4 mirImg = texture(secondPass, uv);
        vec4 mirImgL = texture(secondPass, uvL);

        return mix(mix(img, mirImgL, audio_mir), mirImg, mix(l_vert_mirr_mix, syn_ToggleOnBeat, audio_mir));
	}

    if(PASSINDEX == 3.0){
        
        vec4 img = texture(rVertMirrPass, _uv);
        vec2 uv = _uv;

        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }

		vec4 mirImg = texture(rVertMirrPass, uv);

        return mix(img, mirImg, hor_mirr_mix);
	}
}
