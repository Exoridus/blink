//Sphere Chaser - Psybernautics (Alex Tiemann) - 2021
#define FAR 160.

    
float sdSphere( vec3 p, float s )
{
    return length(p)-s;
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


vec3 re(vec3 p, float d) 
{return mod(p - d * .5, d) - d * .5;}


void amod(inout vec2 p, float d) 
{
    float a = re(vec3(atan(p.y, p.x)), d).x;
    p = vec2(cos(a), sin(a)) * length(p);
}


float sdBox( vec3 p, vec3 b )
{
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}


float sdSphereOrCage(vec3 p) {
    float size = sphere_scale+0.125*syn_BassLevel*sphere_scale;

    return mix(sdSphere(p, size), sdBox(p, vec3(size)) - PI*0.0625, rand_geo > 0.5 ? syn_RandomOnBeat : sphere_or_cube) ;


}

vec2 oracle(vec3 p) {

    vec3 q = p;
    q.z -= sphere_space+20.0;
    vec2 result = vec2(4.0);
 
    q.xy += vec2(2.0,2.0);

    vec3 q1 = q;

    q1.xy -= vec2(2.0, 4.0);
    q1.xy -= vec2(syn_MidHighPresence)*(vec2(2.0,-4.0));
    q1.z -= cos(bass_time)*4.0;
    q1.xy = _rotate(q1.xy, mid_time);
    q1.xz = _rotate(q1.xz, -midHigh_time);
    amod(q1.xy, 2.0*PI / 4.0);
    q1.x -= sphere_space - 2.0*syn_MidPresence;

    q.xy -= vec2(syn_BassPresence)*(vec2(2.0,4.0));
    q.z -= cos(mid_time)*4.0;
    q.yz = _rotate(q.yz, midHigh_time);
    q.xy = _rotate(q.xy, -bass_time);
    amod(q.xy, 2.0*PI / 4.0);
    q.x -= sphere_space + 2.0*syn_MidHighPresence;

    result.x = smin(sdSphereOrCage(q), sdSphereOrCage(q1), gooey);
    
    return result;

}

vec2 map(vec3 p) {

    vec3 q = p;
    
    q.x += sphere_space*sinBTime;
    q.y += sphere_space*cosBTime;    

    vec2 scene = vec2(2.0);

    vec2 oracle1 =  oracle(p);

    vec2 oracle2 =  oracle(q);

    if (oracle1.x < oracle2.x) {
        scene.y = 3.0;
    }

    scene.x = smin(oracle1.x, oracle2.x, 0.1);


    return scene;
    
}

vec2 mapRef(vec3 p) {


    vec2 scene = vec2(2.0);

    scene.x = sdSphere(p*0.125, sphere_scale);
    return scene;
    
}

vec2 trace(vec3 ro, vec3 rd){

    vec2 t = vec2(0.0);
    vec2 d = vec2(0.0);

    for (int i = 0; i < 30; i++){

        d = map(ro + rd*t.x);

        if(abs(d.x)<.0005 || t.x>FAR) break;        

        t.x += d.x*.75;

    }

    t.y = d.y;

    return t;

}


vec2 traceRef(vec3 ro, vec3 rd){

    vec2 t = vec2(0.0);
    vec2 d = vec2(0.0);

    for (int i = 0; i < 8; i++){

        d = mapRef(ro + rd*t.x);

        if(abs(d.x)<.002 || t.x>(FAR*1.5)) break;
        t += d;

    }
    return t;

}

// Tetrahedral normal, to save a couple of "map" calls. Courtesy of IQ.

vec3 getNormal( in vec3 p ){

    vec2 e = vec2(.0025, -.0025); 

    return normalize(

        e.xyy * map(p + e.xyy).x + 

        e.yyx * map(p + e.yyx).x + 

        e.yxy * map(p + e.yxy).x + 

        e.xxx * map(p + e.xxx).x);

}


vec3 getObjectColor(vec3 p, float material){

    vec3 col = color_1;
    if (material == 3.0 && one_color < 0.5) {
        col = vec3(1.0) - color_1;
    }
    float colorSphere = -sdSphere(p*0.015,-bass_time*0.125);
    col = mix(col, _hsv2rgb(vec3(colorSphere, 1.0, 1.0)), rainbow);
    return col;
}

vec3 doColor(in vec3 sp, in vec3 rd, in vec3 sn, in vec3 lp, vec2 t){

    vec3 ld = lp-sp;

    float lDist = max(length(ld), .001);

    ld /= lDist;

    float atten = 1. / (2. + lDist*.2 + lDist*lDist*.1);

    float diff = max(dot(sn, ld), 0.1);

    float spec = pow(max( dot( reflect(ld, sn), -rd ), 0.0), 2.0);

    vec3 objCol = getObjectColor(sp*1.5, t.y);

    vec3 texCol = texture(syn_UserImage, _invertYAxisVideo(_uv)).xyz;

    texCol = pow(texCol, vec3(2.0))*5.0;

    objCol = syn_MediaType > 0.5 ? mix(objCol, mix(texCol, objCol*texCol, mediaMult), media_uv) : objCol;

    vec3 lightCol = objCol;
    vec3 sceneCol = (objCol*(diff*(brightness*0.75 + 10.0)) + lightCol*spec*brightness) * atten;
    return sceneCol;
}


vec4 renderMainImage() {

	vec4 fragColor = vec4(0.0);

	vec2 fragCoord = _xy;

    int AA = 1;

    vec4 totalC = vec4(0.0);

    for( int m=0; m<AA; m++ )

    for( int nm=0; nm<AA; nm++ )

        {

            vec2 uv = (fragCoord.xy - RENDERSIZE.xy*.5) / RENDERSIZE.y;

            vec3 ro = vec3(0.0, 0.0, -5.0);

            vec3 lp = ro;
            vec3 lk = ro + vec3(0.0,0.0,15.0);


            float fFOV=3.14159/(FOV*2.0);
            vec3 forward=normalize(lk-ro);
            vec3 right=normalize(vec3(forward.z,0.,-forward.x));
            vec3 up=cross(forward,right);

            vec3 rd=normalize(forward+fFOV*uv.x*right+fFOV*uv.y*up);
            rd = normalize(vec3(rd.xy, sqrt(max(rd.z*rd.z - dot(rd.xy, rd.xy)*.085, 0.))));


            rd.xy = _rotate(rd.xy, auto_roll);

            vec2 t = trace(ro, rd);

            vec3 sp = ro + rd*t.x;

            ro += rd*t.x;

            vec3 saveRO = ro;

            vec3 sn = getNormal(ro);

            rd = reflect(rd, sn);

            vec2 tSave = t;
            t = traceRef(ro +  rd*.01, rd);
            ro += rd*t.x;
            sn = getNormal(ro);

            vec3 reflCol = doColor(ro, rd, sn, lp, tSave);

            vec3 sceneColor = reflCol;

            float fogF = smoothstep(0., .5, tSave.x/(FAR*2.0));
            fogF += smoothstep(0., .5, t.x/(FAR*2.0));
            sceneColor = mix(sceneColor, vec3(0.0), fogF); 
            totalC += vec4(sqrt(clamp(sceneColor, 0., 1.)), 1);

    }

    return totalC;

 } 





vec4 renderMain(){

	if(PASSINDEX == 0){

		return renderMainImage();

	}
    else if (PASSINDEX == 1) {
        vec4 img = texture(firstPass, _uv);

        if (traceMix < 0.1) {
            return img;
        }

        vec2 uwu = ( ( _uv - 0.5 ) / ( 1.0 + (zoom_direction*mix(1.0, syn_BassLevel, bass_zoom)) ) + 0.5 );
        float size = 0.1;
        float flow = sin(bass_time);
        uwu.x += img.r*size + flow;
        uwu.y += img.g*size + flow;
        uwu -= img.b*size + flow;
        vec4 fragColor = vec4(0.0);

        float thresh = 0.0;       
        if(img.x <= thresh && img.y <= thresh && img.z <= thresh) {
            img = mix(img, texture(syn_FinalPass, uwu), traceMix);
        }

        return img;
    }
    if(PASSINDEX == 2.0){

        vec4 normalCol = texture(postFXPass, _uv);

        if (color_disrupt < 0.1) {
            return normalCol;
        }

        vec4 altNormCol = normalCol;
        float thresh = 0.0;
        bool value = normalCol.x > thresh && normalCol.y > thresh && normalCol.z > thresh;
        vec2 pol_coord = (_uv);
      
        if (pol_coord.x > 0.5 && pol_coord.y > 0.5) {
            pol_coord = vec2(1.0) - pol_coord;
        }

        _uv2uvc(pol_coord);

        pol_coord = _toPolar(pol_coord);
        pol_coord.y += bass_time;

        vec3 normHSV = _rgb2hsv(normalCol.xyz);

        if (fract(length(pol_coord)) < (syn_BassHits*0.4) && value && _toPolar(_uvc).x > (1.0 - syn_BassHits*0.9)) {
            normHSV.x *= 2.0;
            altNormCol.xyz = _hsv2rgb(normHSV);
        }

        return mix(normalCol, altNormCol, color_disrupt);
	}
    if(PASSINDEX == 3.0){

        vec4 img = texture(secondPass, _uv);
        vec2 uv = _uv;

        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }

		vec4 mirImg = texture(secondPass, uv);

        return mix(img, mirImg, mix(l_vert_mirr_mix, 1.0, audio_mir));
	}
    if(PASSINDEX == 4.0){
        
        vec4 img = texture(rVertMirrPass, _uv);
        vec2 uv = _uv;

        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }

		vec4 mirImg = texture(secondPass, uv);

        return mix(img, mirImg, mix(r_vert_mirr_mix, syn_ToggleOnBeat, audio_mir));
	}

}