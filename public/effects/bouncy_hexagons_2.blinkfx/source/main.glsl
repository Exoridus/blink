// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

#ifdef KODELIFE
const float
  light_dir   =0.
, look_dir    =0.
, height      =20.
, motion_blur =.3
, viginette   = 1.
;

const vec2
  bar_height    =vec2(11,3.5)
, bouncy_islands=vec2(.65,.8)
, black_freq    =vec2(.05,.4)
, red_freq      =vec2(.25,.3)
, world_zoom    =vec2(.57735,1)
;

const vec3
  black_col =vec3(1e-3)
, border_col=vec3(1)
, red_col   =vec3(1,0,0)
, white_col =vec3(1)
;
#endif

// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
const vec4 hsv2rgb_K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www);
  return c.z * mix(hsv2rgb_K.xxx, clamp(p - hsv2rgb_K.xxx, 0.0, 1.0), c.y);
}
// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
//  Macro version of above to enable compile-time constants
#define HSV2RGB(c)  (c.z * mix(hsv2rgb_K.xxx, clamp(abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www) - hsv2rgb_K.xxx, 0.0, 1.0), c.y))

const float
  max_marches_1 = 90.
, tolerance_1   = 1e-3
, max_depth_1   = 100.
, normal_eps_1  = 1e-3
, TAU=2.*PI
, top_plane=9.
;

float fbm(vec2 p) {
  const float
#ifdef KODELIFE
    off=.4
#else
    off=.2
#endif
  ;

  return (texture(t_fbm,2e-3*(p-vec2(-1,1)*dot(speed_control,vec2(TIME,syn_Time)))+.5).x-off)*bar_height.x;
}

float fbm2(vec2 p) {
  float
    a=0.
  , aa=1.
  , i
  , d=0.
  ;

  for (i=0.;i<3.;++i) {
    a+=aa*sin(p.x);
    d+=aa;
    aa*=.5;
    p*=mat2(6,8,-8,6)/5.;
    p+=1.234;
  }

  return a/d;
}

float freq(float x, vec2 o) {
#ifdef KODELIFE
  return smoothstep(.0,.9,sin(TAU*x*TIME));
#else
  float f=texture(syn_Spectrum,o.x+o.y*x).z;
  f+=bar_level;
  f*=f;
  f*=f;
  f*=bar_height.y;
  return f;
#endif
}

