// -----------------------------------------------------------------------------
// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

// When I wrote this code, only god and
//  I knew how it worked.
//  Now, only god knows it!

#ifdef KODELIFE
const vec2
  spiral_col_xy   = vec2(3,2)
, spiral_col_zw   = vec2(1,0)
, spiral_col_twist= vec2(4,1)
, spiral_dim      = vec2(.9,.5)
, border_fade     = vec2(1.5,.5)
, border_glow     = vec2(.5,1.5)
, border_mix      = vec2(1,0)
;
const float
  path_speed   =2.
, double_spiral=1.
, spiral_twist =.4
, spiral_rot   =.3
, color_rot    =.0
;

const vec3
  flash_col = vec3(3,2,1)/3.
;
#endif

float beat() {
#ifdef KODELIFE
  return pow(1.-fract(TIME),2.);
#else
  return dot(pow(vec2(syn_BassLevel,syn_BassHits), bass_pow), bass_mix);
#endif
}


float g(vec4 p,float s) {
  return abs(dot(sin(p*=s),cos(p.zxwy))-1.)/s;
}

mat2 rot(float a) {
  float c=cos(a),s=sin(a);
  return mat2(c,s,-s,c);
}

vec4 renderMain() {
  vec2
    S=spiral_col_twist
  , Q=spiral_dim
  ;
  vec3
    I=normalize(vec3(_uvc,1))
  , O=vec3(0)
  ;
  float
      z=0.
    , B=beat()
    , Y
    , D
    , d=double_spiral
    , W=spiral_twist
#ifdef KODELIFE
    , T=TIME*path_speed
    , R=TIME*spiral_rot
    , C=TIME*color_rot
#else
    , T=path_speed
    , R=spiral_rot
    , C=color_rot
#endif
    , L=length(-1.+2.*_uv)
    ;
  vec4
      p
    , X
    , U=vec4(spiral_col_xy,spiral_col_zw)
    , M
    ;
  for(
      int i=0
    ; i<77
    ; ++i
    ) {
    p=z*I.xyzy;
    p.z+=T;
    D=g(p,23.) + g(p,11.) + g(p,7.);
    p.xy*=rot(R+W*p.z);
    Y=Q.x+Q.y*sin(.5*p.z);
    X=d>.5?abs(p):p;
    X/=Y;
    z+=D=.7*abs(Y*abs(X.x-round(max(X.x, 1.)))+D/9.-.1)+1e-3;
    D*=1.+dot(p.xy,p.xy)/4.;
    p=1.+sin(dot(S,p.xy)+(p.x<0.?C+.25+U.yzwy : U.zyxz-.25-C));
    O+=p.w/D*p.xyz;
  }
  O=
      B*border_mix.y*flash_col*smoothstep(border_glow.x,border_glow.y, L)
    + mix(1.,smoothstep(border_fade.x,border_fade.y, L), border_mix.x)
    * tanh((O+z*z*z*6.*flash_col)/9e3)
    ;

#ifdef KODELIFE
#else
  M=_loadMedia();
  O=mix(O,M.xyz,M.w*media_opacity*media_multiplier);
#endif

  return vec4(O,1);
}
