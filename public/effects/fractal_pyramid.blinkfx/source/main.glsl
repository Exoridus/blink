// original author: https://www.shadertoy.com/view/tsXBzS
// https://www.shadertoy.com/user/bradjamesgrant
// License: Unknown

float fold = syn_BassTime*bass_folding- syn_Time*0.003;
float rotation = syn_HighTime*high_rotation + syn_BassTime*bass_rotation-syn_Time*0.03;
float dyn_iterations = map_iterations+ bass_iterations*syn_BassLevel +randombeat_iterations*syn_RandomOnBeat;
vec3 palette(float d){
	return mix(color1,color2,d*(1.0-syn_BassHits*0.2));
}

vec2 rotate(vec2 p,float a){
	float c = cos(a);
    float s = sin(a);
    return p*mat2(c,s,-s,c);
}

float map(vec3 p){
    for( int i = 0; i<dyn_iterations; ++i){
        float t = fold;
        p.xz =rotate(p.xz,t);
        p.xy =rotate(p.xy,t*1.89);
        p.xz = abs(p.xz);
        p.xz-=.5;
	}
	return dot(sign(p),p)/5.;
}

vec4 rm (vec3 ro, vec3 rd){
    float t = 0.;
    vec3 col = vec3(0.);
    float d;
    for(float i =0.; i<64.; i++){
		vec3 p = ro + rd*t;
        d = map(p)*.5;
        if(d<0.02){
            break;
        }
        if(d>100.){
        	break;
        }
        col+=palette(length(p)*.1)/(400.*(d));
        t+=d;
    }
    return vec4(col,1./(d*100.));
}

vec4 renderMainImage() {
	vec2 fragCoord = _xy;

    vec2 uv = (fragCoord-(RENDERSIZE.xy/2.))/RENDERSIZE.x;
	vec3 ro = vec3(0.,0.,-50.);
    ro.xz = rotate(ro.xz, rotation);
    vec3 cf = normalize(-ro);
    vec3 cs = normalize(cross(cf,vec3(0.,1.,0.)));
    vec3 cu = normalize(cross(cf,cs));
    
    vec3 uuv = ro+cf*scale_factor + uv.x*cs + uv.y*cu;
    
    vec3 rd = normalize(uuv-ro);
    
    vec4 col = rm(ro,rd);
    
    return col;
}

vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderMainImage();
	}
}