// License: Unknown, author: Unknown, found: don't remember
float hash(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233))) * 13758.5453);
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm
vec2 hexagon(vec2 p, vec2 r) {
  p=p.yx;
  const vec3
    k = 0.5*vec3(-sqrt(3.0), 1, sqrt(4.0/3.0))
  ;

  p = abs(p);
  p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;

  vec2
    p0=p
  , p1=p
  ;

  p0-=vec2(clamp(p0.x, -k.z*r.x, k.z*r.x), r.x);
  p1.x=abs(p1.x);
  p1-=r.y*vec2(sqrt(1./3.),1);

  return vec2(length(p0)*sign(p0.y),length(p1));
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
vec3 hexagon(vec3 p, vec3 r) {
  vec2
    d   = hexagon(p.xz,r.xy)
  , w0  = vec2(d.x,abs(p.y)-r.z)
  ;
  return vec3(
    min(max(w0.x,w0.y),0.)+length(max(w0,0.))
  , d
  )
  ;
}

// License: Unknown, author: Martijn Steinrucken, found: https://www.youtube.com/watch?v=VmrIDyYiJBA
vec2 hextile(inout vec2 p) {
  // See Art of Code: Hexagonal Tiling Explained!
  // https://www.youtube.com/watch?v=VmrIDyYiJBA
  const vec2
    sz       = vec2(1, 1.7320508)
  , hsz      = 0.5*sz
  ;

  vec2
    p1 = mod(p, sz)-hsz
  , p2 = mod(p - hsz, sz)-hsz
  , p3 = dot(p1, p1) < dot(p2, p2) ? p1 : p2
  , n = ((p3 - p + hsz)/sz)
  ;
  p = p3;

  n -= vec2(0.5);
  // Rounding to make hextile 0,0 well behaved
  return floor(n*2.0+.5)*0.5;
}

float nearest_hex_wall(vec2 p, vec2 rd) {
  const mat3x2
    PROJ = mat3x2(
        vec2(1 ,  0       )
      , vec2(.5, .8660253 )
      , vec2(.5, -.8660253)
      )
  ;

  vec3
    pp  = p*PROJ
  , prd = rd*PROJ
  , ird = 1./prd
  , dro = (sign(prd)*.5)-pp
  , dt  = dro*ird
  ;

  return min(min(dt.x, dt.y), dt.z);
}

// In
vec2
  g_hsrd
, g_ird
, g_rd
;


// Out
vec2
  g_g
;
vec3
  g_col
;

float df_1(vec3 p) {
  if(p.y>top_plane) {
    return p.y-top_plane+1.;
  }

  vec3
    p0=p
  , p1=p
  , d0
  ;

  vec2
    n
  , c=p.xz
  ;
  ;

  n=hextile(c);
  n*=world_zoom;

  p0.xz=c;

  float
    h0=hash(n)
  , h1=fract(8667.*h0)
  , h
  , d1=p1.y
  , d
  , f
  , F
  , cd
  ;

  vec3
    col=white_col
  ;

  cd=1e-3+nearest_hex_wall(c,g_rd);

  h=fbm(n);
  F=fbm2(0.231*n);
  f=smoothstep(min(bouncy_islands.x,bouncy_islands.y),max(bouncy_islands.x, bouncy_islands.y),abs(F));
  h=mix(h,freq(h1,F>0.?red_freq:black_freq),f);
  col=mix(col,F>0.?red_col:black_col,f);

  // Cool bug
  // g_col=
  d0=hexagon(p0,vec3(.40,.45,h))-vec3(0.05,0,0);

  g_col=col;
  g_g=d0.yz;

  d=d0.x;
  d=min(d,cd);
  d=min(d,d1);

  return d;
}

float ray_march_1(vec3 ro, vec3 rd, float initz) {
  g_hsrd=sign(rd.xz)*.5;
  g_rd=rd.xz;
  g_ird=1./(rd.xz);

  float
    d
  , i
  , z=initz
  ;

  for (i=0.;i<max_marches_1;++i) {
    d=df_1(ro+rd*z);
    if(d<tolerance_1||z>max_depth_1) {
      break;
    }
    z+=d;
  }

  return z;
}

vec3 normal_1(vec3 p) {
  vec2
    e=vec2(normal_eps_1,0)
  ;
  return normalize(vec3(
      df_1(p+e.xyy)-df_1(p-e.xyy)
    , df_1(p+e.yxy)-df_1(p-e.yxy)
    , df_1(p+e.yyx)-df_1(p-e.yyx)
    ));
}

void rot(inout vec2 p, float a) {
  float
    c=cos(a)
  , s=sin(a)
  ;
  p=vec2(c*p.x+s*p.y,c*p.y-s*p.x);
}

vec3 render1(vec3 ro, vec3 rd) {
  vec3
    ld=normalize(vec3(-1,.5,1))
  ;
  rot(ld.xz,light_dir);

  float
    z
  , Z
  , T
  ;

  vec2
    g
  ;

  vec3
    col=white_col
  , bcol
  , p
  , n
  ;

  T=(top_plane-ro.y)/rd.y;
  z=ray_march_1(ro,rd,max(T,0.));
  g=g_g;
  bcol=g_col;
  p=ro+rd*z;
  n=normal_1(p);
  Z=ray_march_1(p+1e-1*n,ld,1e-1);

  if (z<max_depth_1) {
    bcol=mix(
        .1*sign(bcol)
      , bcol
      , mix(
          .25
        , 1.
        , smoothstep(
            .02
          , .04
          , min(
              g.y
            , abs(g.x-.05+mix(.04,.03,n.y))
          )
        )
      )
    );
    bcol=mix(border_col,bcol,smoothstep(.07,.06,g.x));
    bcol*=min(
      dot(n,ld)>0.?1.:0.25
    , Z<max_depth_1?mix(1.,.25,exp(-.05*Z)):1.
    );
    col=bcol;
  }

  col=mix(white_col,col,exp(-.05*max(z-.5*max_depth_1,0.)));

  return col;
}

float length8(vec2 p) {
  p*=p;
  p*=p;
  return pow(dot(p,p),1./8.);
}

vec4 fpass0() {
  const vec3
    Z=normalize(vec3(-1,-1,1))
  , X=normalize(cross(Z,vec3(0,1,0)))
  , Y=cross(X,Z)
  ;

  vec2
    p=2.*_uvc
  ;

  vec3
#ifdef KODELIFE
    ro=vec3(0,height,TIME)
#else
    ro=vec3(0,height,speed)
#endif
  , rd =normalize(-p.x*X+p.y*Y+2.*Z)
  , col
  ;
  rot(rd.xz,look_dir);

  col=render1(ro,rd);
  col = mix(vec3(0,0,0), col, smoothstep(0.3,-.3,length8(-1.+2.*_uv)-viginette));
  col=max(col,0.);
  col=sqrt(col);
  return vec4(col,1.);
}

// License: Unknown, author: XorDev, found: https://github.com/XorDev/GM_FXAA
vec4 fxaa(sampler2D tex, vec2 uv, vec2 texelSz) {
  // See this blog
  // https://mini.gmshaders.com/p/gm-shaders-mini-fxaa

  // Maximum texel span
  const float span_max    = 8.0;
  // These are more technnical and probably don't need changing:
  // Minimum "dir" reciprocal
  const float reduce_min  = (1.0/128.0);
  // Luma multiplier for "dir" reciprocal
  const float reduce_mul  = (1.0/32.0);

  const vec3  luma        = vec3(0.299, 0.587, 0.114);

  // Sample center and 4 corners
  vec3 rgbCC = texture(tex, uv).rgb;
  vec3 rgb00 = texture(tex, uv+vec2(-0.5,-0.5)*texelSz).rgb;
  vec3 rgb10 = texture(tex, uv+vec2(+0.5,-0.5)*texelSz).rgb;
  vec3 rgb01 = texture(tex, uv+vec2(-0.5,+0.5)*texelSz).rgb;
  vec3 rgb11 = texture(tex, uv+vec2(+0.5,+0.5)*texelSz).rgb;

  //Get luma from the 5 samples
  float lumaCC = dot(rgbCC, luma);
  float luma00 = dot(rgb00, luma);
  float luma10 = dot(rgb10, luma);
  float luma01 = dot(rgb01, luma);
  float luma11 = dot(rgb11, luma);

  // Compute gradient from luma values
  vec2 dir = vec2((luma01 + luma11) - (luma00 + luma10), (luma00 + luma01) - (luma10 + luma11));

  // Diminish dir length based on total luma
  float dirReduce = max((luma00 + luma10 + luma01 + luma11) * reduce_mul, reduce_min);

  // Divide dir by the distance to nearest edge plus dirReduce
  float rcpDir = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);

  // Multiply by reciprocal and limit to pixel span
  dir = clamp(dir * rcpDir, -span_max, span_max) * texelSz.xy;

  // Average middle texels along dir line
  vec4 A = 0.5 * (
      texture(tex, uv - dir * (1.0/6.0))
    + texture(tex, uv + dir * (1.0/6.0))
    );

  // Average with outer texels along dir line
  vec4 B = A * 0.5 + 0.25 * (
      texture(tex, uv - dir * (0.5))
    + texture(tex, uv + dir * (0.5))
    );


  // Get lowest and highest luma values
  float lumaMin = min(lumaCC, min(min(luma00, luma10), min(luma01, luma11)));
  float lumaMax = max(lumaCC, max(max(luma00, luma10), max(luma01, luma11)));

  // Get average luma
  float lumaB = dot(B.rgb, luma);

  //If the average is outside the luma range, using the middle average
  return ((lumaB < lumaMin) || (lumaB > lumaMax)) ? A : B;
}

vec4 fpass1() {
  vec4
    pcol
  , mcol
  , col
  ;

#define FXAA
#ifdef FXAA
  col = fxaa(pass0,_uv,sqrt(2.)/RENDERSIZE);
#else
  col =  texture(pass0,_uv);
#endif

#ifndef KODELIFE
  mcol=_loadMedia();
  col.xyz=mix(col.xyz,mcol.xyz,mcol.w*media_opacity*media_multiplier);
#endif

  pcol=texture(syn_FinalPass,_uv);
  col.xyz=mix(col.xyz,pcol.xyz,motion_blur);

  col.w=1.;
  return col;
}

vec4 renderMain() {
  switch(PASSINDEX)
  {
  case 0:
    return fpass0();
  default:
    return fpass1();
  }
}
