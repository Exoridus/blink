vec4 iMouse = vec4(GRAPH_SELECT*RENDERSIZE, 0.0, 0.0); 


// Created by Stephane Cuillerdier - Aiekick/2015
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

vec2 gridSize = vec2(4.,3.);//grid size (columns, rows)
    
vec2 s,g,h,m;
float z,t;
vec2 xyInPow = pow(xy_modifier, vec2(0.7));
float x_amp = xyInPow.x;
float y_amp = xyInPow.y;

float e0(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = uv * vec2(cos(uv.y*p-t)*x_amp,sin(uv.x*p-t)*y_amp)*a;
   	return 0.3/dot(uvSin.xyxy,uvSin.yxxy);
}
float e1(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = uv + vec2(cos(uv.y*p-t)*x_amp,sin(uv.x*p-t)*y_amp)*a;
   	return 0.3/dot(uvSin.xyxy,uvSin.yxxy);
}
float e2(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = uv + vec2(cos(uv.y*p-t)*x_amp,sin(uv.x*p-t)*y_amp)*a;
   	return 0.3/dot(uvSin,uvSin);
}
float e3(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = uv + vec2(cos(uv.y*p-t)*x_amp,sin(uv.x*p-t)*y_amp)*a;
   	return 0.3/dot(uvSin.xy,uvSin.yx);
}
float e4(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = uv + vec2(tan(uv.y*p-t)*x_amp,sin(uv.x*p-t)*y_amp)*a;
   	return 0.3/dot(uvSin.xx,uvSin.yx);
}
float e5(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = uv + vec2(cos(uv.y/p-t)*x_amp,sin(uv.x*p-t)*y_amp)/a/a;
    return 0.3/dot(uvSin.xy,uvSin.yy);
}
float e6(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = uv + vec2(cos(uv.y*p-t)*x_amp,sin(uv.x/p-t)*y_amp)/a/p;
    return 0.3/dot(uvSin.xxyx,uvSin.xyxx);
}
float e7(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = 0.2/dot(uv,uv) * vec2(cos(uv.y*p-t)*x_amp*p/a,sin(uv.x*p)*y_amp)*a;
   	return dot(uvSin,uvSin)/1.2;
}
float e8(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = 0.2/dot(uv,uv.xx) * vec2(cos(uv.y*p-t)*x_amp*p/a,sin(uv.x*p)*y_amp)*a;
   	return dot(uvSin,uvSin)/(p*p*0.25);
}
float e9(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = 0.3/dot(uv.xyyx,uv.yxxy) * vec2(cos(uv.y*p-t)*x_amp/p,sin(uv.x*p-t)*y_amp*p)/a;
   	return dot(uvSin.xyxy,uvSin.yxxy)/1.2;
}
float e10(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = 0.3/dot(uv.xxy,uv.yxx) / vec2(cos(uv.y*p)*p*x_amp,sin(uv.x*p-t)*y_amp/p)/a;
   	return 0.3/dot(uvSin,uvSin/p);
}
float e11(vec2 uv, float a, float p, float t) // ok
{
    vec2 uvSin = uv / vec2(cos(uv.y*p-t)*x_amp,sin(uv.x*p-t))*y_amp*a/p;
   	return 0.1/dot(uvSin,uvSin);
}
float EncID(vec2 s, vec2 h, vec2 sz) // encode id from coord // s:screenSize / h:pixelCoord / sz=gridSize
{
    float cx = floor(h.x/(s.x/sz.x));
    float cy = floor(h.y/(s.y/sz.y));
    return cy*sz.x+cx;
}
vec2 DecID(float id, vec2 sz) // decode id to coord // id:cellId / sz=gridSize
{
    float cx = mod(float(id), sz.x);
    float cy = (float(id)-cx)/sz.x;
    return vec2(cx,cy);
}
vec3 getcell(vec2 s, vec2 h, vec2 sz) // return id / uv
{
    float cx = floor(h.x/(s.x/sz.x));
    float cy = floor(h.y/(s.y/sz.y));
    
    float id = cy*sz.x+cx;
    
    vec2 size = s/sz;
    float ratio = size.x/size.y;
    vec2 uv = (2.*(h)-size)/size.y - vec2(cx*ratio,cy)*2.;
    uv*=1.5;
    
    return vec3(id, uv);
}
vec4 renderMainImage() {
	vec4 fragColor = vec4(0.0);
	vec2 fragCoord = _xy;

    z = 3.;
    t = script_time*5.0;
    s = RENDERSIZE.xy;
    h = fragCoord.xy;
    g = z*(2.*h-s)/s.y;
    m = iMouse.xy;
    
    float d=0.;
    vec3 cell = getcell(s,h,gridSize);
    float mouseCol = 0.0;
    if(TURN_ME_DOWN<=0.99) {
      cell.x = EncID(s,m,gridSize);
      cell.yz = g;
      cell.yz *= mix(1.0, (2.0-syn_Presence), auto_zoom);
    } else {
      mouseCol = smoothstep(0.05,0.04,distance(_uvc, (-0.5+GRAPH_SELECT.xy)*vec2(RENDERSIZE.x/RENDERSIZE.y,1.0)));
    }

    float aSet = pow(thickness, 2.0)*1.5;
    float frequencyIn = pow(frequency, 2.0)*10.0;

    if (cell.x == 0.) d = e0(cell.yz, aSet, frequencyIn, t);
    else if (cell.x == 1.) d = e1(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 2.) d = e2(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 3.) d = e3(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 4.) d = e4(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 5.) d = e5(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 6.) d = e6(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 7.) d = e7(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 8.) d = e8(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 9.) d = e9(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 10.) d = e10(cell.yz, aSet, frequencyIn, t);
   	else if (cell.x == 11.) d = e11(cell.yz, aSet, frequencyIn, t);
   	 
    vec3 c = vec3(mix(1.0/d, d, color_mod));
    
    fragColor.rgb = clamp(c, 0.0, 1.0);

    fragColor.rgb = mix(fragColor.rgb, 1.0-fragColor.rgb, mouseCol);

    fragColor.rgb = mix(fragColor.rgb, 1.0-fragColor.rgb, invert);

    if (_isMediaActive()){
      fragColor.rgb *= _loadMedia().rgb;
    }

    fragColor.a = 1.;
	  return fragColor; 
} 


vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderMainImage();
	}
}