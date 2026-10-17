// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

float beat() {
#ifdef KODELIFE
  return pow(1.-fract(TIME),2.);
#else
  return dot(pow(vec2(syn_BassLevel,syn_BassHits), bass_pow), bass_mix);
#endif
}

#ifdef KODELIFE
const float
  media_transparency  = 0.7
, media_multiplier    = 1.0
, zoom_factor         = 9.0
, wcut                = 0.2
, translation_speed   = 0.5
;

const vec2
  bass_mix        = vec2(0.5, 0.5)
, bass_pow        = vec2(4.0, 1.0)
, speed_control   = vec2(0.5, 0.5)
, visual_mix      = vec2(1.0, 1.0)
, effect_base0    = vec2(0.0, 1.0)
, effect_base1    = vec2(2.0, 0.0)
, rotation_speed  = vec2(1.0, 2.0)
, sine_distortion = vec2(29.0, 0.0)
;

const vec3
  flash_color = vec3(0.3333, 0.6666, 1.0)
;
#endif

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
vec3 tanh_approx(vec3 x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

mat2 rot(float a) {
  float
      c=cos(a)
    , s=sin(a)
    ;
  return mat2(c,s,-s,c);
}

vec4 renderMain() {
  float
    i
  , z=0.
  , d
  , k
  , B=beat()
#ifdef KODELIFE
  , t=2.*TIME
  , H=0.
#else
  , t=dot(speed_control,vec2(TIME, syn_BassTime))
  , H=syn_BassHits
#endif
  , T=.1*t
  ;

  vec2
    C=_xy
  , r=RENDERSIZE
  , U=2.*_uvc
  , S=sin(U*sine_distortion.x)
  ;
  vec3
    I=normalize(vec3(C-.5*r,(1.+H*sine_distortion.y*dot(U,U)*S.x*S.y)*r.y))
  , o=vec3(0)
  ;
  vec4
    p
  , P
  , M
  ;

  mat2
    R0=rot(T)
  , R1=rot(rotation_speed.x*T)
  , R2=rot(rotation_speed.y*T)
  ;

  for(i=0.;i<79.;++i) {
    p=vec4(z*I,wcut),

    p.z-=3.;

    p.xw*=R0;
    p.yw*=R1;
    p.zw*=R2;

    p*=k=zoom_factor/dot(p,p);

    P=p-=translation_speed*t;

    p=abs(p-floor(p+.5));

    d=abs(
     min(
       min(
           sqrt(min(min(dot(p.xz,p.xz),dot(p.yz,p.yz)), dot(p.xy,p.xy)))
         , length(p)-.2
         )
       , min(p.w,min(p.x,min(p.z,p.y)))+.05)
       )/k;

    p=1.+sin(P.z+log2(k)+vec4(effect_base0,effect_base1));

    o+=visual_mix.x*exp(.7*k+6.*B-6.)*3.*flash_color;
    o+=visual_mix.y*p.w/max(d,1e-3)*p.xyz;
    z+=.8*d+1e-3;
  }

  o=clamp(o/1e4,0.,9.);
  o=tanh_approx(o)/0.9;
  o=mix(o,vec3(0),isnan(o));
#ifndef KODELIFE
  M=_loadMedia();
  o=mix(o,M.xyz,M.w*media_transparency*media_multiplier);
#endif
  return vec4(o,1);
}
