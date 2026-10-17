vec4 iMouse = vec4(720, 720, 0.0, 0.0); 


			//******** BuffA2 Code Begins ********

#define _G0 0.25
#define _G1 0.125
#define _G2 0.0625
#define W0 24.0
#define W1 0.3
#define TIMESTEP 0.2
float ADVECT_DIST = mix(0.2, syn_BassLevel*0.4-syn_HighHits*0.25, pulsing_fire)*(0.9+syn_Presence*0.2);

// nonlinearity
float nl(float x) {
    return 1.0 / (1.0 + exp(W0 * (W1 * x - 0.5))); 
}

vec4 gaussian(vec4 x, vec4 x_nw, vec4 x_n, vec4 x_ne, vec4 x_w, vec4 x_e, vec4 x_sw, vec4 x_s, vec4 x_se) {
    return _G0*x + _G1*(x_n + x_e + x_w + x_s) + _G2*(x_nw + x_sw + x_ne + x_se);
}

bool reset() {
    return ((reset_sim>0.5)||(TIME<0.1));
}

vec2 normz(vec2 x) {
	return x == vec2(0.0, 0.0) ? vec2(0.0, 0.0) : normalize(x);
}

vec4 advect(vec2 ab, vec2 vUv, vec2 step) {
    
    vec2 aUv = vUv - ab * ADVECT_DIST * step;
    
    vec2 n  = vec2(0.0, step.y);
    vec2 ne = vec2(step.x, step.y);
    vec2 e  = vec2(step.x, 0.0);
    vec2 se = vec2(step.x, -step.y);
    vec2 s  = vec2(0.0, -step.y);
    vec2 sw = vec2(-step.x, -step.y);
    vec2 w  = vec2(-step.x, 0.0);
    vec2 nw = vec2(-step.x, step.y);

    vec4 u =    texture(BuffA2, fract(aUv));
    vec4 u_n =  texture(BuffA2, fract(aUv+n));
    vec4 u_e =  texture(BuffA2, fract(aUv+e));
    vec4 u_s =  texture(BuffA2, fract(aUv+s));
    vec4 u_w =  texture(BuffA2, fract(aUv+w));
    vec4 u_nw = texture(BuffA2, fract(aUv+nw));
    vec4 u_sw = texture(BuffA2, fract(aUv+sw));
    vec4 u_ne = texture(BuffA2, fract(aUv+ne));
    vec4 u_se = texture(BuffA2, fract(aUv+se));
    
    return gaussian(u, u_nw, u_n, u_ne, u_w, u_e, u_sw, u_s, u_se);
}

vec2 diagH(vec2 x, vec2 x_v, vec2 x_h, vec2 x_d) {
    const float xd = sqrt(3.0) / 2.0;
    const float xi = 1.0 - xd;
    return 0.5 * ((x + x_v) * xi + (x_h + x_d) * xd);
}

vec2 diagV(vec2 x, vec2 x_v, vec2 x_h, vec2 x_d) {
    const float xd = sqrt(3.0) / 2.0;
    const float xi = 1.0 - xd;
    return 0.5 * ((x + x_h) * xi + (x_v + x_d) * xd);
}

vec2 rotateCenter(vec2 uvIn, float amount){
  uvIn.y += (RENDERSIZE.x-RENDERSIZE.y)/RENDERSIZE.x;
  uvIn*=vec2(1.0, RENDERSIZE.y/RENDERSIZE.x);
  _uv2uvc(uvIn);
  uvIn = _rotate(uvIn, amount);
  _uvc2uv(uvIn);
  uvIn/=vec2(1.0, RENDERSIZE.y/RENDERSIZE.x);
  uvIn.y -= (RENDERSIZE.x-RENDERSIZE.y)/RENDERSIZE.x;
  return uvIn;
}
// vec4 col = mix(img, img*extra_bright+texture(fxApplied, rotateCenter(_uv, fb_rotate*PI)-sign(fb_motion)*fb_motion*fb_motion*0.1+(_uvc)*fb_zoom*fb_zoom*sign(fb_zoom)*0.05), feedback_mix);


