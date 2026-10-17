// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

#define ROT(a)      mat2(cos(a), sin(a), -sin(a), cos(a))

#ifdef KODELIFE
const float
  bars_opacity=1.
, fractal_offset=.1
, glow_radius=.5
;

const vec2
  color_base=vec2(7,2)
;
  vec3 fpos(float z) {
    return vec3(.3,.2,.01*z);
  }
  vec3 fdpos(float z) {
    const float
      dt=.01
    ;
    return (fpos(z+dt)-fpos(z-dt))/(2.*dt);
  }
  vec3 fddpos(float z) {
    const float
      dt=.01
    ;
    return (fdpos(z+dt)-fdpos(z-dt))/(2.*dt);
  }
#else
  vec3 fpos(float z) {
    return pos;
  }
  vec3 fdpos(float z) {
    return dpos;
  }
  vec3 fddpos(float z) {
    return ddpos;
  }
#endif

const float
  TAU       = 2.*PI
;

mat2 g_rot;
float g_scale;

// License: Unknown, author: Matt Taylor (https://github.com/64), found: https://64.github.io/tonemapping/
vec3 aces_approx(vec3 v) {
  const float
    a = 2.51
  , b = 0.03
  , c = 2.43
  , d = 0.59
  , e = 0.14
  ;

  v = max(v, 0.);
  v *= d;
  return clamp((v*(a*v+b))/(v*(c*v+d)+e), .0, 1.);
}

