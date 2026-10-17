// Created by Stephane Cuillerdier - Aiekick/2015
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

// #define limited_displace

float dstepf = 0.0;

const vec2 RMPrec = vec2(0.2, 0.05); 
const vec3 DPrec = vec3(1e-3, 12., 1e-8); 

vec2 Params; // x => ratio, y => Density

float bassBump = (clamp(syn_BassLevel, 0.25, 1.0)-0.25)*1.5;
float bumpAction = mix(bassBump*bassBump, syn_ToggleOnBeat, bass_bump);
vec4 map(vec3 p)
{
	// pattern based on 104 shader https://www.shadertoy.com/view/ltlSW4 
    vec4 col = vec4(p,1);
    vec2 i = col.xz*Params.y;
    i=i/col.y+syn_Time*0.2;
    i-=col.xy=ceil(i+=i.x*=.577);
    if (alt_geometry>0.5){
        col.xz+=step(1.,col.z=mod(col.x+col.y,3.))-step(2.,col.z)*step(i,i.yx)*mod(syn_BeatTime, 8.0)*0.5;
        col.y=0.;
    } else {
        col.xy+=step(1.,col.z=mod(col.x+col.y,3.))-step(2.,col.z)*step(i,i.yx);
        col.z=0.;
    }
    col=.5+.5*sin(col*grouping_size);

    dstepf += 0.005;

    // float disp;
    
    // #ifdef limited_displace
    // 	disp = dot(col.rgb,vec3(Params.x));
    // #else
    // 	disp = dot(col,vec4(Params.x));
    // #endif               
                
    float disp = col.r*col.g*(1.0+alt_geometry*1.0);
    float space = flat_plane<0.5 ? length(p):p.y;
    float dist = space - 3.5 - smoothstep(0., 1., disp*bumpAction)*size_bumps;
    col = mix(col, 1.0-col.brra, alt_geometry);
    return vec4(dist, col.rgb*mult_col);
}

vec3 nor( vec3 pos, float prec )
{
    vec2 e = vec2( prec, 0. );
    vec3 n = vec3(
    map(pos+e.xyy).x - map(pos-e.xyy).x,
    map(pos+e.yxy).x - map(pos-e.yxy).x,
    map(pos+e.yyx).x - map(pos-e.yyx).x );
    return normalize(n);
}

vec3 cam(vec2 uv, vec3 ro, vec3 cu, vec3 cv)
{
	vec3 rov = normalize(cv-ro);
    vec3 u =  normalize(cross(cu, rov));
    vec3 v =  normalize(cross(rov, u));
    vec3 rd = normalize(rov + u*uv.x + v*uv.y);
    return rd;
}

vec3 tpl( sampler2D t, in vec3 p, in vec3 n ){
    p*=0.5;
    n = max(abs(n), 0.001);
    n /= (n.x + n.y + n.z );
    if (_isMediaActive()){
        p *= 1.0;
        p = (_textureMedia(p.yz+0.5)*n.x + _textureMedia(p.zx+0.5)*n.y + _textureMedia(p.xy+0.5)*n.z).xyz;
        p *= 2.0;
    } else {
        p = (texture(t, p.yz+0.5)*n.x + texture(t, p.zx+0.5)*n.y + texture(t, p.xy+0.5)*n.z).xyz;
    }
    return p*p;
}

