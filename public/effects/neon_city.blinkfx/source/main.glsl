#ifdef KODELIFE
const float
  glass_blend       =.5
, camera_height     =2.
, media_intensity   =1.
, media_opacity     =.7
, motion_blur       =.4
, neon_glow         =.5
, tower_threshold   =.2
, retain_glow       =.8
;

const vec2
  reflection    =vec2(.0625,.75)
, media_mask    =vec2(.25,.5)
, neon_color    =vec2(2,3)
, path_wave     =vec2(1,.33);
;
#endif

const float
  TAU=2.*PI
, MISS=-1000.
;


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


vec3 path(float speed) {
  return vec3(.5+path_wave.x*sin(path_wave.y*speed),camera_height,speed);
}

vec3 dpath(float speed) {
  return vec3(path_wave.x*path_wave.y*cos(path_wave.y*speed),0,1);
}

vec3 ddpath(float speed) {
  return vec3(-path_wave.x*path_wave.y*path_wave.y*sin(path_wave.y*speed),0,0);
}

float freq(float x) {
#ifdef KODELIFE
  return exp(-2.*fract(TIME+x));
#else
  return audio_reactivity*(textureLod(syn_Spectrum, x, 0.0).y-audio_threshold)/(1.0-audio_threshold);
#endif
}

// License: Unknown, author: Unknown, found: don't remember
float hash(float co) {
  return fract(sin(co*12.9898) * 13758.5453);
}

// License: Unknown, author: Unknown, found: don't remember
float hash(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233))) * 13758.5453);
}

vec3 uniform_lambert(float h0, vec3 X, vec3 Y, vec3 Z){
  float
  , h1=fract(8887.*h0)
  , p=TAU*h0
  , cost=sqrt(h1)
  , sint=sqrt(1.-cost*cost)
  ;
  return cos(p)*sint*X+sin(p)*sint*Y+cost*Z;
}

