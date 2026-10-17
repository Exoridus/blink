// Font: Cyber Brush by burhanafif@gmail.com
//  https://hanscostudio.com/
//  Licensed as NON-COMMERCIAL

const float
  PI_2            =.5*PI
, TAU             =2.*PI
#ifdef KODELIFE
, base_col        =5.
, bouncing_bars   =0.
, crt_effect      =0.
, denoise         =5.
, grid_speed      =.3
, media_leak      =0.3
, media_zoom      =0.5
, motion_blur     =.3
, sun_height      =-0.2
, tri_transparency=2.
, z_dist          =0.25
#endif
;

// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
const vec4 hsv2rgb_K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
//  Macro version of above to enable compile-time constants
#define HSV2RGB(c)  (c.z * mix(hsv2rgb_K.xxx, clamp(abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www) - hsv2rgb_K.xxx, 0.0, 1.0), c.y))

#define ROT(a)      mat2(cos(a), sin(a), -sin(a), cos(a))

float circle(vec2 p, float r) {
  return length(p)-r;
}

float segment(vec2 p, vec2 a, vec2 b) {
  vec2
    pa = p-a
  , ba = b-a;
  float
    h  = clamp(dot(pa,ba)/dot(ba,ba), 0., 1.)
  ;
  return length(pa-ba*h);
}

// License: Unknown, author: Unknown, found: don't remember
float hash(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233))) * 13758.5453);
}

// License: Unknown, author: Unknown, found: don't remember
vec2 hash2(float co) {
  return fract(sin(co*vec2(12.9898,78.233))*43758.5453);
}

vec3 noisy_ray_dir(vec2 r, vec2 p, vec3 X, vec3 Y, vec3 Z) {
  p += (-1.+2.*r)/RENDERSIZE.y;
  return normalize(-p.x*X+p.y*Y+2.*Z);
}


// License: Unknown, author: catnip, found: FieldFX discord
vec3 point_on_sphere(vec2 r) {
  r=vec2(PI*2.*r.x, 2.*r.y-1.);
  return vec3(sqrt(1. - r.y * r.y) * vec2(cos(r.x), sin(r.x)), r.y);
}

// License: Unknown, author: catnip, found: FieldFX discord
vec3 uniform_lambert_approx(vec2 r, vec3 n) {
  return normalize(n*(1.001) + point_on_sphere(r)); // 1.001 required to avoid NaN
}