vec4 renderMainImage() {
	vec4 f = vec4(0.0);
	vec2 g = _xy;

    vec2 si = RENDERSIZE.xy;
   	float t = TIME;
    Params.x = 0.75;
    Params.y = 10.;
    Params = vec2(0.75, num_hexes*num_hexes*20.0);
    f = vec4(0.);
    float ca = t*.2; // angle z
    float ce = elevation; // elevation
    float cd = 0.5; // distance to origin axis
    vec3 cu=vec3(0,1,0);//Change camere up vector here
    vec3 cv=vec3(0,0,0); //Change camere view here
    float refl_i = .6; // reflexion intensity
    float refr_a = 1.2; // refraction angle
    float refr_i = .8; // refraction intensity
    float bii = 0.6; // bright init intensity
    vec2 uv = (g+g-si)/min(si.x, si.y);
    vec3 ro = vec3(sin(ca)*cd, ce+1., cos(ca)*cd); //
    vec3 rd = cam(uv, ro, cu, cv);
    float b = bii;
    vec3 d = vec3(0.);
    vec3 p = ro+rd*d.x;
    float s = DPrec.y;
    float rmd = sign(map(p).x);
    for(int i=0;i<1000;i++)
    {      
		if(s<DPrec.x||s>DPrec.y) break;
        s = map(p).x*(s>DPrec.x?RMPrec.x:RMPrec.y);
       	if (sign(s) != rmd) break;
        d.y = d.x;
        d.x += s * 0.3/1.3;
        p = ro+rd*d.x;
   	}

    float countIter = 0.;
    if (sign(s) == rmd)
    {
    	p = ro+rd*d.x;
        rmd = map(p).x;
        for (int i = 0; i < 20; i++)
        {
        	countIter += 10.;
            d.z = (d.x + d.y)*.5;
            p = ro+rd*d.z;
            s = map(p).x*RMPrec.y;
            d.x += abs(s);
            if (abs(s) < DPrec.z)break;
            (d.x*rmd < 0. )? (d.x = d.z ): (d.y = d.z);
       	}
        d.x = (d.x+d.y) * .5;
   	}

    f += pow(b,15.);
    
    float hit = 0.0;
    if (d.x<DPrec.y)
    {
        hit = 1.0;
    	float nPrec = 10./countIter;
        vec3 n = nor(p, nPrec);
        vec3 ray = reflect(rd, n);
        f.rgb += tpl(skyTex, ray*1.0, n) * refl_i; 
        ray = refract(rd, n, refr_a);
        f.rgb += tpl(skyTex, rd*1.0, n) * refr_i; 
        f.rgb = mix(f.rgb, map(p).yzw,0.65-syn_BassLevel*syn_BassLevel*0.25);                
   	}
    else
    {
        f = mix(vec4(tpl(skyTex, rd*0.75, -rd*0.01), 1.0)*0.3, vec4(0.2), bkg_off);
    }

    f *= mix(dstepf, dstepf*dstepf*dstepf*0.1, sqrt(intense_lighting));
    vec3 hexCol = map(p).gba;

    vec3 hsvCol = _rgb2hsv(hexCol);
    float surf = smoothstep(2.0, 5.0, d.z);
    surf = mix(hit, hit+smoothstep(2.0, 5.0, d.z), disco_bkg);
    surf *= _pulse(hsvCol.r, 0.5+0.5*sin(syn_BeatTime), 0.2)*(syn_Hits*syn_Hits)*2.0;

    vec4 colOut = vec4(surf*hexCol, 1.0);

    f += colOut*DISCO;
	return f; 
 } 

vec3 filter_() {
  vec2 delta = 1. / RENDERSIZE;
  
  vec3 val = texture(tunnelPass, _uv).xyz;


  vec3 l = texture(tunnelPass, _uv + vec2(0., delta.y)).xyz;
  vec3 r = texture(tunnelPass, _uv - vec2(0., delta.y)).xyz;
  vec3 u = texture(tunnelPass, _uv + vec2(delta.x, 0.)).xyz;
  vec3 d = texture(tunnelPass, _uv - vec2(delta.x, 0.)).xyz;
  
  vec3 bloom = max(val, max(max(l, r), max( u, d)));
  bloom = bloom  + l + r + u + d;
  bloom /= 5.; // orlando;
  return bloom;

}

vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderMainImage();
	} else if (PASSINDEX == 1){
        return vec4(filter_(), 1.0);
    }
}
