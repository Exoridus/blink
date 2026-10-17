//sup playa

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

    vec3 tx = _contrast(_invertImage(vec4(texture(t, mirP.yz).xyz, 0.0)), _Media_Contrast).rgb;

    vec3 ty = _contrast(_invertImage(vec4(texture(t, mirP.zx).xyz, 0.0)), _Media_Contrast).rgb;

    vec3 tz = _contrast(_invertImage(vec4(texture(t, mirP.xy).xyz, 0.0)), _Media_Contrast).rgb;


    return (tx*tx*n.x + ty*ty*n.y + tz*tz*n.z);

}



#define FAR 80.


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

vec3 re(vec3 p, float d) 
{return mod(p - d * .5, d) - d * .5;}


float sdBox( vec3 p, vec3 b )
{
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}

float sdTorus( vec3 p, vec2 t )
{
  vec2 q = vec2(length(p.xz)-t.x,p.y);
  return length(q)-t.y;
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

float box_or_cage(vec3 p, vec3 size) {

    float factor = abs_sin_time_4th_speed_geo; 
    return sdBoundingBox(p,size,(0.7 - factor*0.6)) - roundedGeo;

}

vec2 level_1_geo(vec3 p)
{

    if (level1_geo < 0.5) {
        return vec2(1.0);
    }

    vec3 base_size = vec3(1.5, 0.5+3.0*abs_sin_time_4th_speed_geo, 1.5);
    

    vec3 base_pos = p;
    //base_pos.y += 1.0;
    base_pos.x = abs(p.x)  - 3.5*abs_sin_time_4th_speed_geo;
    
    float base = box_or_cage(base_pos,base_size);

    vec3 level2_pos = p;
    level2_pos.xz = abs(p.xz)  -3.0*abs_sin_time_4th_speed_o_geo;
    level2_pos.y += 1.0;

    vec3 level2_size =  vec3(0.75, 5.0*abs_sin_time_4th_speed_o_geo, 0.75);

    float level2 = box_or_cage(level2_pos, level2_size);

    vec3 ring_pos = p;
    ring_pos.z += geo_dynamic_time;
    ring_pos.y += 2.0 - 5.0*abs_sin_time_8th_speed_geo;
    ring_pos.z = re(ring_pos, 3.0).z;
    
    ring_pos.xy = _rotate(ring_pos.xy, geo_dynamic_time);

    float rings = sdTorus(ring_pos,vec2(1.0, 0.25));

    float tower = smin(base, level2, 0.5);

    vec2 result = vec2(tower, 1.0);

    if (rings < tower) {
        result.y = 2.0; 
    }
    
    float world = smin(tower, rings, 0.15);
    result.x = world;

    return result;
}

vec2 level_2_geo(vec3 p)
{
    if (level2_geo < 0.5) {
       return vec2(1.0);
    }

    vec3 base_size = vec3(smoothstep(2.0,0.5,abs_sin_time_4th_speed_geo));
    
    vec3 base_pos = p;
    base_pos.y -= 6.0+3.0*abs_sin_time_4th_speed_o_geo;
    base_pos.xz = abs(base_pos.xz)  - 3.5*abs_sin_time_4th_speed_o_geo;
    
    float base = box_or_cage(base_pos,base_size);

    vec3 level2_pos = p;
    level2_pos.xz += 1.5;
    level2_pos = abs(level2_pos)-0.5;
    level2_pos.y += 1.0;

    vec3 level2_size =  vec3(0.75, 5.0 - 5.0*abs_sin_time_4th_speed_o_geo, 0.75);

    vec3 q = base_pos;
    vec3 oq = q;

    float level2 = length(q.xy + sin(10.0*(oq.x-oq.z)+geo_dynamic_time*3.0)*0.03) - 0.125;

    q.xz = _rotate(q.xz, PI*0.5);

    float level3 = length(q.xy + sin(10.0*(oq.x-oq.z)+geo_dynamic_time*3.0)*0.03) - 0.125;

    level2 = smin(level2, level3, 0.05);

    float tower = smin(base, level2, 0.01);
    
    vec2 result = vec2(tower, 3.0);

    return result;
}

vec2 level_3_geo(vec3 p)
{
    if (level3_geo < 0.5) {
        return vec2(1.0);
    }

    vec3 base_pos = p;
    base_pos.y += 3.0 - 20.0*abs_sin_time_16th_speed;
    vec3 base_pos2 = base_pos;

    vec3 base_size = vec3(1.25)*abs_sin_time_8th_speed_geo;
    vec2 ring_size = vec2(1.25,0.345)*abs_sin_time_8th_speed_geo;

    base_pos.xy = _rotate(base_pos.xy, geo_dynamic_time);

    float box1 = sdBoundingBox(base_pos, base_size, 0.1);
    vec2 result = vec2(box1, 1.0);

    base_pos2.yz = _rotate(base_pos2.yz, -geo_dynamic_time);
    
    float ring = sdTorus(base_pos2, ring_size*0.75);

    if (ring < box1) {
        result.y = 2.0;
    }

    float world = smin(box1, ring, 0.5);

    result.x = world;

    return result;
}

vec2 map(vec3 p) {

    vec2 scene = vec2(0.0);

    float fh = -0.1 - 0.125*(sin(p.x*2.0)+sin(p.z*2.0)+sin(p.y*2.0));

    float ground_geo = p.y- fh;
    vec2 ground = vec2(ground_geo,1.0);
    
    vec3 q = p;
    q.xz = re(q, 9.0).xz;
    vec2 levels = smin(level_1_geo(q), level_2_geo(q), 0.005);
    levels = smin(levels, level_3_geo(q), 0.25);
    
    scene = smin(ground, levels, 0.125);

    return scene;
    
}

vec2 march(vec3 ro, vec3 rd){

    vec2 t = vec2(0.0);
    vec2 d = vec2(0.0);

    for (int i = 0; i < 120; i++){

        d = map(ro + rd*t.x);

        if(abs(d.x)<.0005 || t.x>FAR) break;        

        t.x += d.x*.75;
    }

    //material tag
    t.y = d.y;
    return t;

}


// Tetrahedral normal by IQ.

vec3 getNormal( in vec3 p ){

    // Note the slightly increased sampling distance, to alleviate

    // artifacts due to hit point inaccuracies.

    vec2 e = vec2(.0025, -.0025); 

    return normalize(

        e.xyy * map(p + e.xyy).x + 

        e.yyx * map(p + e.yyx).x + 

        e.yxy * map(p + e.yxy).x + 

        e.xxx * map(p + e.xxx).x);

}



vec3 getObjectColor(vec3 p, vec3 n, float mat){


    vec3 col = vec3(0.0,0.0,0.0);
    /*
        base geo = 1.0
        bottom rings = 2.0
        2nd level = 3.0
        level3 box = 1.0
        level3 ring = 2.0
    */
    vec3 color = base_color;
    // /color = _rgb2hsv(color);
    if (mat == 1.0) {
        col = color;
    }
    else {
        //color.y = 0.0;
        col = vec3(1.0) - color;
    }

    //rainbow
    col = mix(col,_hsv2rgb(vec3((sdBox(p*0.01+n.y*0.25, vec3(dynamic_time*0.25))), 1.0, 1.0)),rainbow);
     

    col = mix(col, tex3D(syn_UserImage, p*0.0625, n)*1.5, media_color);

    return col;

}


vec3 doColor(in vec3 sp, in vec3 rd, in vec3 sn, in vec3 lp, vec2 t){

    vec3 ld = lp-sp;

    float lDist = max(length(ld), .001);

    ld /= lDist;

    float atten = clamp(abs_sin_time_16th_speed*2.0, 1., 2.) / (1. + lDist*.2 + lDist*lDist*.1);

    float diff = max(dot(sn, ld), 0.);

    float spec = pow(max( dot( reflect(-ld, sn), -rd ), 0.), brightness);

    vec3 objCol = getObjectColor(sp, sn, t.y);

    vec3 texCol = tex3D(syn_UserImage, sp*0.05, sn);

    texCol = pow(texCol, vec3(2.0))*10.0;

    vec3 sceneCol = (objCol*(diff*diffuse_strength + (.15+media_color*1.5)) + objCol*spec*20.) * atten;

    return sceneCol;
}

//camera setup
mat3 cam(vec3 ro, vec3 ta)
{
    vec3 f=normalize(ta-ro);
    vec3 r=normalize(cross(f,vec3(0.,1.,0.)));
    vec3 u=normalize(cross(r,f));
    return mat3(r,u,f);
}


vec4 renderMainImage() {

	vec4 fragColor = vec4(0.0);

	vec2 uv = _uvc;    

    vec3 ro = vec3(0.0,10.0,cos(dynamic_time));

    vec3 lp = ro;
    vec3 lk = vec3(0.0,1.0,0.0);

    ro += vec3(moveRightScr, level2_geo > 0.5 ? 5.0 + abs_sin_time_16th_speed*15.0 : abs_sin_time_16th_speed*20.0, -10.0);
    lp.y = 2.0 + abs_sin_time_16th_speed*18.0;
    ro.xz = _rotate(ro.xz, 0.5*dynamic_time*altCam);

	vec3 rd=cam(ro,lk)*normalize(vec3(uv,FOV));

    
    
    vec2 t = march(ro, rd);
    vec3 sp = ro + rd*t.x;

    ro += rd*t.x;   

    vec3 sn = getNormal(ro);


    vec3 sceneColor = doColor(ro, rd, sn, lp, t);

    vec4 color = vec4(sqrt(clamp(sceneColor, 0., 1.)), 1);
    color = pow(color, vec4(2.0));

    return color;
 } 


/**

 * Detects edges using the Sobel equation

 * @name syn_pass_edgeDetectSobel

 * @param  {sampler2D} smp texture you wish to detect edges on

 * @returns {float} edges

 */



vec4 sobelIntensity(in vec4 color){

  return color;

  // return sqrt((color.x*color.x)+(color.y*color.y)+(color.z*color.z));

}

vec4 sobelHelper(float stepx, float stepy, vec2 center, sampler2D tex){

  // get samples around pixel

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

  return color;

}

vec4 edgeDetectSobel(sampler2D tex){

	float stepSize = 1.0;

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
    else if (PASSINDEX == 1) {
        vec4 fragColor = vec4(0.0);
        vec4 normalCol = texture(buffA, _uv);

        vec4 edges = clamp(edgeDetectSobel(buffA), 0.0, 1.0);

        vec4 edgesCol = vec4(0.0);

        edgesCol = normalCol*edges*2.0;

        fragColor = mix(normalCol, edgesCol, edgeMix);


        return fragColor;

    }
    else if (PASSINDEX == 2) {
        vec2 uv = _uv;
        vec4 mainPassCol = texture(edgePass, uv);

        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }

        vec4 hor_mir_pass = texture(edgePass, uv);

        return mix(mainPassCol, hor_mir_pass, hor_mir_mix);
    }
    else if (PASSINDEX == 3) {
        vec2 uv = _uv;
        vec4 mainPassCol = texture(horMirrPass, uv);

        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }

        vec4 vert_mir_pass = texture(horMirrPass, uv);

        return mix(mainPassCol, vert_mir_pass, vert_mir_mix);
    }
}