// License: MIT, author: Inigo Quilez, found: https://www.iquilezles.org/www/articles/smin/smin.htm
float pmin(float a, float b, float k) {
  float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

float pmax(float a, float b, float k) {
  return -pmin(-a, -b, k);
}

// License: MIT, author: Inigo Quilez, found: https://www.iquilezles.org/www/articles/spherefunctions/spherefunctions.htm
float ray_sphere_density(vec3 ro, vec3 rd, vec4 sph, float dbuffer) {
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

vec3 palette(float a) {
  return 1.+sin(vec3(0,color_base)+a);
}

float apollonian(vec4 p, float s, float w, out float off) {
  float
    z=1.
  , k
  , d
  ;

  for(int i=0; i<6;++i) {
    p-=2.*floor(p*.5+.5);
    k= s/dot(p,p);
    p*=k;
    z*=k;
  }

  vec4
    sp=p/z
  , ap=abs(sp)-w
  ;

  d=pmax(ap.w, ap.y, w*11.);
  d=min(d, pmax(ap.x, ap.z, w*11.));
  off=length(sp);

  return d;
}

float df(vec3 p, float w, out float off) {
  vec4
    p4 = vec4(p, fractal_offset)
  ;

  p4.yw = p4.yw*g_rot;
  p4.zw = g_rot*p4.zw;

  return apollonian(p4, g_scale, w, off);
}

vec3 glowmarch(vec3 ro, vec3 rd, float tinit, out float tlast) {

  vec3
    col=vec3(0)
  , p
  ;
  float
    t=tinit
  , off
  , d
  ;

  for (int i=0; i<60; ++i) {
    p=ro+rd*t;
    d=df(p, 6E-5+t*t*2E-3, off);
    col+=1E-9/max(d*d, 1E-8)*(palette(log(off))+5E-2);
    t+=.5*max(d, 1E-4);
    if (t>2.) break;
  }

  tlast = t;
  return col;
}

vec4 render(vec3 ro, vec3 rd) {
  float
    tlast
  , den
  ;
  vec3
    col=.1/max(.5-rd.y+.1*rd.x*rd.x, .1)*palette(5.+.1*rd.y)
  ;
  col+=glowmarch(ro, rd, 1E-2, tlast);
  den=ray_sphere_density(ro,rd,vec4(vec3(0,0,0),glow_radius),tlast);
//  col+=den*palette(-.5);
  return vec4(col,den);
}


vec3 gb(sampler2D pp, ivec2 dir, ivec2 xy) {
  const float
    blurriness      =120.
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

  for(int i=1;i<19;++i) {
    I=float(i);
    w=exp(-(I*I)/blurriness);
    off=dir*i;

    col+=w*(texelFetch(pp,xy-off,0).xyz+texelFetch(pp,xy+off,0).xyz);
    ws+=2.*w;
  }
  col/=ws;
  return col;
}

vec4 fpass0(vec2 p, vec2 pp, ivec2 xy) {
  g_scale= mix(1.85, 1.5, .5-.5*cos(TAU*TIME/1600.));
  g_rot  = ROT(TIME*TAU/800.);

  vec2
    s=sin(9.*p+TIME)*length(pp)
  ;

  vec4
    r
  ;

  vec3
    ro = fpos(TIME)
  , ZZ = normalize(fdpos(TIME))
  , XX = normalize(cross(vec3(0,1,0)-fddpos(TIME), ZZ))
  , YY = cross(ZZ, XX)
  , rd = normalize(-p.x*XX + p.y*YY + mix(2.,2.1,.5-.5*s.x*s.y)*ZZ)
  , col
  ;
  r= render(ro, rd);
  col=r.xyz;

  return vec4(col, r.w);
}

float sobel(sampler2D tex, ivec2 xy) {
  float
    tl=texelFetch(tex, xy+ivec2(-1,  1), 0).w
  , tm=texelFetch(tex, xy+ivec2( 0,  1), 0).w
  , tr=texelFetch(tex, xy+ivec2( 1,  1), 0).w
  , ml=texelFetch(tex, xy+ivec2(-1,  0), 0).w
  , mr=texelFetch(tex, xy+ivec2( 1,  0), 0).w
  , bl=texelFetch(tex, xy+ivec2(-1, -1), 0).w
  , bm=texelFetch(tex, xy+ivec2( 0, -1), 0).w
  , br=texelFetch(tex, xy+ivec2( 1, -1), 0).w
  , gx=-tl-2.*ml-bl+tr+2.*mr+br
  , gy=-tl-2.*tm-tr+bl+2.*bm+br
  ;

  return length(vec2(gx, gy));
}

vec4 fpass1(vec2 p, vec2 pp, ivec2 xy) {
  vec4
    p0=texelFetch(pass0, xy, 0)
  ;

  float
    den=p0.w
  , x=den*den*2.
  , y=sobel(pass0,xy)
  ;


  return vec4(vec3(x,y,0),1);
}

vec4 fpass2(vec2 p, vec2 pp, ivec2 xy) {
  vec3
    b1=gb(pass1,ivec2(1,0),xy)
  ;
  return vec4(b1,1);
}

vec4 fpass3(vec2 p, vec2 pp, ivec2 xy) {
  vec3
    b2=gb(pass2,ivec2(0,1),xy)
  ;
  return vec4(b2,1);
}

float length4(vec2 p) {
  return sqrt(length(p*p));
}

float bar(vec2 p) {
  float
    d0=length4(p)
  , d1=abs(p.y)
  ;
  return p.x>0.?d0:d1;
}

const float
  SpectrumN=19.
;

float flash() {
#ifdef KODELIFE
  return 1.;
#else
  return syn_BassLevel;
#endif
}

float spectrum(float x) {
  float
    y=0.3
  ;
#ifndef KODELIFE
  y=texture(syn_Spectrum,abs(x*.8/SpectrumN)+1./SpectrumN).y;
#endif
  y-=.3;
  y=max(y,0.);
  y*=y;
  return y;
}

vec3 bars(vec3 col, vec2 p) {
  const float
    ZZ=.05
  ;
  p.x=-abs(p.x);
  p.x+=RENDERSIZE.x/RENDERSIZE.y;


  float
    aa=sqrt(2.)/RENDERSIZE.y
  , n=clamp(floor(p.y/ZZ+.5),-SpectrumN,SpectrumN)
  , c=p.y-ZZ*n
  , s=spectrum(abs(n))
  , d=bar(vec2(p.x-.25*s+ZZ*.25,c))-ZZ*.45
  , o=bars_opacity*(s*.33+.1)
  ;

  col=mix(col, mix(col,palette(1.-abs(p.y)),o), smoothstep(aa, -aa, d));

  return col;
}

vec4 flast(vec2 p, vec2 pp, ivec2 xy) {
  vec3
    gc=palette(-.5)
  , bc=palette(.5)
  , c0=texelFetch(pass0,xy,0).xyz
  , c3=texelFetch(pass3,xy,0).xyz
  , col
  ;

#ifndef KODELIFE
  vec4
    m=_loadMedia()
  ;
#endif

  float
    bl=flash()
  ;

  col=c0;
  col+=c3.x*bl*gc;
  col+=c3.y*bl*bl*bc;

  col*=smoothstep(1.707, .707, length(pp));
  col-=3E-2*(.3+dot(pp,pp))*vec3(2,3,1);

  col=bars(col,p);
  col=aces_approx(col);
  col=sqrt(col);

#ifndef KODELIFE
  col=mix(col,m.xyz,(.5+p.y)*m.w*media_opacity);
#endif

  return vec4(col,1);
}

vec4 renderMain() {
  vec2
    p=2.*_uvc
  , pp=-1.+2.*_uv
  ;

  ivec2
    xy=ivec2(_xy)
  ;
  switch(PASSINDEX) {
    case 0:
      return fpass0(p,pp,xy);
    case 1:
      return fpass1(p,pp,xy);
    case 2:
      return fpass2(p,pp,xy);
    case 3:
      return fpass3(p,pp,xy);
    default:
      return flast(p,pp,xy);
  }
}

