// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

const float
  TAU           =2.*PI
, PI_2          =.5*PI
, no_planes     =14.
, flash_at_plane  =3.
;

#ifdef KODELIFE
const vec2
  color_mod =vec2(.3,2)
, color_xy  =vec2(0,4)
, color_zw  =vec2(2,1)
, fade      =vec2(.5,.5)
, path_a    =vec2(1,sqrt(.5))/9.
, path_b    =vec2(3)
, warp_beat =vec2(0,1)
, warp_world=vec2(2,0)
, warp_limit=sqrt(vec2(.5,2))
, rep       =vec2(5.,30)
, width     =vec2(.03,.24)
, zoom      =vec2(.4,2)
;
const vec3
  flash_color = vec3(1,2./45.,1./5.)/10.
;
#endif

float beatTime() {
#ifdef KODELIFE
  return floor(T)+sqrt(fract(T));
#else
  return dot(bass_speed,vec2(TIME,syn_BassTime));
#endif
}

float beat() {
#ifdef KODELIFE
  return pow(1.-fract(TIME),2.);
#else
  return dot(pow(vec2(syn_BassLevel,syn_BassHits), bass_pow), bass_mix);
#endif
}

float hash1(float co) {
  return fract(sin(co*12.9898) * 13758.5453);
}

float hash3(vec3 r)  {
  return fract(sin(dot(r.xy,vec2(1.38984*sin(r.z),1.13233*cos(r.z))))*653758.5453);
}

vec3 path(float z){
  return vec3(path_b*sin(path_a*z),z);
}

vec3 dpath(float z){
  return vec3(path_b*path_a*cos(path_a*z),1);
}

vec3 ddpath(float z){
  return -vec3(path_b*path_a*path_a*sin(path_a*z),0);
}

// License: MIT, author: Pascal Gilcher, found: https://www.shadertoy.com/view/flSXRV
float atan_approx(float y, float x) {
  float cosatan2 = x / (abs(x) + abs(y));
  float t = PI_2 - cosatan2 * PI_2;
  return y < 0. ? -t : t;
}

vec4 alphaBlend(vec4 back, vec4 front) {
  // Based on: https://en.wikipedia.org/wiki/Alpha_compositing
  float w = front.w + back.w*(1.0-front.w);
  vec3 xyz = (front.xyz*front.w + back.xyz*back.w*(1.0-front.w))/w;
  return w > 0. ? vec4(xyz, w) : vec4(0);
}

float length4(vec2 p) {
  p*=p;
  return pow(dot(p,p),.25);
}

float pmin(float a, float b, float k) {
  float h = clamp(.5+.5*(b-a)/k, 0., 1.);
  return mix(b, a, h) - k*h*(1.-h);
}

// License: CC0, author: Mårten Rånge, found: https://github.com/mrange/glsl-snippets
float pmax(float a, float b, float k) {
  return -pmin(-a, -b, k);
}

float pabs(float a, float k) {
  return -pmin(a, -a, k);
}

// License: MIT OR CC-BY-NC-4.0, author: mercury, found: https://mercury.sexy/hg_sdf/
float modMirror1(inout float p, float size) {
  float halfsize = size*0.5;
  float c = floor((p + halfsize)/size);
  p = mod(p + halfsize,size) - halfsize;
  p *= mod(c, 2.)*2. - 1.;
  return c;
}

vec2 toPolar(vec2 p) {
  return vec2(length(p), atan_approx(p.y, p.x));
}

vec2 toRect(vec2 p) {
  return vec2(p.x*cos(p.y), p.x*sin(p.y));
}

float smoothKaleidoscope(inout vec2 p, float sm, float rep) {
  vec2 hp = p;

  vec2 hpp = toPolar(hp);
  float rn = modMirror1(hpp.y, TAU/rep);

  float sa = PI/rep - pabs(PI/rep - abs(hpp.y), sm);
  hpp.y = sign(hpp.y)*(sa);

  hp = toRect(hpp);

  p = hp;

  return rn;
}

mat2 rot(float a) {
  float
    c=cos(a)
  , s =sin(a)
  ;
  return mat2(c,s,-s,c);
}

float
  g_B
;

vec4 plane(vec3 p) {
  float
  , I=round(p.z)
  , Q=dot(p.xy,p.xy)
  , H0=hash1(I)
  , n=2.*round(mix(rep.x,rep.y,fract(7877.*H0)))
  , Z=mix(zoom.x,zoom.y,fract(3733.0*H0))
  , aa=length(fwidth(p.xy))
  , H1
  , d
  , d0
  , d1
  , d2
  , D
  ;
  p.xy*=rot(6.*ddpath(I).x);

  d0=length4(p.xy)-.5;
  d=d0-2.*width.x;
  D=d0;

  smoothKaleidoscope(p.xy, 2./n,n);

  p.xy *= rot(.2*g_B*fract(6577.*H0));
  p.xy+=g_B*.3*fract(7919.*H0);

  vec3
    N=round(p/Z)*Z
  , C=p-N
  ;

  H1=hash3(N);
  if(H1>.5) {
    C.xy=vec2(C.y,-C.x);
  }

  d1=abs(min(length(C.xy-.5*Z),length(C.xy+.5*Z))-.5*Z)-width.x*Z;
  d2=length4(abs(C.xy)-.5*Z)-width.y*Z;
  d=min(d,d1);
  d=min(d,d2-2.*Z*width.x);
  D=min(D,d2);
  return vec4(
    mix(
      (1.+color_zw.y*sin(color_mod.x*I+color_mod.y*Q+vec3(color_xy, color_zw.x)))/(1e1*Q*Q*Q)*(1.+2.*smoothstep(-.5,.5, sin(d0*300.)))
    , vec3(0)
    , smoothstep(aa,-aa,d))
  , smoothstep(aa,-aa,-D));
}

vec4 renderMain() {
  float
    T=beatTime()
  , B=beat()
  , z=T
  ;
  g_B=T;
  vec2
    p=2.*_uvc
  , s=sin(29.*p)
  ;
  vec3
    O=path(z)
  , S=normalize(path(z+no_planes-flash_at_plane)-O)
  , Z=normalize(dpath(z))
  , X=normalize(cross(vec3(0,1,0)-ddpath(z),Z))
  , Y=cross(X,Z)
  , I=normalize(p.x*X+p.y*Y+(warp_world.x-warp_world.y*length(p)+mix(warp_beat.x, warp_beat.y, B)*(.5+.5*s.x*s.y)*smoothstep(warp_limit.x, warp_limit.y, length(p)))*Z)
  , P
  ;
  vec4
    R
  , o=vec4(0)
  ;
  z=fract(-z)/I.z;
  const int LoopEnd=int(no_planes);
  for (int i=0;i<LoopEnd&&o.w<1.;++i) {
    P=O+z*I;
    P.xy -= path(P.z).xy;
    R=plane(P);
    R.w*=smoothstep(no_planes,fade.y*no_planes,z);
    o=alphaBlend(R,o);
    z+=1./I.z;
  }
  o.w*=fade.x;
  R.xyz=beat()*2e-2*flash_color/(1.0001-dot(I,S));
  R.w=1.;
  o=alphaBlend(R,o);
  o.xyz *= o.w;
  o=sqrt(tanh(o));
#ifdef KODELIFE
#else
  vec4 mcol=_loadMedia();
  o.xyz=mix(o.xyz,mcol.xyz,mcol.w*media_opacity*media_multiplier);
#endif
  o.w = 1.;
  return o;
}