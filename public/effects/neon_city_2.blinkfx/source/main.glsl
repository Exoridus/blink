#ifdef KODELIFE
const float
  density =.2
, motion_blur =.4
, height      =2.
;

const float
  reflection    =1.
, neon_hue      =5.
, cam_pan_x     =0.
, cam_pan_y     =0.
, lighting_mode =0.
//car_count     =2.
, tower_lights      =1.
, billboard_density =0.
;

const float
  path_amplitude =1.
, path_frequency =.33
;

const float
  wave_speed   =5.
, wave_start_z =-1e4
, wave_elapsed =1e4
;



#define syn_BassHits    (abs(sin(TIME*2.1)))
#define syn_MidHighHits (abs(sin(TIME*3.7)))
#define syn_HighHits    (abs(sin(TIME*5.3)))
#endif

const float
  TAU=2.*PI
, MISS=-1000.
, car_count=2.
;


float g_seed;

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
vec3 tanh_approx(vec3 x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

#ifdef KODELIFE
vec4 _loadMedia() {
  vec2
    p=2.*_uvc
  , sz=vec2(textureSize(syn_Media,0))
  ;
  p*=1.5;
  p.x*=sz.y/sz.x;
  p+=.5;
  p.y=1.-p.y;
  vec4 mcol=texture(syn_Media,p);
  return mcol;
}
#endif

// Gaussian blur
vec3 gb(sampler2D pp, ivec2 dir, ivec2 xy) {
  const float
    blurriness      =300.
  ;

  ivec2
    off
  ;
  vec3
    col=texelFetch(pp,xy,0).xyz
  ;

  float
    w
  , ws=1.
  , I
  ;

  for(int i=1;i<25;++i) {
    I=float(i);
    w=exp(-(I*I)/blurriness);
    off=dir*i;

    col+=w*(texelFetch(pp,xy-off,0).xyz+texelFetch(pp,xy+off,0).xyz);
    ws+=2.*w;
  }
  col/=ws;
  return col;
}


vec3 path() {
  vec3 p = vec3(path_x, height, z_pos);
  if (camera_mode < 0.5) {
    return p;
  }
  else if (camera_mode < 1.5) {
    p.y += .1;
    p.z *= 0.5;
    return p;
  }
  else if (camera_mode < 2.5) {
    p.x -= 0.3;
    p.x *= .01;
    p.x += 0.5;
    p.y -= 2.0;
    return p;
  }
}

vec3 dpath() {
  vec3 p = vec3(dpath_x, 0, 1);
  if (camera_mode < 0.5) {
    return p;
  }
  else if (camera_mode < 1.5) {
    p.y -= 0.5;
    p.z *= 0.5;
    return p;
  }
  else if (camera_mode < 2.5) {
    p.y += 0.5;
    return p;
  }
}

vec3 ddpath() {
  return vec3(ddpath_x, 0, 0);
}

float freq(float x) {
#ifdef KODELIFE
  return exp(-2.*fract(TIME+x));
#else
  return height_mul*(textureLod(syn_Spectrum, x, 0.0).y);
#endif
}

// License: Unknown, author: Unknown, found: don't remember
float hash(float co) {
  return fract(sin(co*12.9898) * 13758.5453);
}

// License: Unknown, author: 0b5vr, found: https://www.shadertoy.com/view/ss3SD8
float random(){
  float i = ++g_seed;
  return fract(sin((i)*114.514)*1919.810);
}

// License: Unknown, author: Unknown, found: don't remember
float hash(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233))) * 13758.5453);
}

vec3 uniform_lambert(vec3 X, vec3 Y, vec3 Z){
  float
    p=TAU*random()
  , cost=sqrt(random())
  , sint=sqrt(1.-cost*cost)
  ;
  return cos(p)*sint*X+sin(p)*sint*Y+cost*Z;
}

vec3 noisy_ray_dir(vec2 p, vec3 X, vec3 Y, vec3 Z) {
  p += 1.41/RENDERSIZE.y*(-1.+2.*vec2(random(),random()));
  return normalize(-p.x*X+p.y*Y+2.*Z);
}