vec4 renderPassA() {
	vec4 fragColor = vec4(0.0);
	vec2 fragCoord = _xy;

    vec2 vUv = fragCoord.xy / RENDERSIZE.xy;
    vec2 texel = 1. / RENDERSIZE.xy;
    vUv = vUv - _uvc*0.005*syn_BassLevel*syn_BassLevel*bass_travel;
    float dist = glassy_surface*glassy_surface;

    vec2 n  = vec2(0.0, 1.0)*dist;
    vec2 ne = vec2(1.0, 1.0)*dist;
    vec2 e  = vec2(1.0, 0.0)*dist;
    vec2 se = vec2(1.0, -1.0)*dist;
    vec2 s  = vec2(0.0, -1.0)*dist;
    vec2 sw = vec2(-1.0, -1.0)*dist;
    vec2 w  = vec2(-1.0, 0.0)*dist;
    vec2 nw = vec2(-1.0, 1.0)*dist;

    vec4 u =    texture(BuffA2, fract(vUv));
    vec4 u_n =  texture(BuffA2, fract(vUv+texel*n));
    vec4 u_e =  texture(BuffA2, fract(vUv+texel*e));
    vec4 u_s =  texture(BuffA2, fract(vUv+texel*s));
    vec4 u_w =  texture(BuffA2, fract(vUv+texel*w));
    vec4 u_nw = texture(BuffA2, fract(vUv+texel*nw));
    vec4 u_sw = texture(BuffA2, fract(vUv+texel*sw));
    vec4 u_ne = texture(BuffA2, fract(vUv+texel*ne));
    vec4 u_se = texture(BuffA2, fract(vUv+texel*se));
    
    const float vx = 0.5;
    const float vy = sqrt(3.0) / 2.0;
    const float hx = vy;
    const float hy = vx;

    float di_n  = nl(distance(u_n.xy + n, u.xy));
    float di_w  = nl(distance(u_w.xy + w, u.xy));
    float di_e  = nl(distance(u_e.xy + e, u.xy));
    float di_s  = nl(distance(u_s.xy + s, u.xy));
    
    vec2 d_nne = diagV(u.xy, u_n.xy, u_e.xy, u_ne.xy) + vec2(+ vx, + vy);
    vec2 d_ene = diagH(u.xy, u_n.xy, u_e.xy, u_ne.xy) + vec2(+ hx, + hy);
    vec2 d_ese = diagH(u.xy, u_s.xy, u_e.xy, u_se.xy) + vec2(+ hx, - hy);
    vec2 d_sse = diagV(u.xy, u_s.xy, u_e.xy, u_se.xy) + vec2(+ vx, - vy);
    vec2 d_ssw = diagV(u.xy, u_s.xy, u_w.xy, u_sw.xy) + vec2(- vx, - vy);
    vec2 d_wsw = diagH(u.xy, u_s.xy, u_w.xy, u_sw.xy) + vec2(- hx, - hy);
    vec2 d_wnw = diagH(u.xy, u_n.xy, u_w.xy, u_nw.xy) + vec2(- hx, + hy);
    vec2 d_nnw = diagV(u.xy, u_n.xy, u_w.xy, u_nw.xy) + vec2(- vx, + vy);
    
    float di_nne = nl(distance(d_nne, u.xy));
    float di_ene = nl(distance(d_ene, u.xy));
    float di_ese = nl(distance(d_ese, u.xy));
    float di_sse = nl(distance(d_sse, u.xy));    
    float di_ssw = nl(distance(d_ssw, u.xy));
    float di_wsw = nl(distance(d_wsw, u.xy));
    float di_wnw = nl(distance(d_wnw, u.xy));
    float di_nnw = nl(distance(d_nnw, u.xy));

    vec2 xy_n  = u_n.xy + n - u.xy;
    vec2 xy_w  = u_w.xy + w - u.xy;
    vec2 xy_e  = u_e.xy + e - u.xy;
    vec2 xy_s  = u_s.xy + s - u.xy;
    
    vec2 xy_nne = d_nne - u.xy;
    vec2 xy_ene = d_ene - u.xy;
    vec2 xy_ese = d_ese - u.xy;
    vec2 xy_sse = d_sse - u.xy;
    vec2 xy_ssw = d_ssw - u.xy;
    vec2 xy_wsw = d_wsw - u.xy;
    vec2 xy_wnw = d_wnw - u.xy;
    vec2 xy_nnw = d_nnw - u.xy;

    vec2 ma = di_nne * xy_nne + di_ene * xy_ene + di_ese * xy_ese + di_sse * xy_sse + di_ssw * xy_ssw + di_wsw * xy_wsw + di_wnw * xy_wnw + di_nnw * xy_nnw + di_n * xy_n + di_w * xy_w + di_e * xy_e + di_s * xy_s;

    vec4 u_blur = gaussian(u, u_nw, u_n, u_ne, u_w, u_e, u_sw, u_s, u_se);
    
    vec2 du = u_blur.xy;
    vec2 dv = u_blur.zw;
    
    for (int i = 0; i < 5; i++ ) {
        vec4 auv = advect(du, vUv, texel);        
        dv = auv.zw + 1.0 * ma;
        du = auv.xy + 0.4 * dv;
    }

    if (iMouse.z > 0.0) {
    	vec2 d = fragCoord.xy - iMouse.xy;
        float m = 2.0 * exp(-length(d) / 100.0);
        du.xy += m * normz(d);
    }
    
    vec3 init = texture(image16, vUv).xyz;
    // initialize with noise
    if((length(u) <= 0.001 && init != vec3(0.0)) || reset()) {
        fragColor = vec4(-0.5 + init.xy, 0.0, 0.0);
    } else {
        fragColor = vec4(du, dv);
    }

    if (length(dv)<5.0){
        fragColor.zw = mix(fragColor.zw, fragColor.xy, darken);
    }

    if (length(du)>10.0){
        fragColor.xy = mix(fragColor.xy, fragColor.xy*4.0, fireworks);
    }
    if (length(dv)<1.0){
        fragColor.xy = mix(fragColor.xy, -fragColor.xy*1.0, fireworks);
    }

    fragColor = mix(fragColor, vec4(1.0,1.0,1.0,1.0), _pulse(length(_uvc), -0.1+(1.0-ring_of_fire)*2.0, 0.01+length(du)*0.01));
    fragColor = mix(fragColor, vec4(0.0,0.0,_uvc), _pulse(-0.1+abs(_uvc.x)+length(dv)*0.01, (1.0-scan_lines)*1.0, 0.01+length(du)*0.01));


	return fragColor; 
 } 


