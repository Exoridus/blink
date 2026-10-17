const float
  TAU           =2.*PI
, PI_2          =.5*PI
#ifdef KODELIFE
, crt_effect        =1.
, media_zoom        =1.
, satellite_distance=1.1
, screen_brightness =1.
, screen_distance   =.0
, show_satellite    =1.
, spectrum_boost    =1.
, sway_factor       =1.3
, use_media         =0.
#endif
;

#define ROT(a)      mat2(cos(a), sin(a), -sin(a), cos(a))

vec4 spectrum(float x) {
#ifdef KODELIFE
  return vec4(1.);
#else
  return textureLod(syn_Spectrum,x,0.);
#endif
}

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
vec3 tanh_approx(vec3 x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/intersectors/
float ray_cylinder(vec3 ro, vec3 rd, float r) {
  // Tweaked it a bit
  float
      a=dot(rd.xy, rd.xy)
    , b=dot(ro.xy, rd.xy)
    , c=dot(ro.xy, ro.xy) - r*r
    , h=b*b - a*c
    , t
    ;

  if(h<.0) return -1.;

  h = sqrt(h);
  t = (-b+h)/a;

  return t;
}

// License: MIT, author: Pascal Gilcher, found: https://www.shadertoy.com/view/flSXRV
float atan_approx(float y, float x) {
  float
    cosatan2 = x/(abs(x)+abs(y))
  , t = PI_2-cosatan2*PI_2
  ;
  return y<0.?-t:t;
}

// License: MIT OR CC-BY-NC-4.0, author: mercury, found: https://mercury.sexy/hg_sdf/
vec2 mod_polar(inout vec2 p, float repetitions) {
  float
    angle = TAU/repetitions
  , a = atan_approx(p.y, p.x) + angle/2.
  , r = length(p)
  , c = floor(a/angle)
  ;
  a = mod(a,angle) - angle/2.;
  p = vec2(cos(a), sin(a))*r;
  if (abs(c) >= (repetitions/2.)) c = abs(c);
  return vec2(c,r);
}

// License: Unknown, author: Unknown, found: don't remember
float hash(vec2 co) {
  co+=.1234;
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233)))*13758.5453);
}

float L4(vec2 p) {
  return sqrt(length(p*p));
}

float L4(vec3 p) {
  return sqrt(length(p*p));
}

