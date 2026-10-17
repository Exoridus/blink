// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighoring rights to this work.
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


const float
  TAU=PI*2.
;

const int
  render1_max_steps = 90
;

const float
  render1_tolerance   = 1E-3
, render1_max_length  = 16.
, render1_normal_eps  = 1E-2
;

#ifdef KODELIFE
const vec2
  path_a        = vec2(.33, .41)*.25
, path_b        = vec2(1,sqrt(.5))*8.
, grid_dim_xy   = vec2(1)
, grid_dim_zr   = vec2(1,.03)
, warp_world    = vec2(2.,.5)
;
const float
  path_rot        =0.
, path_twist      =0.
, media_opacity   =1.
, media_multiplier=1.
;
const vec3
  flash_col=vec3(.20, .62, 1)
, snake_col=vec3(.57, .15, 1)
;
#endif

float beat() {
#ifdef KODELIFE
  return pow(1.-fract(TIME),2.);
#else
  return dot(pow(vec2(syn_BassLevel,syn_BassHits), bass_pow), bass_mix);
#endif
}

vec3 offset(float z) {
  return vec3(path_b*sin(path_a*z), z);
}

vec3 doffset(float z) {
  return vec3(path_a*path_b*cos(path_a*z), 1.0);
}

vec3 ddoffset(float z) {
  return vec3(-path_a*path_a*path_b*sin(path_a*z), 0.0);
}

mat2 rot(float a) {
  float c=cos(a),s=sin(a);
  return mat2(c,s,-s,c);
}

// License: Unknown, author: Unknown, found: don't remember
void warpWorld(inout vec3 p){
  vec3 warp = offset(p.z);
  vec3 dwarp = normalize(doffset(p.z));
  p.xy -= warp.xy;
  p -= dwarp*dot(vec3(p.xy, 0), dwarp)*0.5*vec3(1,1,-1);
  p.xy *= rot(dwarp.x+path_rot+path_twist*p.z);
}

vec2 g_gd;

// License: Unknown, author: Unknown, found: don't remember
float hash(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233))) * 13758.5453);
}
float render1_df(vec3 p) {
  warpWorld(p);
  vec2 zr=grid_dim_zr;
  vec3 grid_dim = vec3(grid_dim_xy,zr.x);
  vec3 p0 = p-0.5*grid_dim;
  vec3 n0 = round(p0/grid_dim)*grid_dim;
  vec3 c0 = p0 - n0;
  float d0 = length(c0.xy);
  float d1 = length(c0.yz);
  float d2 = length(c0.xz);
  float d3 = length(c0)-zr.y;
  vec3 c1 = c0;
  float h1 = hash(n0.xz);
  float h2 = fract(8667.0*h1);
  float a1 = smoothstep(0.99, 1.0, sin(0.125*(p.y-0.5*mix(2.0, 4.0, h2)*TIME*1.5)+TAU*h1));
  c1.xz *= rot((8.0*p.y+0.6));
  c1 -= 0.01+zr.y;
  float d4 = length(c1.xz)-mix(-0.001, 0.005, a1);
  float d = d0;
  d = min(d, d1);
  d = min(d,d2);
  d = min(d,d3);
  d -= zr.y;
  d = min(d,d4);

  if (d4 < g_gd.x) {
    g_gd = vec2(d4, a1);
  }
  return d;
}


float render1_raymarch(vec3 ro, vec3 rd, float tinit) {
  float t = tinit;
  int i;
  float sf = 0.8;
  float pt = t;
  for (i = 0; i < render1_max_steps; ++i) {
    float d = render1_df(ro + rd*t);
    if (d < render1_tolerance || t > render1_max_length) {
      if (sf > 0.25) {
        t = pt;
        sf = 0.25;
      } else {
        break;
      }
    }
    pt = t;
    t += sf*d;
  }
  return t;
}

vec3 render1_normal(vec3 pos) {
  const vec2 eps = vec2(render1_normal_eps, 0.0);
  return normalize(vec3(
      render1_df(pos+eps.xyy)-render1_df(pos-eps.xyy)
    , render1_df(pos+eps.yxy)-render1_df(pos-eps.yxy)
    , render1_df(pos+eps.yyx)-render1_df(pos-eps.yyx))
    );
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

vec3 render1(vec3 ro, vec3 rd) {
  vec3 flashCol     = flash_col;
  vec3 sparkCol     = snake_col*5E-3;

  g_gd = vec2(1E3, 0.0);
  float t1 = render1_raymarch(ro, rd, 0.1);
  vec2 gd = g_gd;

  vec3 col = vec3(0.);
  vec3 sp0 = offset(ro.z+2.0);
  vec3 sp1 = offset(ro.z+8.0);

  vec3 p1 = ro+rd*t1;
  vec3 n1 = render1_normal(p1);
  vec3 r1 = reflect(rd, n1);
  vec3 d01 = sp0-p1;
  vec3 d11 = sp1-p1;
  vec3 ld01 = normalize(d01);
  vec3 ld11 = normalize(d11);

  float flash = beat();
  vec3 fcol = flashCol*mix(2.0, 20.0, flash);

  g_gd = vec2(1E3, 0.0);
  float dn = render1_df(p1);
  vec2 gdn = g_gd;

  if (t1 < render1_max_length) {
    col = vec3(0.);
    col += 10.*fcol*pow(max(dot(ld11, r1),0.0),80.0)/max(8.0, dot(d11,d11));
    col += 10.*fcol*pow(max(dot(ld01, r1),0.0),20.0)/max(8.0, dot(d01,d01));
    col += 8E-3*gdn.y*sqrt(sparkCol)/max(5E-4, gdn.x*gdn.x);
  }

  col *= exp(-4E-2*vec3(2.0,3.0,1.0)*t1);
  {
    float r = mix(4., 5.,flash);
    float sd = raySphereDensity(ro,rd, vec4(sp1-vec3(0.0,0.,0.0), r), t1);

    col += sd*sd*fcol;
  }
  col += gd.y*sparkCol/max(1E-4, gd.x);
  return col;
}

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
vec3 tanh_approx(vec3 x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

vec3 effect(vec2 p) {
  float
#ifdef KODELIFE
    tm  = 2.*TIME
#else
    tm  = path_speed
#endif
  , rdd= warp_world.x+warp_world.y*length(p)
  ;
  vec3 ro   = offset(tm);
  vec3 dro  = doffset(tm);
  vec3 ddro = ddoffset(tm);

  vec3 ww = normalize(dro);
  vec3 uu = normalize(cross(ww,vec3(0,1,0)-4.*ddro));
  vec3 vv = cross(ww, uu);
  vec3 rd = normalize(p.x*uu + p.y*vv + rdd*ww);

  vec3 col = render1(ro, rd);
  col=clamp(col,0.,9.);
  col=tanh_approx(col);
  col = sqrt(col);
#ifdef KODELIFE
#else
  vec4 mcol=_loadMedia();
  col=mix(col,mcol.xyz,mcol.w*media_opacity*media_multiplier);
#endif
  return col;
}

vec4 renderMain() {
  vec2 p = _uvc*2.;
  vec3 col = effect(p);
  return vec4(col,1);
}
