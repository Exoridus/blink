#define MAX_ITER 140

#define RIGID
// Standard 2x2 hash algorithm.
vec2 hash22(vec2 p) {
    
    // Faster, but probaly doesn't disperse things as nicely as other methods.
    float n = sin(dot(p, vec2(113, 1)));
    p = fract(vec2(2097152, 262144)*n)*2. - 1.;
    #ifdef RIGID
    return p;
    #else
    return cos(p*6.283 + TIME);
    //return abs(fract(p+ TIME*.25)-.5)*2. - .5; // Snooker.
    //return abs(cos(p*6.283 + TIME))*.5; // Bounce.
    #endif

}
// Gradient noise. Ken Perlin came up with it, or a version of it. Either way, this is
// based on IQ's implementation. It's a pretty simple process: Break space into squares, 
// attach random 2D vectors to each of the square's four vertices, then smoothly 
// interpolate the space between them.
float gradN2D(in vec2 f){
    
    // Used as shorthand to write things like vec3(1, 0, 1) in the short form, e.yxy. 
   const vec2 e = vec2(0, 1);
   
    // Set up the cubic grid.
    // Integer value - unique to each cube, and used as an ID to generate random vectors for the
    // cube vertiies. Note that vertices shared among the cubes have the save random vectors attributed
    // to them.
    vec2 p = floor(f);
    f -= p; // Fractional position within the cube.
    

    // Smoothing - for smooth interpolation. Use the last line see the difference.
    //vec2 w = f*f*f*(f*(f*6.-15.)+10.); // Quintic smoothing. Slower and more squarish, but derivatives are smooth too.
    vec2 w = f*f*(3. - 2.*f); // Cubic smoothing. 
    //vec2 w = f*f*f; w = ( 7. + (w - 7. ) * f ) * w; // Super smooth, but less practical.
    //vec2 w = .5 - .5*cos(f*3.14159); // Cosinusoidal smoothing.
    //vec2 w = f; // No smoothing. Gives a blocky appearance.
    
    // Smoothly interpolating between the four verticies of the square. Due to the shared vertices between
    // grid squares, the result is blending of random values throughout the 2D space. By the way, the "dot" 
    // operation makes most sense visually, but isn't the only metric possible.
    float c = mix(mix(dot(hash22(p + e.xx), f - e.xx), dot(hash22(p + e.yx), f - e.yx), w.x),
                  mix(dot(hash22(p + e.xy), f - e.xy), dot(hash22(p + e.yy), f - e.yy), w.x), w.y);
    
    // Taking the final result, and converting it to the zero to one range.
    return c*.5 + .5; // Range: [0, 1].
}

// Gradient noise fBm.
float fBm(in vec2 p){
    
    return gradN2D(p)*.57 + gradN2D(p*2.)*.28 + gradN2D(p*4.)*.15;
    
}

vec3 threeColMix(vec3 col1, vec3 col2, vec3 col3, float mixVal){
    mixVal = smoothstep(0.0, 1.0, mixVal);
    mixVal *= 2.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    return mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
}

vec3 fourColMix(vec3 col1, vec3 col2, vec3 col3, vec3 col4, float mixVal){
        mixVal = smoothstep(0.0, 1.0, mixVal);
    mixVal *= 3.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
    vec3 firstTwo = mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
    return mix(firstTwo, mix(col3, col4, mix3), step(2.0, mixVal));
}
vec3 _rgb3(float val1, float val2, float val3){
    return vec3(val1, val2, val3)/255.0;
}

vec3 _grad4(vec3 col1, vec3 col2, vec3 col3, vec3 col4, float mixVal){
    mixVal *= 3.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
    vec3 firstTwo = mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
    return mix(firstTwo, mix(col3, col4, mix3), step(2.0, mixVal));
}

float lengthRep = 1500;
float cameraZ = mod(fly_in_out_script + script_bass_time*1.0, lengthRep);

vec3 palette( in float t)
{
  vec3 a = vec3(0.600, 0.500, 0.500);
  vec3 b = vec3(1.000, 0.500, 0.500);
  vec3 c = vec3(0.500, 0.690, 0.750);
  vec3 d = vec3(0.500, 0.500, 0.500);
  
    return a + b*cos( 6.28318*(c*t+d) );
}

