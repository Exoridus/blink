// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
const vec4 hsv2rgb_K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www);
  return c.z * mix(hsv2rgb_K.xxx, clamp(p - hsv2rgb_K.xxx, 0.0, 1.0), c.y);
}
// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
//  Macro version of above to enable compile-time constants
#define HSV2RGB(c)  (c.z * mix(hsv2rgb_K.xxx, clamp(abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www) - hsv2rgb_K.xxx, 0.0, 1.0), c.y))

#define ROT(a)      mat2(cos(a), sin(a), -sin(a), cos(a))

const float
  TAU=2.*PI
, max_dist  = 10.
, max_steps = 90.
, norm_eps  = 5e-4
, tolerance = 5e-4
;

#ifdef KODELIFE
const float
  beam_lum    =.5
, flash_dist  =3.
, motion_blur =.3
, ref_factor  =.1
, ref_focus   =190.
;

const vec2
  bass_mix      =vec2(.7,.7)
, bass_pow      =vec2(3,2)
, beam_hue      =vec2(.7,.2)
, flash_mix     =vec2(.5,5)
, flash_radius  =vec2(1,2)
, path_a        =vec2(1,sqrt(.5))/6.
, path_b        =vec2(6,4)
, time_mix      =vec2(.5,.25)
;

const vec3
  flash_col_max=HSV2RGB(vec3(.58,.7,1.))
, flash_col_min=HSV2RGB(vec3(.63,.9,1.))
;
#endif

float beat() {
#ifdef KODELIFE
  return pow(1.-fract(TIME),2.);
#else
  return dot(pow(vec2(syn_BassLevel,syn_BassHits), bass_pow), bass_mix);
#endif
}

// Outputs from distance field function
float
  g_G
, g_G0
, g_H
, g_T
;
mat2
  g_R
;
vec3
  g_L
;
vec3 path(float z){
  return vec3(path_b*sin(path_a*z),z);
}

vec3 dpath(float z){
  return vec3(path_b*path_a*cos(path_a*z),1);
}

vec3 ddpath(float z){
  return -vec3(path_b*path_a*path_a*sin(path_a*z),0);
}

void warpWorld(inout vec3 p){
  vec3
    warp = path(p.z)
  , dwarp = normalize(dpath(p.z))
  ;
  p.xy -= warp.xy;
  p -= dwarp*dot(vec3(p.xy, 0), dwarp)*.5*vec3(1,1,-1);
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm
float roundedX(vec2 p, float w, float r) {
  p = abs(p);
  return length(p-min(p.x+p.y,w)*.5) - r;
}

float hash(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233))) * 13758.5453);
}

float df(vec2 p, float a) {
  const mat2
    R45=ROT(radians(45.))
  ;
  mat2
    R=ROT(a)
  ;
  float
    d=1e3
  , g
  , S=.5
  , H
  ;
  vec2
    P
  , s=vec2(0.)
  , I
  ;
  for(int i=0;i<3;++i) {
    p*=R;
    s+=S*sign(p);
    p=abs(p)-S;
    d=min(d,roundedX(p,.25*S,.05*(S)));
    P=p;
    P*=R45;
    I=sign(P);
    P=abs(P);
    P-=.125*S;
    H=hash(s+.123*I);
    g=length(P)+.05*(smoothstep(1.,.9,sin(g_T+.5*a+TAU*fract(8667.*H))));
    if (g<g_G) {
      g_G=g;
      g_H=H;
    }
    d=min(d,g);
    S*=.45;
  }
  return d;
}

float df(vec3 p)  {
  float
    d0=length(p-g_L)-0.1
  , d1
  ;

  warpWorld(p);
  p.xy*=g_R;
  d1=df(p.xy,p.z);
  g_G0=min(g_G0,d0);
  return min(d0,d1);
}

vec3 nf(vec3 p) {
  vec2 e=vec2(norm_eps,0);
  return normalize(vec3(
    df(p+e.xyy)-df(p-e.xyy)
  , df(p+e.yxy)-df(p-e.yxy)
  , df(p+e.yyx)-df(p-e.yyx)
  ));
}


