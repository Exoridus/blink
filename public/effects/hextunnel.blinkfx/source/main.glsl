float camZ = 0.5 * TIME + sin(script_time);
			//******** BuffA Code Begins ********

float sdHexPrism( vec3 p, vec2 h )
{
    vec3 q = abs(p);
    return max(q.z-h.y,max((q.x*(0.866025*(2.0-syn_Presence))+q.y*0.5),q.y)-h.x);
}

float sdBox( vec3 p, vec3 b )
{
  vec3 d = abs(p) - b;
  return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

float opS( float d1, float d2 )
{
    return max(-d1,d2);
}

 mat3 rotationMatrix(vec3 axis, float angle)
{
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    
    return mat3(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c);
}

float map(vec3 p)
{
   // p.x += (texture(iChannel0, 0.01 * p.zz + TIME * 100.0).r - 0.5) * 0.2;
    vec3 q = p;
    vec3 staticPos = q-vec3(0.0,0.0,camZ);

    // p.y -= 1.5*_pulse(staticPos.z, (1.0-undulate)*10.0, 4.0)*sqrt(undulate);


    vec3 c = vec3(0.1);
    p.z = mod(p.z,c.z)-0.5*c.z;
    p = p * rotationMatrix(vec3(0.0, 0.0, 1.0), 1.0 * sin(q.z) + 2.0 * sin( TIME*0.2+syn_BassTime*0.2 + q.z));
    
    float rad = 0.7 + 0.4 * sin(q.z) + 0.5+0.5*sin(TIME*0.5);
    float rad2 = rad * radius; //0.8 + 0.8 * cos(q.z );
    float outer = sdHexPrism(p, vec2(rad, 0.01+0.02*syn_Presence));
    float inner = sdHexPrism(p, vec2(rad2, 0.6));
    
    float ring =  opS(inner, outer);
    
    // vec3 p_s = p; 
    // p_s = p_s * rotationMatrix(vec3(0.0, 0.0, 1.0), 3.1415 * 0.333 );
    // float bars = sdBox(p_s, vec3(2.0, sin(q.z * 10.0)* 0.5 + 0.5, 0.1)); 
    
    float result = ring; //opS(bars, ring);
    
    return result;
}


vec3 tpl( sampler2D t, in vec3 p, in vec3 n ){
   
    n = max(abs(n), 0.001);
    n /= (n.x + n.y + n.z );  
  vec3 tx = (texture(t, p.yz)*n.x + texture(t, p.zx)*n.y + texture(t, p.xy)*n.z).xyz;
    
    return tx*tx;
}

vec3 nr(in vec3 p)
{  
    vec2 e = vec2(-1, 1)*.001;   
  return normalize(e.yxx*map(p + e.yxx) + e.xxy*map(p + e.xxy) + 
           e.xyx*map(p + e.xyx) + e.yyy*map(p + e.yyy) );   
}

// See http://iquilezles.org/www/articles/palettes/palettes.htm for more information


vec3 pal( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d )
{
    return a + b*cos( 6.28318*(c*t+d) );
}


void getCamPos(inout vec3 ro, inout vec3 rd)
{
    ro.z += camZ;
    // ro.x += sin(TIME * 0.2) * 0.1;

    rd = rd * rotationMatrix(vec3(0.0, 1.0, 0.0), 0.2 * sin(TIME * 0.2 + 3.14));
}

vec3 applyFog( in vec3  rgb,      // original color of the pixel
               in float distance, // camera to point distance
               in vec3  rayDir,   // camera to point vector
               in vec3  sunDir )  // sun light direction
{
    float fogAmount = 1.0 - exp( -distance*0.2 );
    float sunAmount = max( dot( rayDir, sunDir ), 0.0 );
    vec3  fogColor  = mix( vec3(0.1,1.0,1.0), // fog color
                           vec3(0.0)*0.7, // light color
                           pow(sunAmount,8.0) );
    return mix(rgb, rgb, fogAmount);
}


vec4 renderPassA() {
	vec4 fragColor = vec4(0.0);
	vec2 fragCoord = _xy;


    vec2 _p = (-RENDERSIZE.xy + 2.0*fragCoord.xy) / RENDERSIZE.y;
    vec3 ray = normalize(vec3(_p, 1.0));
    ray.xz = _rotate(ray.xz, cam_Look.x);
    ray.yz = _rotate(ray.yz, -cam_Look.y);
    vec3 cam = vec3(0.0, 0.0, 0.0);
    bool hit = false;
    getCamPos(cam, ray);


    float depth = 0.0, d = 0.0, iter = 0.0;
    vec3 p;
    
    for( int i = 0; i < 80; i ++)
    {
    	p = depth * ray + cam;
        d = map(p);
                  
        if (d < 0.001) {
			hit = true;
            break;
        }
                   
		depth += d * 0.5 ;
		iter++;
                   
    }
    
    vec3 col = vec3(1.0-iter/80.0);
    if(hit){
        col = pow(vec3(0.1), vec3(3.0));
    }

    col = applyFog(col, depth, ray, vec3(0, 0, 1));
    vec3 norm = nr(p);
    vec3 lum = pow(tpl(syn_Media, p*media_scale+0.5, norm*10.0)*vec3(0.0, Red, Green),vec3(1.0));
    col.rgb += lum;

    fragColor = vec4(col, p.z);

	return fragColor; 
 } 


vec4 renderMainImage() {
	vec4 fragColor = vec4(0.0);

    vec2 uv = _uv;
    uv.x += ripples*sin(uv.y * 50.0) / 80.0;
    vec4 buff = texture(BuffA, clamp(uv,0.0,1.0));
    float depth = buff.a;

    // vec4 noise  = texture(image30, uv + TIME * 100.0).rrrr - 0.5;
	// vec4 noise0 = texture(image30, 0.01 * uv + TIME * 0.001).rrrr - 0.5;
    vec2 delta = vec2(uv - 0.5) * 0.1; // * noise0.r * 10.0 ;
    vec4 col;
    
    col.rgb = buff.gbr;
    col.rg -= texture(BuffA, clamp(uv + delta*0.5*sin(depth*0.1+syn_HighTime*0.2),0.0,1.0)).g;
    col.gb -= texture(BuffA, clamp(uv - delta*0.5*sin(depth*0.1+syn_HighTime*0.2),0.0,1.0)).b;
    col.a = 1.0;
    
    fragColor = pow(col, vec4(0.3, 0.5, 0.3+(1.0-Blue)*5.0, 0.5)).rgba;
	return fragColor; 
 } 


vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderPassA();
	}
	if(PASSINDEX == 1){
		return renderMainImage();
	}
}