vec3 noisy_ray_dir(float h0,vec2 p, vec3 X, vec3 Y, vec3 Z) {
  float
    h1=fract(8887.*h0)
  ;
  p += 1.41/RENDERSIZE.y*(-1.+2.*vec2(h0,h1));
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
  , FB   =.1*TIME
  , FH0  =hash(floor(FB)+123.4)
  , FH1  =fract(8667.*FH0)
  , FO
  , FD   =FH1>.5?1.:-1.
  , FT   =fract(FB)
#ifdef KODELIFE
  , speed=.5*TIME
#endif
  , H0
  , H
  , R0   =0.
  , bi
  , ti
  , zi   =0.
  , z
  , MX
  , A
  , xi
  , seed
  ;
  FT=FD>0.?FT:1.-FT;
  FO=smoothstep(.6,.4,FT);

  vec2
    p =2.*_uvc
  , q =_uv
  , NN
  , CC
  , S
  ;

  seed=fract(hash(p)+float(FRAMECOUNT)/1337.0);
  vec3
    ro  =path(speed)
  , Z   =normalize(dpath(speed)+vec3(0,-.6,0))
  , X   =normalize(cross(Z,vec3(0,1,0)+2.*ddpath(speed)))
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
  , FL
  , FP   =vec3(.5,1.,speed+mix(-4.,30.,FT))
  , XZ
  , NEON
  ;

  vec4
    M
  , HH
  ;

  FL=FO*mix(vec3(.1,.1,1)*.5,vec3(1,.1,.5),step(hash(floor(TIME*19.)),.5));

  PP=ro;
  PN=noisy_ray_dir(R0,p,X,Y,Z);
  IPN=1./PN;
  for(j=0.;j<110.;++j) {
    ++seed;
    R0=hash(seed);
    NN=floor(PP.xz+.5);
    CC=PP.xz-NN;
    S=(sign(PN.xz)*.5-CC)*IPN.xz;
    MX=min(S.x,S.y)+1e-2;
    ti=(3.-PP.y)*IPN.y;
    bi=(-PP.y)*IPN.y;
    H0=hash(NN);
    HH=fract(vec4(5711,6977,7577,8677)*H0);
    H=.5+.5*H0;
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
    G=P;
    G.xz-=FP.xz-vec2(-.1*FD,0);
    d0=dot(G,G);
    col+=(A*5e-3/max(d0,5e-4))*FL;

    G=P;
    G.xz-=vec2(.5+.1*FD,.5);
    d1=smoothstep(2.,0.,FD*(FP.z-P.z));
    col+=
       (A*1.5e-2*FO*(FD*P.z<FD*FP.z?1.:0.)*d1/max(length(G.xy),1e-3))
      *(.3*smoothstep(2.,0.,FP.z-P.z)+vec3(1,0.1,.25))
      ;

    G=P;
    G.xz-=.5;
    G.z-=floor(G.z+.5);

    G.x=G.x-floor(G.x+.5);
    d1=min(abs(G.x)-.2,abs(G.z)-.1);
    d2=min(abs(d1),max(abs(G.x),G.z))-.01;

    isr=z==xi&&(HH.z>0.5?NEON.x*NEON.z>0.0:NEON.y>0.);
    x0=z==ti||A<1e-1||length(P-ro)>20.;
    x1=HH.w<tower_threshold&&isr&&(P.y<H*2.*freq(HH.x+HH.y));
    if(x0||x1) {
      if(x1) {
        col+=(A*(1.-dot(NZ,PN)))*(1.+sin(P.z+P.y+TAU*(HH.z+HH.w)+vec3(neon_color.x,0,neon_color.y)));
      }
      // Reset current pos and ray
      PN=noisy_ray_dir(R0,p,X,Y,Z);
      PP=ro+PN*zi;
      IPN=1./PN;
      A=1.;
      ++n;
      continue;
    }

    F=1.+dot(PN,NZ);
    F*=F;
    F=mix(reflection.x,reflection.y,F);
    R=reflect(PN,NZ);
    L=uniform_lambert(R0,NX,NY,NZ);

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
  return vec4(col,1);
}

float dot2(vec3 p) {
  return dot(p,p);
}

vec3 denoise(sampler2D pass, ivec2 xy) {
  const int
    MAX=3
  ;
  const float
    DIV=1./float(MAX*MAX)
  ;
  vec3
    center  = texelFetch(pass, xy, 0).xyz
  , s
  , sum     = center
  ;
  float
    rangeW
  , spatialW
  , w
  , weight = 1.0
  ;
  for(int dy = -MAX; dy <= MAX; ++dy)
  for(int dx = -MAX; dx <= MAX; ++dx) {
    if(dx == 0 && dy == 0) continue;

    s = texelFetch(pass, xy + ivec2(dx, dy), 0).xyz;
    w=exp(-float(dx*dx + dy*dy) * DIV-dot2(s - center) *1E1);
    sum += s * w;
    weight += w;
  }
    return sum / weight;
}

vec4 dpass1() {
  ivec2
    xy=ivec2(_xy)
  ;
  vec3
    col=denoise(pass0, ivec2(_xy))
  , pcol=texelFetch(pass1,xy,0).xyz
  ;
  return vec4(mix(col, pcol, motion_blur),1);
}

vec4 dpass2() {
  return vec4(gb(pass1,ivec2(1,0),ivec2(_xy)),1);
}

vec4 dpass3() {
  ivec2
    xy=ivec2(_xy)
  ;
  vec3
    col=gb(pass2,ivec2(0,1),xy)
  , pcol=texelFetch(pass3,xy,0).xyz
  ;
  return vec4(mix(col,pcol,retain_glow),1);
}


vec4 dpass4() {
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

  mcol=_loadMedia();
  t=smoothstep(media_mask.y,media_mask.x,dot(lum_weights_srgb,mcol.xyz));
  col=texelFetch(pass1,ivec2(_xy),0).xyz;
  bcol=texelFetch(pass3,ivec2(_xy),0).xyz;
  col-=.01;
  col+=neon_glow*bcol;
  dcol=glass_blend*sqrt(bcol)+.005;
  col=mix(col,dcol,mcol.w);
  col=max(col,0.);
  col=tanh_approx(col);
  col=sqrt(col);
  col=mix(col,mcol.xyz,media_intensity*media_opacity*mcol.w*(1.-t));
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
  case 3:
    return dpass3();
  default:
    return dpass4();
  }
}