// License: MIT, author: Inigo Quilez, found: https://www.iquilezles.org/www/articles/smin/smin.htm
float pmin(float a, float b, float k) {
  float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

float L8(vec2 p) {
  p*=p;
  return sqrt(sqrt(length(p*p)));
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
float capsule(vec3 p, float h, float r) {
  p.y -= clamp( p.y, 0.0, h );
  return length(p) - r;
}

float ndot(vec2 a, vec2 b) { return a.x*b.x - a.y*b.y; }

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
float rhombus(vec3 p, float la, float lb, float h, float ra) {
  p = abs(p);
  vec2
    b = vec2(la,lb)
  ;
  float
    f = clamp((ndot(b,b-2.*p.xz))/dot(b,b), -1., 1.)
  ;
  vec2
    q = vec2(length(p.xz-.5*b*vec2(1.-f,1.+f))*sign(p.x*b.y+p.z*b.x-b.x*b.y)-ra, p.y-h)
  ;
  return min(max(q.x,q.y),0.) + length(max(q,0.));
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
//  Tweaked with length8
float torus8(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz)-t.x,p.y);
  return L8(q)-t.y;
}

// License: MIT, author: Pascal Gilcher, found: https://www.shadertoy.com/view/flSXRV
float atan_approx(float y, float x) {
  float cosatan2 = x/(abs(x)+abs(y));
  float t = PI_2-cosatan2*PI_2;
  return y<0.?-t:t;
}

float ray_issphere4(vec3 ro, vec3 rd, float ra) {
  float
    r2 = ra*ra
  ;

  vec3
    d2 = rd*rd
  , d3 = d2*rd
  , o2 = ro*ro
  , o3 = o2*ro
  ;

  float
    ka = 1./dot(d2,d2)
  , k3 = ka* dot(ro,d3)
  , k2 = ka* dot(o2,d2)
  , k1 = ka* dot(o3,rd)
  , k0 = ka*(dot(o2,o2) - r2*r2)
  , c2 = k2 - k3*k3
  , c1 = k1 + 2.*k3*k3*k3 - 3.*k3*k2
  , c0 = k0 - 3.*k3*k3*k3*k3 + 6.*k3*k3*k2 - 4.*k3*k1
  , p = c2*c2 + c0/3.
  , q = c2*c2*c2 - c2*c0 + c1*c1
  , h = q*q - p*p*p
  ;

  if (h<0.) return -1.;

  float
    sh= sqrt(h)
  , s = sign(q+sh)*pow(abs(q+sh),1./3.)
  , t = sign(q-sh)*pow(abs(q-sh),1./3.)
  ;

  vec2
    w = vec2( s+t,s-t )
  , v = vec2( w.x+c2*4.0, w.y*sqrt(3.0) )*0.5
  ;

  float
    r = length(v)
  ;

  return abs(v.y)/sqrt(r+v.x) - c1/r - k3;
}

float tri(vec2 p, float r) {
  p.y=-p.y+r*sqrt(1./12.);
  const float k = sqrt(3.0);
  p.x = abs(p.x) - r;
  p.y = p.y + r/k;
  if( p.x+k*p.y>0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
  p.x -= clamp( p.x, -2.0*r, 0.0 );
  return -length(p)*sign(p.y);
}

#ifdef KODELIFE
mat3 rotX(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(
    1.0 , 0.0 , 0.0
  , 0.0 , +c  , +s
  , 0.0 , -s  , +c
  );
}

mat3 rotY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(
    +c  , 0.0 , +s
  , 0.0 , 1.0 , 0.0
  , -s  , 0.0 , +c
  );
}

mat3 rotZ(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(
    +c  , +s  , 0.0
  , -s  , +c  , 0.0
  , 0.0 , 0.0 , 1.0
  );
}
#endif

// --

const vec2
  sunset_resolution=vec2(1920,540)
;

vec3 sunset_sun_color(vec2 p) {
  return 1.1+sin(p.y*3.-2.5+vec3(0,1,2));
}

vec3 sunset_line_color(vec2 p) {
  return (1.1+sin(p.x*.5-2.5+vec3(0,1,2)));
}

vec3 sunset_sun(vec3 o, vec2 p) {
  const float Z=.1;

  float
    d0=circle(p-vec2(0,sun_height),1.)
  , d1
  , d
  , c
  , t
  , g
  , aa=1./sunset_resolution.y
#ifdef KODELIFE
  , BL=1.-sqrt(fract(TIME))
#else
  , BL=syn_BassLevel
#endif
  ;

  c=p.y/Z-.25;
  c-=floor(c+.5);
  d1=abs(c)-.33-.008*p.y*p.y/(Z*Z);
  d1*=Z;
  d=max(d0,d1);

  t=smoothstep(aa,-aa,d);
  vec3
    b=sunset_sun_color(p)
  ;

  o+=b*t;

  o+=
    mix(3e-1,1.,smoothstep(.7,1.,BL))/max(length(p),1./3.)
    *smoothstep(mix(.03,1.,BL),mix(.0,-1.,BL*BL),d)*b;

  o*=step(0.,p.y);
  return o;
}

const float
  sunset_cell_size=.1
;

float sunset_fft(float x) {
  float
    fo=1./(1.+.01*x*x)
  , h
  ;

#ifdef KODELIFE
  x*=.33;
  h=(.5+.5*sin(x)*cos(x*2.34));
#else
  h=textureLod(syn_Spectrum,abs(x*sunset_cell_size*.5)+0.03,0.).y;
  h-=.03;
  h=max(h,0.);
  h=h*h;
#endif
  h*=.6*fo;
  return h;
}

vec3 sunset_mountains(vec3 o, vec2 p) {
  float
    n
  , h
  , f
  , ff
  , d
  ;

  vec2
    c
  ;
  vec3
    b=sunset_sun_color(p)
  ;

  n=floor(p.x/sunset_cell_size+.5);
  c=p;
  c.x-=sunset_cell_size*n;

  d=1e3;
  const float N=3.;

  ff=sunset_fft(n);
  f=sunset_fft(n+sign(c.x));
  h=mix(ff,f,abs(c.x)/sunset_cell_size);

  h-=p.y;
  if(h>0.) {
    o*=.1;
    o+=max(h,0.)*4.*b;
  }

  f=sunset_fft(n-N);

  for(float i=-N;i<N; ++i) {
    ff=sunset_fft(n+i+1.);
    d=min(d, segment(c,vec2(sunset_cell_size*i,f),vec2(sunset_cell_size*(i+1.),ff)));
    f=ff;
  }


  o+=6e-3/max(abs(d),1e-3)*sunset_line_color(p);
  o+=2e-3/max(abs(p.y),1e-3)*b;

  return o;
}

vec4 f_sunset() {
  vec2
    p=((_xy-.5*sunset_resolution)/sunset_resolution.y)
  ;

  p.y+=.495;

  vec3
    o=vec3(0)
  ;

  o=sunset_sun(o,p);
  o=sunset_mountains(o,p);

  return vec4(o,1.);
}

// --

const vec2
  scenesat_resolution  =vec2(800)
;

const float
  scenesat_max_distance=9.
, scenesat_min_a       =.05
, scenesat_color_offset=1.5
;

const vec3
  scenesat_light_dir  =normalize(vec3(1,2,-1))
, scenesat_color_base =4.+vec3(0,2,9)
, scenesat_logo_col   =HSV2RGB(vec3(.8,.97,3.))
, scenesat_base_col_0 =HSV2RGB(vec3(.58,.8,1.))
, scenesat_base_col_1 =vec3(0)
;

const mat2
  scenesat_sputnik_R0=ROT(radians(90.-20.6))
, scenesat_sputnik_R1=ROT(radians(45.))
, scenesat_sputnik_R2=ROT(radians(-60.0))
;

vec2 scenesat_antenna_hit;

vec4 scenesat_dsputnik(vec3 p) {
  const float ZZZ=.1;
  vec3
    p0=p
  , p1=p
  , p2
  , p3=p.zxy
  , p4
  , s=sin(39.*p)
  ;
  scenesat_antenna_hit=sign(p1.yz);
  p1.yz=abs(p1.yz);
  p1.yz*=scenesat_sputnik_R1;
  p1-=vec3(.15,.61,0);
  p1.xy*=scenesat_sputnik_R0;
  p2=p1;
  p2+=vec3(.1,.2,0);
  p2=p2.yzx;
  p2.xz*=scenesat_sputnik_R2;
  p4=p1;
  float n4=clamp(floor(p4.y/ZZZ+.5),2.,27.);
  p4.y-=ZZZ*n4;
  float
    d0=length(p0)-.58
  , d1=capsule(p1, 2.81, .03)
  , d2=rhombus(p2,.1,.3, .03, .0)-.01
  , d3=torus8(p3,.63*vec2(1.,.1))
  , d4=abs(p4.y)-ZZZ*.4
  , d=d0
  ;
  d+=3e-3*pow(.5+.5*s.x*s.y*s.z,16.);
  d=max(d,-d3);
  d=pmin(d,d2,.1);
  d=min(d,d1);
  return vec4(d,d0+1e-2,max(d1,d4),n4);
}


vec4 scenesat_dd;
mat3 scenesat_R0;
float scenesat_df(vec3 p) {
  p*=scenesat_R0;
  float
    d0
  , d1
  ;
  vec4
    ds=scenesat_dsputnik(p)
  ;

  scenesat_dd=ds;

  return ds.x;

}

vec3 scenesat_normal(vec3 p) {
  vec2 e=vec2(1e-3,-1e-3);
  return normalize(
    e.xyy*scenesat_df(p+e.xyy)
  + e.yyx*scenesat_df(p+e.yyx)
  + e.yxy*scenesat_df(p+e.yxy)
  + e.xxx*scenesat_df(p+e.xxx)
  );
}

vec3 scenesat_march(vec3 P, vec3 I) {
  const int max_iter= 77;
  float
    d
  , z=0.
  , nz=0.
  , nd=1e3
  ;

  int i;

  for(i=0;i<max_iter;++i) {
    d=scenesat_df(z*I+P);
    if(d<nd) {
      nd=d;
      nz=z;
    }
    if(d<1e-3||z>scenesat_max_distance) break;
    z+=d;
  }

  if(i==max_iter) {
    z=nz;
  }

  return vec3(z,nz,nd);
}

vec3 scenesat_render_ibox(float A, vec3 RO, vec3 RI) {
  float
    f
  , i
  , z
  ;

  vec3
    n
  , p
  , r
  , O=vec3(0)
  ;

  for(i=0.;i<3.&&A>scenesat_min_a;++i) {
    z=ray_issphere4(RO,RI,1e2);
    p=z*RI+RO;
    n=-normalize(p*p*p);
    r=reflect(RI,n);
    f=1.+dot(n,RI);
    f*=f;
    if (z>0.) {
      O+=
         A
        *pow(max(0.,dot(n,scenesat_light_dir)),9.)
        *(scenesat_color_offset+sin(f+scenesat_color_base))
        ;
    } else {
      break;
    }
    A*=mix(.3,.7,f);
    RI=r;
    RO=p+1e-3*n;
  }


  return O;
}

vec3 scenesat_flash(vec3 RO, vec3 RI, float A, vec3 n, vec3 p, vec3 bcol) {
  p*=scenesat_R0;
  return A*pow(dot(n,refract(n,RI,.9)),100.)*smoothstep(-.9,.9, sin(100.*atan_approx(p.z,p.y)))*bcol;
}

vec4 scenesat_render(vec3 RO, vec3 RI) {
  float
    i
  , f
  , A=1.
#ifdef KODELIFE
  , AH=1.-sqrt(fract(TIME))
  , BH=1.-sqrt(fract(TIME))
#else
  , AH
  , BH=syn_BassHits
#endif
  , t=1.
  ;

  vec4
    dd
  ;

  vec3
    o=vec3(0)
  , p
  , n
  , r
  , P=RO
  , bcol=mix(
      scenesat_base_col_1
    , scenesat_base_col_0
    , BH
    )
  , z3
  ;

  for(i=0.;i<4.&&A>scenesat_min_a;++i) {
    z3=scenesat_march(P,RI);
    dd=scenesat_dd;
    p=z3.y*RI+P;
    n=scenesat_normal(p);
    r=reflect(RI,n);
    f=1.+dot(n,RI);
    f*=f;
    if (dd.y<1e-3) {
      o+=scenesat_flash(RO, RI, A, n, p, bcol);
      f=-0.3;
    } else if(dd.z<1e-3&&bouncing_bars>.5) {
      vec2 hit=scenesat_antenna_hit;
#ifdef KODELIFE
#else
      if(hit==vec2(1,1))
        AH=syn_BassHits;
      else if(hit==vec2(1,-1))
        AH=syn_MidHits;
      else if(hit==vec2(-1,1))
        AH=syn_MidHighHits;
      else if(hit==vec2(-1,-1))
        AH=syn_HighHits;
      else
        AH=0.;
#endif
      //AH=1.;
      o+=smoothstep(.1,-.4,dd.w/26.-AH*AH)*A*(1.-f)*(1.05+sin(base_col-.05*dd.w+vec3(0,1,2)));
      f=-0.3;
    }
    if(z3.x<scenesat_max_distance) {
    } else if(i==0.) {
      t=smoothstep(.01,.0,z3.z);
      break;
    } else {
      break;
    }
    A*=mix(.3,.7,f);
    RI=r;
    P=p+.025*(n+RI);
  }

  return vec4(o+scenesat_render_ibox(A,P,RI),t);
}

vec4 scenesat_scenesat() {
  float
    T=TIME
  ;

  vec2
    C=gl_FragCoord.xy
  , R=scenesat_resolution.xy
  , p=(2.*C-R)/R.y-vec2(-.55,.55)
  ;

  vec3
    o=vec3(0)
  , RO=vec3(0,0,-4)
  , LA=vec3(0,0,0)
  , Z=normalize(LA-RO)
  , X=normalize(cross(Z,vec3(0,1,0)))
  , Y=cross(Z,X)
  , RI=normalize(p.y*Y+2.*Z-p.x*X)
  ;

#ifdef KODELIFE
  scenesat_R0=rotZ(3.7)*rotY(-.6+.2*sin(.123*TIME))*rotX(.5*TIME);
#else
  scenesat_R0=mat3(rot_x, rot_y, rot_z);
#endif

  return scenesat_render(RO,RI)*vec4(11,11,11,1);
}

float scenesat_dscenesat(vec2 p) {
  const float
    Z=.5
    ;
  const mat2
    R=ROT(0.33)
    ;
  p.x-=.09;
  p.y-=.06;
  p*=R;
  p*=Z;
  p.y*=512./151.;
  p+=.5;
#ifdef KODELIFE
  p.y=1.-p.y;
#endif
  float
    d=textureLod(t_scenesat,clamp(p,0.,1.),0.).x
  ;

  d=.75-d;

  return d*(4.*Z);
}

vec3 scenesat_media(vec2 p) {
#ifdef KODELIFE
  return vec3(0);
#else
  vec2
    sz=vec2(textureSize(syn_Media,0))
  ;
  p *=media_zoom;
  p.x*=sz.y/sz.x;
  p+=.5;
  vec4
    t=textureLod(syn_Media,p,0.)
  ;
  return t.xyz*t.xyz*t.w;
#endif
}

vec4 f_scenesat() {
  vec2
    p=(2.*_xy-scenesat_resolution)/scenesat_resolution.y
  , q=(2.*_xy-scenesat_resolution)/scenesat_resolution.xy
  ;

  vec3
    o
  , b
  ;

  float
    d
  , ds
  , aa=sqrt(2.)/scenesat_resolution.y
  , t
  , g
  , st
  , bst
  ;

  vec4
    sc=scenesat_scenesat()
  ;
  d=tri(p,.8);
  ds=scenesat_dscenesat(p);
  b=2.*(1.05+sin(4.4+p.x+p.y+vec3(0,1,3)));
  g=2e-4/max(d*d,9e-5);
  o=scenesat_media(p)*smoothstep(media_leak,-.01,d);
  if (d<.0) {
    o+=b*g;
    t=max(0.,1.-tri_transparency*d*d);
  } else {
    g=sqrt(g);
    o+=b*g;
    t=g;
  }
  st=smoothstep(aa,-aa,ds);
  bst=smoothstep(aa,-aa,1e-3*ds);
  t=max(t,sc.w);
  t=max(t,st);
  t=max(t,bst);
  t=clamp(t,0.,1.);
  o=mix(o,.2*scenesat_logo_col,bst);
  o=mix(o,scenesat_logo_col,st);

  o=mix(o,sc.xyz,sc.w);
  q=abs(q);
  t*=smoothstep(.99,.89,max(q.x,q.y));
  o=max(o,0.);
  return vec4(o,t);
}

// --

vec4 reflection_far(vec2 tp) {
  tp*=2e-3;
  tp.x*=sunset_resolution.y/sunset_resolution.x;
  tp.x+=.5;
  return textureLod(pass_sunset, tp, 0.);
}

vec4 reflection_near(vec2 tp) {
  tp+=.5;
  return textureLod(pass_scenesat, tp, 0.);
}

vec3 reflection_raycast(vec2 r, vec3 RO, vec3 RD, out bool abort) {
  abort=false;
  float
    zs
  , zn
  , zf
  , ZN
  , ZF
  , F
  ;

  vec2
    tp
  , S
  ;

  vec3
    p
  , P
  , R
  , U
  , o=vec3(0)
  , O=vec3(0)
  ;

  vec4
    to
  ;

  bool
    c
  ;

  zs=(-.37-RO.y)/RD.y;
  zf=(1e3-RO.z)/RD.z;
  zn=(z_dist-RO.z)/RD.z;


  F=1.+RD.y;
  F*=F;
  F*=F;

  P=zs*RD+RO;
  R=reflect(RD,vec3(0,1,0));
  if(r.x>.1*F) {
    U=uniform_lambert_approx(r,R);
    R=mix(R,U,.1);
  }
  //R.y=abs(R.y);

  ZF=(1e3-P.z)/R.z;
  ZN=(z_dist-P.z)/R.z;


  if(zs>0.) {
    p=zs*RD+RO;
#ifdef KODELIFE
    tp=p.xz+vec2(0,grid_speed*TIME);
#else
    tp=p.xz+vec2(0,grid_speed);
#endif
    S=sin(.234*tp);
    tp-=floor(tp+.5);
    tp=abs(tp);
    o+=2e-2/max(min(tp.x,tp.y)+zs*zs*1e-4,1e-3)*(1.+sin(4.3+S.x*S.y+vec3(0,1,3)));
  }

  c=zf<zs||zs<0.;
  if(c) {
    p=zf*RD+RO;
  } else {
    p=ZF*R+P;
  }

  tp=p.xy;
  to=reflection_far(tp);

  if(c) {
    o=mix(o,to.xyz,to.w);
    abort=true;
  } else {
    O=mix(O,to.xyz,to.w);
  }


  c=zn<zs||zs<0.;
  if(c) {
    p=zn*RD+RO;
  } else {
    p=ZN*R+P;
  }

  tp=p.xy;
  to=reflection_near(tp);

  if(c) {
    o=mix(o,to.xyz,to.w);
    abort=abort||to.w>=1.;
  } else {
    O=mix(O,to.xyz,to.w);
  }

  o+=F*O*(c?1.-to.w:1.);


  return o;
}

vec3 reflection_render(vec2 p, vec3 RO, vec3 X,vec3 Y, vec3 Z) {
  ivec2
    xy=ivec2(_xy)
  ;

  vec3
    o =vec3(0)
  , P =texelFetch(pass_reflection,xy,0).xyz
  ;

  const int
    inner=10
  ;

  bool
    abort
  ;

  float
    seed=fract(hash(p)+TIME)
  , hits=0.
  ;
  vec2
    r=vec2(0)
  ;

  for(float j=0.;j<denoise&&!abort;++j)
  for(int i=0;i<inner;++i) {
    r=hash2(++seed);
    o+=reflection_raycast(r, RO,noisy_ray_dir(r,p,X,Y,Z),abort);
    ++hits;
  }

  o/=hits;

  o = mix(o,P,motion_blur);

  return o;
}

vec4 f_reflection() {
  vec2
    p=2.*_uvc
  ;

  const vec3
    RO=vec3(0,1e-3,-1.)
  , LA=vec3(0,0,0)
  , UP=vec3(0,1,0)
  , Z =normalize(LA-RO)
  , X =normalize(cross(Z,UP))
  , Y =cross(X,Z)
  ;

  vec3
    o =reflection_render(p, RO, X, Y, Z)
  ;

  return vec4(o,1);
}

// --

//#define SCENESAT
//#define SUNSET

// License: Unknown, author: nmz (twitter: @stormoid), found: https://www.shadertoy.com/view/NdfyRM
vec3 sRGB(vec3 t) {
  return mix(1.055*pow(t, vec3(1./2.4)) - 0.055, 12.92*t, step(t, vec3(0.0031308)));
}

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
  v *= .6;
  return clamp((v*(a*v+b))/(v*(c*v+d)+e), 0., 1.);
}