float iray_box_(vec3 ro, vec3 ird, vec3 boxSize, out vec3 NZ)  {
  vec3
    n = ird*ro
  , k = abs(ird)*boxSize
  , t1 = -n - k
  , t2 = -n + k
  ;
  float
    tN = max( max( t1.x, t1.y ), t1.z )
  , tF = min( min( t2.x, t2.y ), t2.z )
  ;
  if( tN>tF || tF<0.0) return MISS;
  NZ = step(vec3(tN),t1)*-sign(ird);
  return tN;
}

float iray_box(vec3 ro, vec3 ird, vec3 boxSize, out vec3 NZ) {
  // Branchless
  vec3
    n = ro * ird
  , k = abs(ird) * boxSize
  , t1 = -n - k
  , t2 = -n + k
  ;

  float
    tN = max( max( t1.x, t1.y ), t1.z )
  , tF = min( min( t2.x, t2.y ), t2.z )
  ;

  float hit = step(tN, tF) * step(0.0, tF);
  NZ = step(vec3(tN), t1) * -sign(ird);
  return mix(MISS, tN, hit);
}


vec4 dpass0() {
  bool
    isr
  , x0
  , x1
  ;
  float
    j
  , n    =1.
  , d0
  , d1
  , d2
  , F
#ifdef KODELIFE
  , z_pos=.5*TIME
#endif
  , H0
  , H
  , bi
  , ti
  , zi   =0.
  , z
  , MX
  , A
  , xi
  ;

  vec2
    p =2.*_uvc
  , q =_uv
  , NN
  , CC
  , S
  ;

  g_seed=fract(hash(p)+float(FRAMECOUNT)/1337.0);
  vec3
    ro  =path()
  , Z   =normalize(dpath()+vec3(0,-.6,0))
  , X   =normalize(cross(Z,vec3(0,1,0)+2.*ddpath()))
  , Y   =cross(X,Z)
  , col =vec3(0)
  , P
  , G
  , PP
  , PN
  , IPN
  , NX
  , NY
  , NZ
  , R
  , L
  , pcol =texelFetch(pass0,ivec2(_xy),0).xyz
  , XZ
  , NEON
  ;

  vec4
    M
  , HH
  ;

  // Precompute car data once (outside the 110-step ray loop)
  const int MAX_CARS=8;
  vec3  car_pos[MAX_CARS];
  vec3  car_col[MAX_CARS];
  float car_dir[MAX_CARS];
  float car_fade[MAX_CARS];
  int   num_cars=0;
  for(int ci=0;ci<MAX_CARS;++ci) {
    if(float(ci)>=car_count) break;
    float cFB  =.1*TIME+float(ci)*0.37;
    float cFH0 =hash(floor(cFB)+float(ci)*17.3+123.4);
    float cFH1 =fract(8667.*cFH0);
    float cFD  =cFH1>.5?1.:-1.;
    float cFT  =fract(cFB);
    cFT=cFD>0.?cFT:1.-cFT;
    float cFO  =smoothstep(.6,.4,cFT);
    float cXpos=cFD>0.?.30:.70;
    car_pos[ci]=vec3(cXpos,1.,z_pos+mix(-4.,30.,cFT));
    car_col[ci]=cFO*(0.5+0.5*sin(cFH0*9.7+neon_hue+vec3(0.,2.1,4.2)));
    car_dir[ci]=cFD;
    car_fade[ci]=cFO;
    num_cars++;
  }

  PP=ro;
  PN=noisy_ray_dir(p+vec2(cam_pan_x,cam_pan_y),X,Y,Z);
  IPN=1./PN;
  for(j=0.;j<110.;++j) {
    NN=floor(PP.xz+.5);
    CC=PP.xz-NN;
    S=(sign(PN.xz)*.5-CC)*IPN.xz;
    MX=min(S.x,S.y)+1e-2;
    ti=(3.-PP.y)*IPN.y;
    bi=(-PP.y)*IPN.y;
    H0=hash(NN);
    HH=fract(vec4(5711,6977,7577,8677)*H0);
    H=.5+.5*H0;
    float wave_front=wave_start_z+wave_speed*wave_elapsed;
    float wave_dist=abs(NN.y-wave_front);
    xi=iray_box(PP-vec3(NN.x,H-.02,NN.y),IPN,vec3(.1+.1*HH.x,H,.2+.1*HH.y),XZ);
    z=1e3;
    if(ti>0.)           { z=ti; NZ=vec3(0,-1,0);}
    if(bi>0.&&bi<z)     { z=bi; NZ=vec3(0, 1,0);}
    if(xi>0.&&xi<z)     { z=xi; NZ=XZ;  }

    NX = NZ.yzx;
    NY = NZ.zxy;

    if(MX<z) {
      // Step to next cell
      PP=PP+PN*MX;
      continue;
    }

    if(zi==0.) {
      zi=z;
    }


    P=PP+PN*z;
    NEON=sin((20.*TAU)*P);
    for(int ci=0;ci<MAX_CARS;++ci) {
      if(ci>=num_cars) break;
      vec3  cFP =car_pos[ci];
      vec3  cFL =car_col[ci];
      float cFD =car_dir[ci];
      float cFO =car_fade[ci];
      G=P;
      G.xz-=cFP.xz-vec2(-.1*cFD,0.);
      d0=dot(G,G);
      col+=(A*5e-3/max(d0,5e-4))*cFL;
      G=P;
      G.xz-=vec2(cFP.x+.1*cFD,.5);
      float cd1=smoothstep(2.,0.,cFD*(cFP.z-P.z));
      col+=(A*1.5e-2*cFO*(cFD*P.z<cFD*cFP.z?1.:0.)*cd1/max(length(G.xy),1e-3))
          *(.3*smoothstep(2.,0.,cFP.z-P.z)+cFL);
    }

    G=P;
    G.xz-=.5;
    G.z-=floor(G.z+.5);

    G.x=G.x-floor(G.x+.5);
    d1=min(abs(G.x)-.2,abs(G.z)-.1);
    d2=min(abs(d1),max(abs(G.x),G.z))-.01;

    if(z==xi) {
      vec2 bsz=vec2(.1+.1*HH.x,.2+.1*HH.y);
      vec2 fedge=bsz-abs(P.xz-NN);
      float dist=abs(NZ.y)>.5
        ? max(0.,min(fedge.x,fedge.y))
        : max(0.,2.*H-P.y);
      float core=exp(-dist*120.);
      float halo=exp(-dist*35.);
      vec3 neon_col=1.+sin(P.z+P.y+TAU*(HH.z+HH.w)+vec3(neon_hue,0.,neon_hue-3.));
      col+=A*(tower_lights*tower_lights*tower_lights)*(core*4.*mix(vec3(1.),neon_col,.5)+halo*.6*neon_col);

      if(billboard_density>0.&&texture(syn_Media,vec2(.5)).w>.01) {
        float bh=hash(NN+vec2(999.1,777.3));
        bool widestFace=(abs(NZ.x)>.5&&bsz.y>=bsz.x)||(abs(NZ.z)>.5&&bsz.x>bsz.y);
        if(bh>1.-billboard_density&&widestFace) {
          vec2 fuv;
          if(abs(NZ.x)>.5)
            fuv=vec2((P.z-NN.y)/(2.*bsz.y)+.5,P.y/(2.*H));
          else
            fuv=vec2((P.x-NN.x)/(2.*bsz.x)+.5,P.y/(2.*H));
          // Billboard sized to match media aspect ratio
          vec2 msz=vec2(textureSize(syn_Media,0));
          float mAR=msz.x/msz.y;
          float fHW=abs(NZ.x)>.5?bsz.y:bsz.x; // face half-width in world units
          float uvH=fHW/(mAR*H);               // billboard height in fuv.y units
          float uvBot=.55-uvH*.5;              // center billboard at 55% up face
          vec2 buv=vec2(fuv.x,(fuv.y-uvBot)/uvH);
          if(buv.x>=0.&&buv.x<=1.&&buv.y>=0.&&buv.y<=1.) {
            col+=A*texture(syn_Media,buv).rgb*media_multiplier;
            PN=noisy_ray_dir(p+vec2(cam_pan_x,cam_pan_y),X,Y,Z);
            PP=ro+PN*zi;
            IPN=1./PN;
            A=1.;
            ++n;
            continue;
          }
        }
      }
    }

    isr=z==xi&&(HH.z>0.5?NEON.x*NEON.z>0.0:NEON.y>0.);
    x0=z==ti||A<1e-1||length(P-ro)>20.;
    float lit_frac;
    if(lighting_mode<.5) {
      lit_frac=freq(HH.x+HH.y);
    } else if (lighting_mode<1.5) {
      float band=floor(HH.z*4.);
      lit_frac=height_mul*(band<1. ? syn_BassHits
             : band<2.             ? syn_MidHits
             : band<3.             ? syn_MidHighHits
             :                       syn_HighHits);
    } else if (lighting_mode<2.5) {
      float band=floor(HH.z*4.);
      lit_frac=height_mul*(band<1. ? syn_BassPresence
             : band<2.             ? syn_MidPresence
             : band<3.             ? syn_MidHighPresence
             :                       syn_HighPresence);
    } else {
      float band=floor(HH.z*4.);
      lit_frac=height_mul*(band<1. ? syn_BassPresence
             : band<2.             ? syn_MidPresence
             : band<3.             ? syn_MidHighPresence
             :                       syn_HighPresence);
    }
    lit_frac+=2.*exp(-wave_elapsed*.4)*exp(-wave_dist*.7);
    x1=HH.w<density&&isr&&(P.y<(2.*H-0.02)*min(lit_frac,0.99));
    if(x0||x1) {
      if(x1) {
        col+=(A*(1.-dot(NZ,PN)))*(1.+sin(P.z+P.y+TAU*(HH.z+HH.w)+vec3(neon_hue,0.,neon_hue-3.)));
      }
      // Reset current pos and ray
      PN=noisy_ray_dir(p+vec2(cam_pan_x,cam_pan_y),X,Y,Z);
      PP=ro+PN*zi;
      IPN=1./PN;
      A=1.;
      ++n;
      continue;
    }

    F=1.+dot(PN,NZ);
    F*=F;
    F=mix(0.,reflection,F);
    R=reflect(PN,NZ);
    L=uniform_lambert(NX,NY,NZ);

    if(isr) {
      PN=R;
      H0=F;
    } else {
      PN=L;
      H0=d2<0.
        ? .9
        : d1<0.
          ? .05
          : .3
      ;
    }
    A*=H0;

    IPN=1./PN;

    PP=P+1e-2*NZ;
  }

  col/=n;
  col=mix(col,pcol,motion_blur*0.98);
  return vec4(col,1);
}