vec3 rotateX(vec3 p, float angle)
{
    float c = cos(angle);
    float s = sin(angle);
    return vec3(p.x, c*p.y+s*p.z, -s*p.y+c*p.z);
}

vec3 rotateY(vec3 p, float angle)
{
    float c = cos(angle);
    float s = sin(angle);
    return vec3(c*p.x-s*p.z, p.y, s*p.x+c*p.z);
}

vec3 rotateZ(vec3 p, float angle)
{
    float c = cos(angle);
    float s = sin(angle);
    return vec3(c*p.x+s*p.y, -s*p.x+c*p.y, p.z);
}

mat3 rotationMatrix(vec3 axis, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    
    return mat3(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c);
}

vec3 opRep( vec3 p, vec3 c )
{
    vec3 q = mod(p, c) - 0.5 * c;
    
    return q;
}

float sdCappedCylinder( vec3 p, vec2 h )
{
  vec2 d = abs(vec2(length(p.xz),p.y)) - h;
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float opS( float d1, float d2 )
{
    return max(-d1,d2);
}

float sdCylinder( vec3 p, vec3 c )
{
  return length(p.xz-c.xy)-c.z;
}

float hex(vec3 p, vec2 h) {
  vec3 q = abs(p);
  return max(q.z-h.y, max((q.x*0.866025+q.y*0.5),q.y) - h.x);
}

float sdTriPrism( vec3 p, vec2 h )
{
    vec3 q = abs(p);
    return max(q.z-h.y,max(q.x*0.866025+p.y*0.5,-p.y)-h.x*0.5);
}
vec2 polar(vec2 c) {
  return vec2(atan(c.y, c.x), length(c));
}
vec2 cart(vec2 p) {
  return p.y * vec2(cos(p.x), sin(p.x));
}

// polynomial smooth min (k = 0.1);
float smin( float a, float b, float k )
{
    float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
    return mix( b, a, h ) - k*h*(1.0-h);
}

float sdSphere( vec3 p, float s )
{
  return length(p)-s;
}

float impulse( float k, float x )
{
    float h = k*x;
    return h*exp(1.0-h);
}  

float cubicPulse( float c, float w, float x )
{
    x = abs(x - c);
    if( x>w ) return 0.0;
    x /= w;
    return 1.0 - x*x*(3.0-2.0*x);
}

vec3 DE(vec3 pos) {
  float dist = 10000.0;
  float obj = 0.0;
  vec3 camera = vec3( 0., 0., cameraZ);
  vec3 staticPos = vec3(pos.xy, pos.z-cameraZ);

  float amountDim = 1.0-(0.25+0.25*sin(pos.z*0.05+TIME*PI*0.15));


  pos.y -= 10.0*_pulse(staticPos.z*0.1, (1.0-undulate_up)*10.0, 4.0)*sqrt(undulate_up)*amountDim;
  pos.y += 10.0*_pulse(staticPos.z*0.1, (1.0-undulate_down)*10.0, 4.0)*sqrt(undulate_down)*amountDim;
  pos.x -= 10.0*_pulse(staticPos.z*0.1, (1.0-undulate_right)*10.0, 4.0)*sqrt(undulate_right)*amountDim;
  pos.x += 10.0*_pulse(staticPos.z*0.1, (1.0-undulate_left)*10.0, 4.0)*sqrt(undulate_left)*amountDim;

  //Corridor
  vec3 corridorPos = pos;
  corridorPos.xy = _rotate(corridorPos.xy, (1.0-flatten)*mod(corridorPos.z*1.5*PI/(PI*10.0),(PI*10.0)));
  float corridor = 15.0 + diameter*5.0 - abs(corridorPos.y);

  corridor -= mix(0.0, (0.5+0.2*sin(pos.z*0.05+TIME*PI*0.15))*14.0, undulating);

  dist = min(corridor, dist);

  // //COLUMNS!
  vec3 columnPos = pos;

  float columns = 2000.0;
  vec3 columnPos2 = pos;

  if (dot_field>0.5) {
  	// columnPos2.z += TIME*10.0;
    // columnPos2.xy = _toPolarTrue(columnPos2.xy);
    columnPos2 = opRep(columnPos2, vec3(4.0-2.0*cos(TIME*0.12+syn_Time*0.015),4-2.0*sin(TIME*0.12+syn_Time*0.0167),10.0));
    columns = sdSphere(columnPos2, 0.1+syn_OnBeat*0.1*auto_groove);
    // columns = mix(1000, columns, columns_on);
  } else {
    columnPos2 = rotateX(columnPos2, PI/2);
    float midHigh = pow(syn_MidHighLevel, 1.5)*auto_groove;
    columnPos2 = opRep(columnPos2, vec3(5.0,20.0,20.0));
    columns = sdCylinder(columnPos2+vec3(midHigh*0.5,0.0,0.0)*amountDim*sin(staticPos.z*0.05+syn_BassTime*1.6), vec3(0.1+midHigh*0.05));
    // columns = mix(1000, columns, columns_on);
  }
    // dist = smin(dist, columns, 5.0);
  // } else {
  //   columns = mix(1000, columns, columns_on);
    // columns = mix(1.0, columns, columns_on);
    dist = mix(smin(dist, columns, 2.0), dist, 1.0-max(beams_on, dot_field));



  // }

  ////Sphere
  // vec3 sphereLightPos = staticPos + vec3(sin(TIME),cos(TIME),-5.0);

  // float sphereLight = sdSphere(sphereLightPos, 0.5+syn_HighHits);
  // dist = smin(dist, sphereLight, 3.0);


  //CUTS!
  //spherePos = opRep(spherePos, vec3(1.0,1.0,1.0));
  //spherePos += vec3(sin(TIME), cos(TIME), 0.0);
  // float sphere = sdTriPrism(spherePos, vec2(1.0));
  // dist = min(corridor, sphere);

  obj = clamp(1.0-columns,0.0,1.0);
  
  // dist = max(dist, -sdSphere(staticPos-vec3(0.0,0.0,0.0), 4.0));

  float glow = 1/columns;

  return vec3(dist, obj, glow);
}

#define FIELD 28.0
#define ITERATION 12
#define CHANNEL bvec3(true,true,true)
#define PI4 0.7853981633974483
#define TONE vec3(0.299,0.587,0.114)

// Enhanced swirly displacement with rotation
float swirlyDisplacement(vec3 p, float t)
{
  vec3 pos = p * 1.0;
  float result = 0.0;
  float amplitude = 2.0;
  
  for(int i = 0; i < 4; i++) {
    float fi = float(i);
    float freq = 1.0 + fi * 0.5;
    float timeOffset = fi * 0.4 + t * (0.3 + fi * 0.1);
    float rotAngle = timeOffset + fi * 0.8;
    
    // Rotate the XY coordinates to create swirl
    pos.xy = -_rotate(pos.xy, result);
    
    result += sin(pos.x * freq + timeOffset) * cos(pos.y * freq * 1.2 + timeOffset * 0.7) * amplitude;
    result += cos((length(pos.xy+pos.z)) * freq + timeOffset);
    
    pos *= 1.15;
    amplitude *= 0.35;
  }
  
  return result * 0.15;
}

// Texture bump mapping. Four tri-planar lookups, or 12 texture lookups in total.
vec3 doActualBumpMap(in vec3 p, in vec3 nor, float bumpfactor){
   
    // const float eps = 0.001;
    // vec3 grad = vec3( getGrey(tex3D(tex, vec3(p.x-eps, p.y, p.z), nor)),
    //                   getGrey(tex3D(tex, vec3(p.x, p.y-eps, p.z), nor)),
    //                   getGrey(tex3D(tex, vec3(p.x, p.y, p.z-eps), nor)));
    
    // grad = (grad - getGrey(tex3D(tex,  p , nor)))/eps; 
            
    // grad -= nor*dot(nor, grad);          
                      
    return normalize( nor - vec3(swirlyDisplacement(p*2.0+vec3(0.0,-3.0, 0.0),TIME*0.17))*texture_on);
    // return vec3(0.0);
  
}

float bumpmap(vec2 uv)
{
  return sin(uv.x*100.0+uv.y*500.0);
    // float b1 = bumpMapParams1.x*(1.0 - texture(bump_texture, (uv)*bumpMapParams1.y - vec2(syn_HighTime*0.5,0.0)).x);
    // float b2 = bumpMapParams2.x*(1.0 - texture(bump_texture, (uv)*bumpMapParams2.x - vec2(syn_HighTime*0.5,0.0)).x);
    // return b1+b2;
}

vec3 doBumpMap(vec2 uv, vec3 nor, float bumpfactor)
{
   
    const float eps = 0.001;
    float ref = bumpmap(uv); 
    
    vec3 grad = vec3(bumpmap(vec2(uv.x-eps, uv.y))-ref, 0.0, bumpmap(vec2(uv.x, uv.y-eps))-ref); 
             
    grad -= nor*dot(nor, grad);          
                      
    return normalize( nor + grad*bumpfactor );
}
vec3 tex3D( sampler2D tex, in vec3 p, in vec3 n ){
    n = max(abs(n), 0.001); // n = max((abs(n) - 0.2)*7., 0.001); // n = max(abs(n), 0.001), etc.
    n /= (n.x + n.y + n.z); 
    vec3 modPos = mod(p, 2.0);
    if (modPos.x > 1.0){
        p.x = 1.0-p.x;
    }
    if (modPos.y > 1.0){
        p.y = 1.0-p.y;
    }
    if (modPos.z > 1.0){
        p.z = 1.0-p.z;
    }
    return (_textureMedia(p.yz)*n.x + _textureMedia(p.zx)*n.y + _textureMedia(p.xy)*n.z).xyz;
}


vec3 gradient(vec3 p, float t) {
      vec2 e = vec2(0., t);

      return normalize( 
        vec3(
          DE(p+e.yxx).x - DE(p-e.yxx).x,
          DE(p+e.xyx).x - DE(p-e.xyx).x,
          DE(p+e.xxy).x - DE(p-e.xxy).x
        )
      );
    }

float atan2(float x, float y){
  if(x>0.0)return atan(y/x);
  if(x<0.0&& y>=0.0)return atan(y/x)+PI;
  if(y<0.0&&x<0.0)return atan(y/x)-PI;
  if(y>0.0&&x==0.0)return PI/2.0;
  if(y<0.0&& x==0.0)return -PI/2.0;
  return 0.0;
}

vec3 raycast() {
  
  vec3 camera = vec3( 0., 0., cameraZ);

// int AA = 1;
vec3 tot = vec3(0.0);

// for( int m=0; m<AA; m++ )
// for( int nm=0; nm<AA; nm++ )
    // {
    // vec2 o = vec2(float(m),float(nm)) / float(AA) - 0.5;
    // o /= RENDERSIZE.y;


    vec2 screenPos = -1.0 + 2.0 * _uv;
    screenPos.x *= RENDERSIZE.x / RENDERSIZE.y;
    // screenPos = screenPos + o;

    vec2 n = vec2(_rand(_uvc+fract(TIME))) - 0.5;

    // Original fisheye projection (commented out):
    // float x = screenPos.x;
    // float y = screenPos.y;
    // float z = (length(vec3(0.65*FOV))-sqrt(abs(x)*abs(x)+ abs(y)*abs(y)));
    // vec3 normb = normalize(vec3(x,y,z));
    // vec3 ray = normb;
    
    // Standard raymarching projection:
    vec3 ray = normalize(vec3(screenPos, FOV+jump_forward*0.04));
    // vec3 ray = normalize(vec3(screenPos, 0.75));
    // ray = rotateX(ray, TIME);
    ray = rotateX(ray, sin(script_time*PI*0.05)*0.05);
    ray = rotateY(ray, sin(script_time*PI*0.12)*0.05);
    ray = rotateZ(ray, -(TIME*0.1+syn_BassTime*0.065)*rotating - manual_rotate*PI);

    // raycasting parameter 
    float t  = 0.;
    vec3 pos;
    int iter = 0;
    bool hit = false;
    vec3 dist;
    float glow = 0.0;
    float minDist = 0.01;

    // ray stepping 
    for(int i = 0; i < MAX_ITER; i++) {
      pos = camera + ray * t;
      dist = DE(pos);
      glow += dist.z;

      if (abs(dist.x) < minDist) {
        hit = true;
        break;
      }
                
      t += dist.x*0.75;//step_size
      iter ++;

    }

    float obj = dist.y;
    vec3 norm = gradient(pos, 0.001);
    vec2 uv = _rotate(pos.xy, pos.z*2*PI/30.0);

    vec3 bump = doBumpMap(vec2(uv.x*0.01, pos.z*0.01), norm, 3.0);
    bump = mix(bump, vec3(0.0), clamp(obj,0.0,1.0))*sin(TIME*0.25);
    bump = mix(vec3(0.0), sign(spiral_ridges)*bump, abs(spiral_ridges));

    norm = doActualBumpMap(pos*0.05, norm, 0.1);

    vec3 topLightPos = -ray + vec3(0.0,-1.0,4.0);
    float topLight = clamp(dot(normalize(norm+bump), topLightPos), 0.0, 1.0);

    vec3 botLightPos = -ray + vec3(sin(TIME),cos(TIME),2.0+sin(TIME));
    float botLight = clamp(dot(normalize(norm+bump), botLightPos), 0.0, 1.0);

    float generalLight = clamp(dot(normalize(norm+bump), -ray), 0.0, 1.0);

      // float generalLight = clamp(dot(normalize(norm+bump), -ray), 0.0, 1.0);


    vec3 lp = camera + vec3(0.0,0.0,0.5+0.5*sin(script_time*PI*0.25)*200.0); // Light position - Back from the screen.
    // vec3 lp = camera; // Light position - Back from the screen.

    vec3 ld = lp - pos;
    float lDist = max(length(ld), 0.001);
    ld /= lDist;

    float spec = pow(max(dot(reflect(-ld, normalize(norm+bump)), -ray), 0.), 24.); 

    float ambientOcclusion = 1. -  float(iter) / float(MAX_ITER);
    
    vec3 rmCol = vec3(0.);

    vec3 lightCol = vec3(0.1,0.0,0.0);
    // lightCol = cross(lightCol, pos);
    // lightCol = vec3(1.0);

    // Optimized: Use mix instead of branch
    float react_factor = step(0.5, lights_react);
    topLight *= mix(1.0, syn_HighHits, react_factor);
    botLight *= mix(1.0, syn_BassLevel, react_factor);

    vec3 columnsCol = vec3(0.0);
    vec3 cavernCol = vec3(0.0);

    vec3 surfaceCol = vec3(1.0);
    float colorfulMix = colorful+clamp(syn_MediaType,0.0,1.0);
    if (colorful>0.5){
      surfaceCol = _palette(dot(normalize(norm+bump), -ray), vec3(1.020, 0.520, 0.500), vec3(0.500, 0.500, 0.500), vec3(0.500, 0.240, 0.750), vec3(0.480, 0.090, 0.870));
    }
    if (syn_MediaType>0.5){
      surfaceCol = tex3D(syn_Media, pos*0.1+pos.z*0.01,norm)*2.0;
    }

    // vec3 rgb2 = vec3(0.0);
    // vec3 ojPos = pos*0.1;
    //  vec3 coolOrange = extra_colors*fourColMix(vec3(sin(ojPos.y*10.0+ojPos.z*10.0+TIME)*2.0,0.0,0.0), vec3(1.0,0.7,0.0), vec3(0.0,0.0,0.0), vec3(0.0,1.0,1.0), sin(ojPos.z+syn_CurvedTime*0.1)*norm.y*1.0+0.5*sin(sin(ojPos.z*30.0)*norm.y*20.0+TIME+syn_HighTime*0.3))*0.5;


    if (hit){
      columnsCol += lightCol*botLight;
      cavernCol += spec*vec3(1.0);

      rmCol = mix(vec3(0.0), columnsCol, clamp(obj,0.0,1.0));
      rmCol = mix(rmCol, cavernCol, clamp(obj, 1.0, 2.0)-1.0);
      vec3 chaserCol1 = mix(vec3(1.0,0.2,0.0), vec3(0.2,0.6,1.1), colorful);
      vec3 chaserCol2 = mix(vec3(1.0,0.05,0.0), vec3(0.2,0.9,1.0), colorful);
      if (light_chaser>0.5){
        rmCol += 1.0*generalLight*chaserCol1*_pulse(sin((pos.z-cameraZ)*0.0025), fract(script_time/5.5), 0.06*(1.0-0.5*syn_Intensity))*(1.0+0.2*syn_HighHits);
        rmCol += 1.0*generalLight*chaserCol2*_pulse(sin((pos.z-cameraZ+250.0)*0.0025), fract(script_time/5.5), 0.05*(1.0-0.5*syn_Intensity))*(1.0+0.2*syn_HighHits);

      }
      rmCol += botLight*surfaceCol;

      rmCol += spec*surfaceCol;
      rmCol *= pow(ambientOcclusion,0.1);

      // vec3 rgb, rgb2, rgbMix = vec3(0.0);
      // // rgb = sqrt(pow(_pulse(pos.y,1.0,0.95),0.75)*threeColMix(vec3(0.0,0.0,0.0), vec3(0.0,0.2, 0.7), vec3(0.0,1.5,0.8), clamp(iterDeep*3.0/200.0, 0.0,1.0)))*col1On;
      //  coolOrange += fourColMix(vec3(sin(ojPos.y*10.0+ojPos.z*10.0+TIME)*2.0,0.0,0.0), vec3(1.0,0.7,0.0), vec3(0.0,0.0,0.0), vec3(0.0,1.0,1.0), sin(ojPos.z+syn_CurvedTime*0.1)*norm.y*1.0+0.5*sin(sin(ojPos.z*30.0)*norm.y*20.0+TIME+syn_HighTime*0.3));
      //rgb *= (0.9+_pulse(sin((pos.x+pos.z*0.0)*0.25*PI), -1.0, 1.0));

      // coolOrange += _grad4(vec3(0.0,0.0,1.0), vec3(1.0,0.0,0.0), vec3(1.0,1.0,0.0), vec3(1.0,1.0,1.0), 0.5+0.5*sin(pos.y*0.1+pos.z*0.01+TIME*10.0))*1.0*_pulse(norm.z, 0.0, 0.15+0.3+0.4*sin(_pixelate(sin(pos.z)*10.0, 4.0)));



      //rgb += clamp(sin(pow(iterDeep*3.0/200.0,0.5)*20.0+TIME+tra.x*20.0), 0.0,1.0);
      // coolOrange += mix(rmCol, threeColMix(vec3(1.0,215.0/255.0,0.0), vec3(252.0,175.0,25.0)/255.0, vec3(1.3,1.0,0.0), 0.5+0.5*sin(syn_HighTime)), _nsin(pos.z));
      // float spatSel = _pulse(norm.x, 0.5*(0.5+0.5*sin(pos.z*0.1+syn_BassTime*0.3)), 0.2);
      // rgb += pulse_on*3.0*_grad4(_rgb3(304, 163,075), _rgb3(30, 10, 140), vec3(1.0,0.0,0.7), _rgb3(0.0,0.0,0.0), tra.z*sin(TIME)+spatSel)*(0.5+0.5*sin(pos.z+syn_BassTime*0.4));
      // rgbMix = rgb2*extra_colors;
      // rmCol += coolOrange*extra_colors;
      rmCol *= main_light;
      // color += rgbMix;
    }
    // color += rgb2;
    float fogAmount = 1.0 - exp( -t*0.005);
    vec3  fogColor  = vec3(0.3+syn_BassPresence*0.6,0.6,0.7);
    rmCol = mix(rmCol, fogColor, fogAmount*fog_col*(0.8+0.3*syn_BassPresence));

    rmCol += clamp(pow(glow*glow_amount*glow_amount,0.5)*0.1,0.0,1.0);
    tot += rmCol;
  // }
  // tot /= float(AA*AA);
  vec3 color = pow(tot, vec3(1.75));

  return color;


}

vec4 renderMain() {
  vec4 colOut = vec4(0.0);

  if (PASSINDEX == 0) {
    colOut = vec4(raycast(), 1.0);
  }
  return colOut;
}