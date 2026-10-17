
#define NUM_PARTICLES 40.
#define MAX_ACC 3.
#define MAX_VEL 1.5
#define RESIST .2

float colRegime = mod(color_palette, 10);



vec2 RES = RENDERSIZE.xy;
vec2 hash(float n) { return fract(sin(vec2(n,n*7.))*43758.5); }
vec4 getParticle(float i) { return texelFetch(firstBuffer, ivec2(i,0),0);}

vec4 firstPass() { 
    vec2 fragCoord = _xy;  
    if( fragCoord.x > NUM_PARTICLES) discard;
    vec2  w, vel, acc, sumF, res = vec2(1200.0, 720.0) / 720.0;
    float d, a, v, dt = .03, id = floor(fragCoord.x);  
    vec4 finalCol;
        
    if (FRAMECOUNT < 5)   
        finalCol = vec4(.1+.8*hash(id)*res,0,0);         
    else { 

    vec4 particle = getParticle(id);
        
// ====== Forces
        
    // Borders action
    sumF = .8*(1./abs(particle.xy) - 1./abs(res-particle.xy));         
    // // Bass action        
    //     w = particle.xy;
    //     // sumF += pow(normalize(w),vec2(4.0))*pop/dot(w,w);

    // // Move left to right
  // w = particle.xy - vec2(0.5, 0.5)*res;
  // sumF += vec2((-1.0+mod(id,2)*2.0)*syn_HighHits,0.0)*3.0;


    // float bassForce = syn_BassLevel*3.0*sin(TIME*1000.0);

    // sumF += vec2(-0.5+particle.x,-bassForce*2.0*(-0.5+particle.y));

    // sumF += _rotate(vec2(1.0, 0.0),floor(syn_BPMTwitcher*0.25))*syn_HighHits*3.0;


    // if(floor(mod(id, 3))==0){
    //     particle.xy = mix(particle.xy, hash(id+syn_BeatTime)*vec2(1.6,1.0), floor(syn_OnBeat*syn_HighHits*1.3));
    // }

    // Calculate repulsion force with other particles
    for(float i=0.;i<NUM_PARTICLES;i++) {
        if(i != id) {
            d = length(w = particle.xy - getParticle(i).xy);
            if (calm_collect > 0.5){
                d *= 10.0;
            }
            sumF -= d > 0. ? w*(6.3+log(d*d*(0.022-syn_HighHits*0.011*syn_Presence)))/exp(d*d*2.4)/d  :  .01*hash(id); // if same pos : ramdom force
            // sumF -= d > 0. ? w*(6.3+log(d*d*0.02))/exp(d*d*2.4)/d  :  .01*hash(id); // if same pos : ramdom force
        }
    }

    //Rotational Force
    vec2 polarPos = _toPolarTrue(2.0*particle.xy-1.0);

    vec2 rotoVec = _rotate(mix(vec2(0.0,-1.0), vec2(0.0,1.0), sin(syn_Time*0.05)*0.5+0.5), -polarPos.y*2*PI);

    sumF += polarPos.x*rotoVec*syn_Presence*2.0;

    w = particle.xy - vec2(0.5, 0.5)*res;

    float twitchForce = fract(1.0-syn_BPMTwitcher);
    if (twitchForceSupplier > 0.5){
        twitchForce = syn_BPMSin2;
    }
    twitchForce *= 1.0;

    float twitchMod = twitchForce*(-1.0+mod(id,2)*2.0);
    if (twitcherType > 0.5){
        twitchMod = twitchForce*(-1.0+mod(id,3));
    } else if (twitcherType > 1.5){
        twitchMod = twitchForce*(-1.0+mod(id,5)*0.5);
    }

    sumF += vec2(twitchMod,0.0)*10.0;

    if (frantic>0.5) sumF += vec2(-0.5+_rand(particle.xy*100.0+TIME),-0.5+_rand(particle.xy*133.0+TIME))*10.0;

    sumF *= (1.0+excitement);

    sumF -= (1/pow(distance(particle.xy, run_away),2.0))*fear_on*(run_away-particle.xy);

    // Friction    
    sumF -= particle.zw*RESIST/dt;

// - Dynamic calculation ---------------------     
        
    // Calculate acceleration A = (1/m * sumF) [cool m=1. here!]
    a = length(acc = sumF); 
    acc *= a>MAX_ACC ? MAX_ACC/a : 1.; // limit acceleration
    // Calculate speed
    v = length(vel = particle.zw + acc*dt);
    vel *= v>MAX_VEL ? MAX_VEL/v : 1.; // limit velocity
        
    vel -= vec2(-0.888889+particle.x, -0.5+particle.y)*2.0*energize_center;


// - Save ------------------------------------   
        
    // Save position and velocity of particle (xy = position, zw = velocity) 
        finalCol = vec4(particle.xy + vel*dt, vel);
        
    }
    return finalCol;
}