vec4 dpass1() {
  return vec4(gb(pass0,ivec2(1,0),ivec2(_xy)),1);
}

vec4 dpass2() {
  ivec2
    xy=ivec2(_xy)
  ;
  vec3
    col=gb(pass1,ivec2(0,1),xy)
  , pcol=texelFetch(pass2,xy,0).xyz
  ;
  return vec4(mix(col,pcol,retain_glow),1);
}


vec4 dpass3() {
  const vec3
    lum_weights_srgb   = vec3(0.299, 0.587, 0.114)
  ;

  vec3
    col
  , bcol
  , dcol
  ;

  vec4
    mcol
  ;

  float
    t
  ;

  col=texelFetch(pass0,ivec2(_xy),0).xyz;
  bcol=texelFetch(pass2,ivec2(_xy),0).xyz;
  col-=.01;
  col+=neon_glow*bcol;
  mcol=_loadMedia();
  t=smoothstep(.5,.25,dot(lum_weights_srgb,mcol.xyz));
  dcol=glass_effect*sqrt(bcol)+.005;
  col=mix(col,dcol,mcol.w*media_transparency);
  col=max(col,0.);
  col=tanh_approx(col);
  col=sqrt(col);
  col=mix(col,mcol.xyz,media_multiplier*media_transparency*mcol.w*(1.-t));
  return vec4(col,1);

}

vec4 renderMain() {
  switch(PASSINDEX) {
  case 0:
    return dpass0();
  case 1:
    return dpass1();
  case 2:
    return dpass2();
  default:
    return dpass3();
  }
}