// License: Unknown, author: knarkowicz, found: https://www.shadertoy.com/view/XtlSD7
vec2 crt_distort(vec2 q) {
  q = _uv*2. - 1.;
  vec2
    o = crt_effect*q.yx/vec2(6,4)
  ;
  q = q + q*o*o;
  return q*.5 + .5;
}

// License: Unknown, author: knarkowicz, found: https://www.shadertoy.com/view/XtlSD7
float vig(vec2 q) {
  float
    v = q.x*q.y*(1.0 - q.x)*(1.0 - q.y)
  ;
  v = clamp(pow(16.*v, .3), 0., 1.);
  return v;
}

vec4 f_post() {
  ivec2
    xy=ivec2(_xy)
  ;

  vec2
    q=crt_distort(_uv)
  ;

  vec3
    o;
#if defined(SCENESAT)
  vec4 SS=texture(pass_scenesat, _xy/800.+vec2(-.25*RENDERSIZE.x/RENDERSIZE.y,0), 0.);
  o=SS.xyz*SS.w;
#elif defined(SUNSET)
  vec4 SS=texture(pass_sunset, _xy/vec2(1600,450)+vec2(0.,-1.), 0.);
  o=SS.xyz*SS.w;
#else
  o=textureLod(pass_reflection, q, 0.).xyz;
#endif

  o*=mix(1.,vig(q),crt_effect);
  o-=0.01*vec3(2,3,1);
  o=aces_approx(o);
  o=sRGB(o);

  o*=mix(1.,1.5+.5*sin(_xy.y*TAU/4.), crt_effect);

  return vec4(o,1);
}

vec4 renderMain() {
  switch(PASSINDEX) {
  case 0:
    return f_sunset();
  case 1:
    return f_scenesat();
  case 2:
    return f_reflection();
  default:
    return f_post();
  }
}