// License: MIT, author: Inigo Quilez, found: https://www.iquilezles.org/www/articles/spherefunctions/spherefunctions.htm
float raySphereDensity(vec3 ro, vec3 rd, vec4 sph, float dbuffer) {
  float ndbuffer = dbuffer/sph.w;
  vec3  rc = (ro - sph.xyz)/sph.w;
  float b = dot(rd,rc);
  float c = dot(rc,rc) - 1.0;
  float h = b*b - c;
  if(h<0.0) return 0.0;
  h = sqrt(h);
  float t1 = -b - h;
  float t2 = -b + h;
  if(t2<0.0 || t1>ndbuffer) return 0.0;
  t1 = max(t1, 0.0);
  t2 = min(t2, ndbuffer);
  float i1 = -(c*t1 + b*t1*t1 + t1*t1*t1/3.0);
  float i2 = -(c*t2 + b*t2*t2 + t2*t2*t2/3.0);
  return (i2-i1)*(3.0/4.0);
}

float raymarch(vec3 O, vec3 I, float initz, out float iter) {
  float
    i
  , z=initz
  , d
  ;
  for(i=0.;i<max_steps;++i) {
    d=df(I*z+O);
    if(z>max_dist || d < tolerance) {
      break;
    }
    z+=.9*d;
  }
  iter = i;
  return z;
}

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
vec3 tanh_approx(vec3 x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

vec3 render3D() {
  float
    i
  , B=beat()
  , D
  , F
  , G
  , G0
  , H
  , L
#ifdef KODELIFE
  , T=TIME
#else
  , T=dot(vec2(TIME,syn_BassTime),time_mix)
#endif
  , z=mod(T,300.)
  ;
  g_T=T;
  vec2
    p=2.*_uvc;
  vec3
    O=path(z)
  , L0=path(z+flash_dist)
  , Z=normalize(dpath(z))
  , X=normalize(cross(vec3(0,1,0)-ddpath(z),Z))
  , Y=cross(X,Z)
  , I=normalize(p.x*X+p.y*Y+2.*Z)
  , col=vec3(0)
  , P
  , N
  , R
  , RR
  , LD0
  , FL=mix(flash_col_min, flash_col_max,B)*mix(flash_mix.x, flash_mix.y, B)
  ;
  vec4
    pcol
  , mcol
  ;
  g_L=L0;
  g_R=ROT(.3*T);
  g_G=1e3;
  g_G0=1e3;
  z=raymarch(O,I,.1,i);
  G=g_G;
  G0=g_G0;
  H=g_H;
  P=O+I*z;
  LD0=normalize(L0-P);
  N=nf(P);
  F=1.+dot(N,I);
  F=mix(.1,1.,F*F*F)*smoothstep(1.,.99,F);
  R=reflect(I,N);
  RR=refract(I,N,.1);
  if (z<max_dist) {
    col+=F*pow(max(dot(R,LD0),0.),ref_focus)*200.*ref_factor/dot(O-L0,O-L0)*FL;
  }

  D=raySphereDensity(O,I,vec4(L0,mix(flash_radius.x, flash_radius.y, B)),z);
  L=(1.+dot(normalize(O-L0),I));
  col+=D*D*FL;
  col+=1e-2/max(G0,2e-3)*FL;
  col+=10.*(G0<=tolerance?(pow(abs(dot(RR,I)),10.)):0.)*FL;
  col+=1e-4/max(G*G,2e-6)*hsv2rgb(vec3(beam_hue.x+beam_hue.y*H,.9,.2*beam_lum));
  col-=1e-1*L*vec3(2,3,1);
  col=clamp(col,0.,9.);
  col=tanh_approx(col);
  col=sqrt(col);
#ifndef KODELIFE
  mcol=_loadMedia();
  col=mix(col,mcol.xyz,mcol.w*media_alpha*media_mult);
#endif  
  pcol=texture(syn_FinalPass,_uv);
  col=mix(col,pcol.xyz,motion_blur);
  return col;
}

vec3 render2D() {
  vec2
    p =_uvc
  ;

  float
    aa=sqrt(.5)/RENDERSIZE.y
  , d=df(p,.1*TIME)
  ;

  return vec3(1)*smoothstep(aa,-aa,d);
}

vec4 renderMain() {
  return vec4(render3D(),1);
}