float L8(vec2 p) {
  p*=p;
  return sqrt(sqrt(length(p*p)));
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
float capsule(vec3 p, float h, float r) {
  p.y -= clamp( p.y, 0.0, h );
  return length( p ) - r;
}

float ndot( in vec2 a, in vec2 b ) { return a.x*b.x - a.y*b.y; }

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
float rhombus(vec3 p, float la, float lb, float h, float ra) {
  p = abs(p);
  vec2 b = vec2(la,lb);
  float f = clamp( (ndot(b,b-2.0*p.xz))/dot(b,b), -1.0, 1.0 );
  vec2 q = vec2(length(p.xz-0.5*b*vec2(1.0-f,1.0+f))*sign(p.x*b.y+p.z*b.x-b.x*b.y)-ra, p.y-h);
  return min(max(q.x,q.y),0.0) + length(max(q,0.0));
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
float torus4(vec3 p, vec2 t) {
  vec2 q = vec2(L4(p.xz)-t.x,p.y);
  return length(q)-t.y;
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
float torus8( vec3 p, vec2 t ) {
  vec2 q = vec2(length(p.xz)-t.x,p.y);
  return L8(q)-t.y;
}

float dot2(vec2 p) {
  return dot(p,p);
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distgradfunctions2d/
float heart(vec2 p) {
  p.x = abs(p.x);

  if (p.y+p.x>1.)
    return sqrt(dot2(p-vec2(0.25,0.75))) - sqrt(2.0)/4.0;
  return sqrt(min(dot2(p-vec2(0.00,1.00)), dot2(p-0.5*max(p.x+p.y,0.0))))*sign(p.x-p.y);
}

// License: MIT, author: Inigo Quilez, found: https://www.iquilezles.org/www/articles/smin/smin.htm
float pmin(float a, float b, float k) {
  float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

float pmax(float a, float b, float k) {
  return -pmin(-a,-b,k);
}

float segmentz(vec3 p, float hl) {
  p.z=abs(p.z)-hl;
  float
    d0=length(p)
  , d1=length(p.xy)
  ;

  return p.z>0.?d0:d1;
}

float segment4(vec2 p, vec2 d) {
  p=p.yx;
  p.x = abs(p.x)-d.x;
  return (p.x>0.?L4(p):abs(p.y))-d.y;
}


const float
  scenesat_max_distance=10.
;

const mat2
  scenesat_sputnik_R0=ROT(radians(90.-20.6))
, scenesat_sputnik_R1=ROT(radians(45.))
, scenesat_sputnik_R2=ROT(radians(-60.0))
;

vec4 scenesat_d;

float scenesat_df(vec3 p) {
  p=-p.zyx;
  vec3
    p0=p
  , p1=p
  , p2
  , p3=p.zxy
  , s=sin(39.*p)
  , p6=p
  , p7=p
  ;

  float
    S
  ;
  p1.yz=abs(p1.yz);
  p1.yz*=scenesat_sputnik_R1;
  p1-=vec3(.15,.58+.03,0);
  p1.xy*=scenesat_sputnik_R0;
  p2=p1;
  p2+=vec3(.1,.2,0);
  p2=p2.yzx;
  p2.xz*=scenesat_sputnik_R2;
  p6-=vec3(0.28,0,0);
  p7-=vec3(0.49,0,0);
  p7=p7.yxz;
  float
    d0=length(p0)-.58
  , d1=capsule(p1, 2.81, .03)
  , d2=rhombus(p2,.1,.3, .03, .0)-.01
  , d3=torus8(p3,.63*vec2(1.,.1))
  , d6=L4(p6)-.3
  , d7=torus4(p7,.275*vec2(1.,.05))
  , d
  ;

  d=d0;
  S=.5+.5*s.x*s.y*s.z;
  S*=S; S*=S; S*=S; S*=S;
  d+=3e-3*S;
  d=pmin(d,d7,.02);
  d=pmin(d,d2,.1);
  d=max(d,-d3);
  d=min(d,d1);
  d=min(d,d6);
  scenesat_d=vec4(d,-d3,d1,d6);

  return d;
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
    if(d<1e-4||z>scenesat_max_distance) break;
    z+=d;
  }

  if(i==max_iter) {
    z=nz;
  }

  return vec3(z,nz,nd);
}

vec3 hyperspace(vec3 RO, vec3 RD, float FO) {
  float
    H0
  , H1
  , REP
  , ci
  , d
  , n1
  , fo
  ;

  vec2
    N
  ;

  vec3
    o
  , p
  , c
  ;
  vec4
    O
  ;

  o=3e-4*bass_thump*beat_boost/(1.+1e-3-(RD.z)+RD.x*RD.x)*(vec3(1,4,16));

  for (float j=2.;j<9.;++j) {
    REP=j*j+3.;
    ci=ray_cylinder(RO,RD,j);
    p=ci*RD+RO;
    N=mod_polar(p.xy,REP);

    H0=hash(.123*vec2(j,N.x));
    p.z-=3.*time*(1.+H0*H0*H0);
    fo=exp(-2e-3*ci*ci);
    c=vec3(N.y,0,p.z);
    c-=vec3(p.xy,floor(p.z+.5));
    for(float i=-1.;i<=1.;++i) {
      n1=floor(i+p.z+.5);
      H1=hash(vec2(H0,n1));
      O=1.+sin(PI*H1+zcolor);
      d=segmentz(c-vec3(0,0,i),.35*H1*H1+.1);
      H1=spectrum_boost*spectrum(mix(.975,.025,H1)).z;
      o+=
          5e-3
        * H1
        / max(d,4e-4*ci+.02*FO)
        * fo
        * (O.w+.1)
        * O.xyz;
    }
  }

  return o;
}

vec4 media(vec2 p) {
  vec2
    msz=vec2(textureSize(syn_Media,0))
  , pp
  ;
  p*=media_zoom;
  p.y*=msz.x/msz.y;
  p+=.5;
#ifdef KODELIFE
  p.y=1.-p.y;
#endif
  pp=p;
  p=clamp(p,0.,1.);
  vec4
    mcol=textureLod(syn_Media, clamp(p,0.,1.), 0.)
  ;

  mcol.xyz *= mcol.xyz;
  mcol.w *= mix(dot(mcol.xyz,vec3(0.2126, 0.7152, 0.0722)),1.,.3);
  mcol.w *= (pp==p?1.:0.);
  return mcol;
}

vec4 scenesat(vec2 p) {
  vec2
    pp
  ;
  p*=2.;
  p.y*=1024./200.;
  p+=.5;
#ifdef KODELIFE
  p.y=1.-p.y;
#endif
  pp=p;
  p=clamp(p,0.,1.);
  vec4
    mcol=textureLod(t_scenesat, clamp(p,0.,1.), 0.)
  ;

  mcol.xyz *= mcol.xyz;
  mcol.w *= mix(dot(mcol.xyz,vec3(0.2126, 0.7152, 0.0722)),1.,.3);
  mcol.w *= (pp==p?1.:0.);
  return mcol;
}

vec3 inner_media(vec3 RO, vec3 RD) {
  float
    pz=(screen_distance-RO.z)/RD.z
  ;

  vec3
    o=vec3(0)
  , p=pz*RD+RO
  ;

  vec4
    mcol
  ;

  vec2
    p0=p.xy
  ;

  mcol=media(p0);
  if(pz>0.) {
    o=mix(o,2.*mcol.xyz, mcol.w);
  }

  if(crt_effect>.5)
    o*=1.+.5*sin(p0.y*2e3);

  return o;
}

vec3 inner_scenesat(vec3 RO, vec3 RD) {
  const vec2
   VSZ=vec2(1.,.4)
  ;
  const float
    VH=VSZ.y*.5+VSZ.x
  , VN=12.
  , VZ=.18/VN
  , WN=12.
  , WZ=.18/WN
  ;

  float
    aa
  , pz=(screen_distance-RO.z)/RD.z
  , d0
  , d1
  , d2
  , d3
  , h2
  , n1
  , n3
  ;

  vec3
    o=vec3(0)
  , p=pz*RD+RO
  , bcol=vec3(1,.0,.3)
  , fcol=.1+bcol
  ;

  vec4
    mcol
  ;

  vec2
    p0=p.xy
  , p1=p0
  , p3=p0
  ;

  float
    ZZ=mix(0.25,.3, bass_thump);
  ;
  d0=heart((p0)/ZZ-vec2(0,-0.6))*ZZ-.02*ZZ;
  aa=length(fwidth(p0));

  p1-=vec2(4.*VZ,-0.15);
  p1/=VZ;
  n1=clamp(floor(p1.x+.5),0.,VN);
  p1.x-=n1;
  h2=spectrum(mix(.05,.95,n1/VN)).y;
  d1=segment4(p1,VSZ)*VZ;
  d2=segment4(p1+vec2(0,VH-h2),vec2(h2,1)*VSZ)*VZ;


  p3-=vec2(-4.*VZ,-0.15);
  p3/=WZ;
  n3=clamp(floor(p3.x+.5),-WN,0.);
  p3.y-=VSZ.y*WN*(spectrum(-n3/WN).w-.5);
  p3.x-=n3;
  d3=(L4(p3)-.4)*WZ;

  d2=min(d2,d3);


  mcol=scenesat(p0);

  if(pz>0.) {
    o=.015/max(dot(p0,p0),2e-2)*bcol;
    o=mix(o,mix(o,bcol,.2), smoothstep(aa,-aa, d1));
    o=mix(o,fcol+.7*sqrt(max(-d0,0.)), smoothstep(aa,-aa, d0));
    o=mix(o,bcol, smoothstep(aa,-aa, d2));
    o=mix(o,fcol ,mcol.w);
  }

  if(crt_effect>.5)
    o*=1.+.5*sin(p0.y*2e3);

  return o;
}

vec3 outer(vec3 RO, vec3 RD) {
  vec3
    n
  , N
  , p
  , r
  , R
  , o =vec3(0)
  , ro=vec3(0)
  , eo=vec3(0)
  , z
  ;

  float
    f
  , t
  ;

  vec4
    d
  ;

  o=hyperspace(RO,RD,0.);

  z=scenesat_march(RO,RD);
  d=scenesat_d;
  p=z.y*RD+RO;
  n=scenesat_normal(p);
  r=reflect(RD,n);
  R=refract(RD,n,.8);
  f=1.+dot(RD,n);
  N=fwidth(r);


  if(z.x<scenesat_max_distance) {
    t=1.;

    if(d.x==d.y) {
      f*=f;
      f*=f;
      eo=bass_thump*step(length(p),.57)*pow(dot(R,RD),32.)*2.*vec3(1,0,.25);
    } else if(d.x==d.z) {
      f*=.3;
    } else if(d.x==d.w) {
      f*=f;
      f*=f;
      eo=screen_brightness*pow(dot(R,RD),128.)*(use_media>.5?inner_media(p,R):inner_scenesat(p,R));
    } else {
      f*=f;
    }
  } else {
//    t=smoothstep(.001,.0,z.z);
    t=0.;
  }

  if(f*t>.05)
    ro=hyperspace(p,r,6.*length(N));
  ro+=3.*smoothstep(.75,.85,r.y)*(1.+sin(zcolor+1.9)).xyz;
  ro*=f;
  o=mix(o,ro+eo,t);
  return o;
}

vec4 renderMain() {
  vec2
    p2=2.*_uvc
#ifdef KODELIFE
  , t2=.2*time*vec2(sqrt(2.),1.)
#endif
  ;

  //t2=23.5*vec2(sqrt(2.),1.);
  //t2=vec2(0.);

  vec3
#ifdef KODELIFE
    RO=vec3(sway_factor*sin(t2),-satellite_distance)
  , LA=vec3(0)
  , Z =normalize(LA-RO)
  , X =normalize(cross(Z,vec3(.2*cos(t2)+vec2(0,1.),0)))
  , Y =cross(X,Z)
  , RD=normalize(2.*Z+p2.y*Y-p2.x*X)
#else
    RO=cam_RO
  , LA=vec3(0)
  , RD=normalize(2.*cam_Z+p2.y*cam_Y-p2.x*cam_X)
#endif
  , o =vec3(0)
  ;

  o=show_satellite>.5?outer(RO,RD):hyperspace(RO,RD,0.);
  o-=3e-2*vec3(3,2,1)*length(p2+.25);
  o=max(o,0.);
  o=tanh_approx(1.125*o);
  o=sqrt(o)-.05;
  return vec4(o,1);
}