// Visualization of the system in Buffer A

// uncomment to just render the normals
//#define NORMAL

// displacement
float DISP = (2.0*(1.0-glassy_surface*0.5)*media_refract*(0.5+pow(length(_uvc), 2.0)*0.5))*0.015;

// contrast
#define SIGMOID_CONTRAST 8.0

// mip level
#define MIP 1.0

vec4 contrast(vec4 x) {
	return 1.0 / (1.0 + exp(-SIGMOID_CONTRAST * (x - 0.5)));    
}

vec4 renderMainImage(){
    vec4 fragColor = vec4(0.0);
    vec2 texel = 1. / RENDERSIZE.xy;
    vec2 uv = _xy.xy / RENDERSIZE.xy;

    vec2 n  = vec2(0.0, texel.y);
    vec2 e  = vec2(texel.x, 0.0);
    vec2 s  = vec2(0.0, -texel.y);
    vec2 w  = vec2(-texel.x, 0.0);

    vec2 d   = texture(BuffA2, uv).xy;
    vec2 d_n = texture(BuffA2, fract(uv+n)).xy;
    vec2 d_e = texture(BuffA2, fract(uv+e)).xy;
    vec2 d_s = texture(BuffA2, fract(uv+s)).xy;
    vec2 d_w = texture(BuffA2, fract(uv+w)).xy;    

    vec3 i   = _textureMedia(fract(uv + DISP * d  ), MIP).xyz;
    vec3 i_n = _textureMedia(fract(uv + DISP * d_n), MIP).xyz;
    vec3 i_e = _textureMedia(fract(uv + DISP * d_e), MIP).xyz;
    vec3 i_s = _textureMedia(fract(uv + DISP * d_s), MIP).xyz;
    vec3 i_w = _textureMedia(fract(uv + DISP * d_w), MIP).xyz;

    vec2 db = 0.4 * d + 0.15 * (d_n+d_e+d_s+d_w);
    float dd = exp(-0.02 * length(abs(d_n-d_s) + abs(d_e-d_w)));
    vec3 ib = 0.4 * i + 0.15 * (i_n+i_e+i_s+i_w);
   
    vec3 nr = normalize(vec3(db.x,db.y,sqrt(clamp(1.0-length(db.xy),0.0,1.0))));
    //vec3 l = normalize(vec3(cos(TIME), sin(TIME), 0.1)); 
    //vec3 sh = pow(vec3(clamp(dot(nr,l),0.0,1.0)), vec3(1.0));
    float shl = 1.0 * exp(-0.13 * length(db.xy)) * dd;
    vec3 col1P = 2.0*(1.0-smoothstep(0.9, 1.0, dd))*_palette(clamp(smoothstep(0.9, 1.0, dd), 0.0, 1.0), vec3(1.025, 0.361, 0.703), vec3(0.900, 0.506, 0.724), vec3(0.720, 1.005, 0.075), vec3(1.000, 0.950, 0.590));

    vec3 col1 = mix(vec3(1.3, 0.0, 0.0), col1P, 0.5*syn_BassLevel);
    vec3 col2 = vec3(0.9, 0.7, 0.3);

    // *** Color Regime 1 ***
    float colMixer = color_palette;
    float cm = smoothstep(0.15, 0.85, clamp(colMixer, 0.0, 1.0));
    
    vec3 col2P = _palette(clamp(-nr.y*0.4, 0.0, 1.0), vec3(0.540, 0.440, 1.424), vec3(0.410, 0.480, 1.000), vec3(0.810, 0.525, 0.207), vec3(0.210, 0.480, 0.399));
    col1 = mix(col1, col2P.gbr*2.0, cm);
    col2 = mix(col2, col1P.grg, cm);
    // return vec4(col2P,1.0);

    // *** Color Regime 2 ***
    colMixer = colMixer-1.0;
    cm = smoothstep(0.15, 0.85, clamp(colMixer, 0.0, 1.0));
    col1P = (1.0-smoothstep(0.5, 0.5+0.2, dd*dd))*vec3(1.0)*5.0*(0.2+syn_HighHits);
    col1 = mix(col1, col1P, cm);
    col2P = (1.0-smoothstep(0.0, 0.1, 1.0-dd*dd))*vec3(0.4,0.0,0.3)*20.0*pow(syn_Presence, 1.6);
    col2 = mix(col2, col2P, cm);

    // *** Color Regime 3 ***
    colMixer = colMixer-1.0;
    cm = smoothstep(0.15, 0.85, clamp(colMixer, 0.0, 1.0));
    col1P = 2.0*(1.0-smoothstep(0.9, 1.0, dd))*_palette(clamp(smoothstep(0.9, 1.0, dd), 0.0, 1.0), vec3(1.025, 0.361, 0.703), vec3(0.900, 0.506, 0.724), vec3(0.720, 1.005, 0.075), vec3(1.000, 0.950, 0.590));

    col1 = mix(col1, col1P, cm);
    col2P = _palette(clamp(1.0-dd*_uv.y*length(_uvc)-0.2, 0.0, 1.0), vec3(0.380, 0.420, 0.940), vec3(0.730, 0.740, 0.500), vec3(0.570, 0.223, 0.360), vec3(0.382, 0.670, 0.433));
    col2 = mix(col2, col2P, cm);

    vec3 m = shl * mix(col1, col2, shl);

    if (_isMediaActive()){
			fragColor = mix(vec4(ib, 1.0), contrast(vec4(mix(0.7*ib + m, ib*m, multiply_color),1.0)), media_color_only);
    } else {
    	fragColor = contrast(vec4(m, 1.0));
    }
	return fragColor; 
 } 


vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderPassA();
	}
    if(PASSINDEX == 1){
        return texture(BuffA, _uv);
    }
	if(PASSINDEX == 2){
		vec4 fireCol = renderMainImage();
        // vec3 hsv = _rgb2hsv(fireCol.rgb);

        // hsv = _hsv2rgb(hsv);
        return fireCol;
	}
}