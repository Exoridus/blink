vec3 _grad3(vec3 col1, vec3 col2, vec3 col3, float mixVal){

    mixVal *= 2.0;

    float mix1 = clamp(mixVal,0.0,1.0);

    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);

    return mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));

}

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

mat2 r2d(float a) 
{
    float c = cos(a), s = sin(a);
    return mat2(c, s, -s, c);
}

vec3 re(vec3 p, float d) 
{return mod(p - d * .5, d) - d * .5;}


void amod(inout vec2 p, float d) 
{
    float a = re(vec3(atan(p.y, p.x)), d).x;
    p = vec2(cos(a), sin(a)) * length(p);
}

float sdTorus( vec3 p, vec2 t )
{
  vec2 q = vec2(length(p.xz)-t.x,p.y);
  return length(q)-t.y;
}

float sdBox( vec3 p, vec3 b )
{
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
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

float tubes(vec3 p)
{
    p.xz *= r2d(geo_dynamic_time*0.7-p.y*0.125);
    p.xz *= r2d(p.y*0.5);
    p.xz += normalize(p.xz)*(0.125)*(sin(p.y*5.0));
    amod(p.xz, 2.*PI / floor(satellites));
    p.x -= 1.5 + sin(p.y*0.125)*0.25;

    float toobs = length(p.xz) - 0.125;
    
    vec3 q = p;
    q.x += sin(q.y*2.0)*0.25 - orbit_width;
    q.y += geo_dynamic_time;
    
    q.y= re(q, 2.0).y;
    q.xy = _rotate(q.xy, geo_dynamic_time);

    toobs = sdTorus(q, vec2(0.5, 0.1)*sat_scale);

    float cage = sdBoundingBox(q, vec3(0.5)*sat_scale, 0.15);
    toobs = mix(toobs, cage, geo_var);

    return toobs;

}

vec2 map(in vec3 p) {

    
    vec2 shape = vec2(1.0);
    
    vec3 q = p;
    q.y *= 1.5;

    q.yz = _rotate(q.yz, PI*0.5);
    q.xz = _rotate(q.xz, PI*0.125 + dynamic_time*0.0625);
    vec3 r = q;
    
    //twist
    float k = twist_val * (audio_twist > 0.5 ? sin(-geo_dynamic_time*0.0625) : 1.0);
    float c = cos(k*q.y);
    float s = sin(k*q.y);
    mat2  m = mat2(c,-s,s,c);
    r = vec3(m*q.xz,q.y);
    
    vec2 torusSize = vec2(5.0,4.5-sin(r.y*5.0 + geo_dynamic_time)*0.2);
    
    float torus = -sdTorus(r, torusSize);

    float disp_val = displace_surface;
    float disp = sin(disp_val*r.z);
    torus = mix(torus, disp*0.05, 0.6);

    vec3 qq = q;
    qq.yz = _rotate(qq.yz, PI*0.5);

    float toobs = tubes(qq);

    if (toobs < torus) {
        shape.y = 2.0;
    }

    torus = smin(torus, toobs, gooey);

    shape.x = torus;

    return shape;
}

vec2 march( in vec3 ro, in vec3 rd)
{
    vec2 res = vec2(-1.0,-1.0);

    float tmin = 0.5;
    float tmax = 60.0;
    
    float t = tmin;
    for( int i=0; i<120 && t<tmax; i++ )
    {
        vec2 h = map( ro+rd*t);
        if( abs(h.x)<(0.0005*t) )
        { 
            res = vec2(t,h.y); 
            break;
        }
        t += h.x;
    }
    
    return res;
}

vec2 marchRef(vec3 ro, vec3 rd){

    vec2 t = vec2(0.0);
    vec2 d = vec2(0.0);

    for (int i = 0; i < 16; i++){

        d = map(ro + rd*t.x);
        if(abs(d.x)<.002 || t.x>(60.*1.5)) break;

        t += d;
    }

    return t;

}

float softShadow(vec3 ro, vec3 lp, float k){

    const int maxIterationsShad = 12; 

    vec3 rd = (lp-ro);

    float shade = 1.;

    float dist = .0035;    

    float end = max(length(rd), .001);

    float stepDist = end/float(maxIterationsShad);
    rd /= end;

    for (int i=0; i<maxIterationsShad; i++){

        float h = map(ro + rd*dist).x;
        shade = min(shade, smoothstep(0., 1., k*h/dist));
        dist += clamp(h, .02, .25);
        if (h<0. || dist > end) break; 

    }

    return min(max(shade, 0.) + .5, 1.); 

}

vec3 calcNormal( in vec3 pos )
{

    vec2 e = vec2(0.0005,0.0);
    return normalize( vec3( 
        map( pos + e.xyy ).x - map( pos - e.xyy).x,
        map( pos + e.yxy).x - map( pos - e.yxy ).x,
        map( pos + e.yyx).x - map( pos - e.yyx ).x ) );

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

vec3 getObjectColor(vec3 p, vec3 n, float mat){


    vec3 col = vec3(0.0,0.0,0.0);
    vec3 color = base_color;
    if (mat == 1.0) {
        col = color;
    }
    else {
        col = vec3(1.0) - color;
    }

    col = mix(col,_hsv2rgb(vec3((sdBox(p*rainbow_width+n.y*0.25, vec3(dynamic_time*0.125))), 1.0, 1.0)),rainbow);
    vec3 mediaColor = tex3D(syn_UserImage, p*media_scale, n)*clamp(1.0-p.z, 0.125, 1.0);
    mediaColor = mix(mediaColor, col*mediaColor, bass_mult > 0.5 ? syn_BassPresence*syn_Level : multiply_media);

    col = mix(col, mediaColor, media_color);

    col = clamp(col, 0.0, 0.75);
    return col;

}


vec3 doColor(in vec3 sp, in vec3 rd, in vec3 sn, in vec3 lp, vec2 t){

    vec3 ld = lp-sp;

    float lDist = max(length(ld), .001);

    ld /= lDist;

    float atten = 3.0 / (1. + lDist*.2 + lDist*lDist*.1);

    float diff = max(dot(sn, ld), 0.);

    float spec = pow(max( dot( reflect(-ld, sn), -rd ), 0.0), brightness);

    vec3 objCol = getObjectColor(sp, sn, t.y);

    vec3 texCol = tex3D(syn_UserImage, sp*0.05, sn);

    texCol = pow(texCol, vec3(2.0))*10.0;

    vec3 sceneCol = (objCol*(diff*diffuse_strength + (.15+media_color*1.5)) + objCol*spec*2.) * atten;

    return sceneCol;
}

vec3 render( in vec3 ro, in vec3 rd, float time )
{ 

    vec3 lp = ro;
    lp.z += 7.5;
    vec2 t = march(ro, rd);
    vec3 sp = ro + rd*t.x;
    ro += rd*t.x;
    vec3 saveRO = ro;
    vec3 sn = calcNormal(ro);
    vec3 sceneColor = doColor(ro, rd, sn, lp, t);
    float sh = softShadow(ro, lp, 16.);
    rd = reflect(rd, sn);
    vec2 tSave = t;
    t = marchRef(ro +  rd*.01, rd);
    ro += rd*t.x;
    sn = calcNormal(ro);
    vec3 reflCol = doColor(ro, rd, sn, lp, tSave);
    sceneColor = _grad3(sceneColor, reflCol+sceneColor, reflCol, reflectivity);
    sceneColor *= sh;

    return sceneColor;
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


vec4 renderMain() {

    if(PASSINDEX==0.){
        
        vec3 ro = vec3(0.0, 0.0, -5.0);
        
        vec3 lk = vec3(0.0,1.0,0.0);

        vec2 uv = _uvc;
        vec3 rd = normalize(vec3(uv,f_o_v));

        rd = normalize(vec3(rd.xy, sqrt(max(rd.z*rd.z - dot(rd.xy, rd.xy)*.085, 0.))));

        rd.yz = _rotate(rd.yz, lookXY.y*-PI);
        rd.xz = _rotate(rd.xz, lookXY.x*-PI);


        vec3 col = render( ro, rd, dynamic_time );

        return vec4( col, 1.0 );
    }
    else if (PASSINDEX == 1.0) {
        vec4 fragColor = vec4(0.0);
        vec4 normalCol = texture(mainPass, _uv);

        vec4 edges = clamp(edgeDetectSobel(mainPass), 0.0, 1.0);

        vec4 edgesCol = vec4(0.0);

        edgesCol = normalCol*edges*2.0;

        fragColor = mix(normalCol, edgesCol, edgeMix);


        return fragColor;

    }
    else if (PASSINDEX == 2.0) {
        vec2 uv = _uv;
        vec4 mainPassCol = texture(edgePass, uv);

        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }

        vec4 hor_mir_pass = texture(edgePass, uv);

        return mix(mainPassCol, hor_mir_pass, hor_mir_mix);
    }
    else if (PASSINDEX == 3.0) {
        vec2 uv = _uv;
        vec4 mainPassCol = texture(horMirrPass, uv);

        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }

        vec4 vert_mir_pass = texture(horMirrPass, uv);

        return mix(mainPassCol, vert_mir_pass, vert_mir_mix);
    }
    else if(PASSINDEX==4.0){
        vec2 uv = _uv;

        vec2 pol = _toPolar(_uvc);

        vec4 final = texture(vertMirrPass, _uv);

        if (pol.x > 0.3+f_o_v) {
            final.xyz = vec3(0.0);
        }

        return final;
    }
}