// Draw a particle
float signedDist(float i, vec2 p, float rot, float scale) {
    float ds, c = cos(rot), s = sin(rot);
    // Rotate ad rescale
    p *= scale;

    p.y = abs(p.y)+.13*p.x;

    // scale *= 

    float shape = max(length(p)-0.3, -ds)/scale;

    return shape;    
}

vec4 cell(vec2 fragCoord, vec2 pixel)
{
    vec2 uv = (fragCoord-pixel) / RENDERSIZE.xy;
    return texture(secondBuffer, uv);
}

vec4 secondPass() {
    vec2 p = 1./RENDERSIZE.xy;
    vec2 fragCoord = _xy;
    float d, m = 1e6;
    float halo = 0;
    vec4 c, ct, particle;
    vec3 fragColor;

    for(float i=0.;i<NUM_PARTICLES;i++) {     
        // Get particle in Buf A (xy = position, zw = velocity) 
        //    from iq shader Brick [https://www.shadertoy.com/view/MddGzf]
        particle = getParticle(i);
        // Draw particle according to its direction
        d = signedDist(i, particle.xy-fragCoord.xy*p.y, atan(particle.w,particle.z), 50-(pow(size,0.2)+color_pop)*40.0);
        // min use to draw particle
        m = min(m, d);
        // Background color sum based on particle velocity (blue => red)
        // c = mix(vec4(0,0,1,1), vec4(1,0,0,1), length(particle.zw)/MAX_VEL);
        // Halo - simple version: c*smoothstep(.5,0.,d);
        halo += length(particle.zw)/MAX_VEL*(smoothstep(0.25,0.25-0.2,d)-smoothstep(0.25-0.2,0.25-0.2*2,d)); 
    }
    // Mix particle color (white) and Halo
    fragColor = mix(vec3(1),vec3(0.0), smoothstep(0.,p.y*1.2, m));

    float lookupDist = 1.0+(1.0-syn_FadeInOut)*5.0;

    float l = cell(_xy, vec2(-1,0)*lookupDist).r; // left cell
    float r = cell(_xy, vec2(1,0)*lookupDist).r; // rigt cell
    float t = cell(_xy, vec2(0,1)*lookupDist).r; // top cell
    float b = cell(_xy, vec2(0,-1)*lookupDist).r; // bottom cell

    float minnedCol = min(min(min(l, r),t),b);
    minnedCol -= _rand(_uvc*1000.0+TIME*10000.0)*0.1;


    // fragColor = mix(fragColor, texture(secondBuffer, _uv), 0.6);
    fragColor = vec3(minnedCol)+fragColor;
    return vec4(clamp(fragColor,0.0,8.0),halo);
}

vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d )
{
    return a + b*cos( 6.28318*(c*t+d) );
}

  // finalCol *= palette(fract(redAmt + grnAmt + bluAmt), vec3(0.420, 0.500, 0.500), vec3(0.500, 0.500, 0.500), vec3(0.600, 0.250, 1.200), vec3(0.500, 0.450, 0.500));


vec3 colorPaletteChooser(float colReg, float var){
  vec3 paletteCol = vec3(0.5);
  if (colReg < 1.0){
    paletteCol = palette(var, vec3(0.500, 0.500, 0.520), vec3(0.500, 0.500, 0.500), vec3(0.780, 0.765, 0.750), vec3(0.360, 0.570, 0.680));
  } else if (colReg < 2.0){
    paletteCol = palette(var, vec3(0.500, 0.580, 0.500), vec3(0.190, 0.460, 0.500), vec3(0.760, 0.740, 0.580), vec3(1.000, 0.300, 0.490));
  } else if (colReg < 3.0){
    paletteCol = palette(1.0-var,vec3(0.500, 0.940, 0.900), vec3(0.600, 0.640, 0.350), vec3(0.680, 1.020, 0.405), vec3(0.380, 0.440, 0.095));
  } else if (colReg < 4.0){
    paletteCol = palette(var,vec3(0.500, 0.500, 0.500), vec3(0.500, 0.500, 0.500), vec3(0.500, 0.825, 0.750), vec3(0.500, 0.500, 0.500));
  } else if (colReg < 5.0){
    paletteCol = palette(1.0-var,vec3(0.000, 0.580, 0.453), vec3(0.848, 0.703, 0.110), vec3(0.700, 0.175, 0.542), vec3(0.000, 0.182, 0.915));
  } else if (colReg < 6.0){
    paletteCol = palette(var,vec3(0.129, 0.359, 0.072), vec3(0.933, 0.561, 0.616), vec3(0.334, 1.013, 0.882), vec3(0.597, 0.050, 0.885));
  } else if (colReg < 7.0){
    paletteCol = palette(var,  vec3(-0.060, -0.340, 0.100), vec3(0.940, 0.840, 0.713), vec3(0.600, 0.735, 0.7191), vec3(0.500, 0.260, 0.335));
  } else if (colReg < 8.0){
    paletteCol = palette(var,  vec3(-0.060, -0.340, 0.100), vec3(0.940, 0.840, 0.713), vec3(0.600, 0.735, 0.2191), vec3(0.500, 0.260, 0.335));
  } else if (colReg < 9.0){
    paletteCol = palette(var,vec3(0.000, 0.040, 0.073), vec3(0.000, 0.530, 0.420), vec3(0.485, 0.930, 0.931), vec3(0.400, 0.599, 0.520));
  } else if (colReg < 10.0){
    paletteCol = palette(1.0-var,vec3(1.040, 0.180, 0.260), vec3(0.053, 0.775, 0.330), vec3(0.142, 0.523, 0.800), vec3(0.242, 0.887, 0.000));
  }
  return paletteCol;
}

vec4 renderMain () {
  if (PASSINDEX == 0.0){
    return firstPass();
  }
  else if (PASSINDEX == 1.0){
    return secondPass();
  }
  else if (PASSINDEX == 2.0){
    vec4 data = texture(secondBuffer, _uv);
    float colSel = data.r/8.0;
    if (_isMediaActive()){
        colSel = mix(colSel, 1.0-colSel, dot(_loadMedia().rgb,vec3(1.0))/3.0);
    }

    if (invert_col >0.5){
        colSel = 1.0-colSel;
    }

    float halo = data.a/10.0;
    vec3 palCol = palette(colSel, vec3(0.500, 0.500, 0.520), vec3(0.500, 0.500, 0.500), vec3(0.780, 0.765, 0.750), vec3(0.360, 0.570, 0.680));
    palCol = colorPaletteChooser(colRegime, colSel);
    palCol *= pow(colSel,0.1); //brightness
    
    return vec4(palCol+halo, 1.0);

  }
}
