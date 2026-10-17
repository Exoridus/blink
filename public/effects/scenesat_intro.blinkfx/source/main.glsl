#define ROT(a)      mat2(cos(a), sin(a), -sin(a), cos(a))

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
    outer = .01*.0
  , inner = .01*.5
  , full  = inner+outer
  , TAU   = 2.*PI
  ;
const vec3
  dark    =vec3(.1)
, light   =vec3(.5)
, lighter =vec3(.7)
;
// IQ's polynominal soft min
float pmin(float a, float b, float k) {
  float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
  return mix( b, a, h ) - k*h*(1.0-h);
}

float pmax(float a, float b, float k) {
  return -pmin(-a, -b, k);
}

bool commodore() {
#ifdef KODELIFE
  return false;
#else
  return show_commodore>.5;
#endif
}

float freq(float x) {
#ifdef KODELIFE
  return exp(-3.*x*x)*(1.-sqrt(fract(TIME)));
#else
  return texture(syn_Spectrum,x).y;
#endif
}

float wave(float x) {
#ifdef KODELIFE
  return (.5+.25*sin(x*10.+TIME));
#else
  return texture(syn_Spectrum,x).w;
#endif
}

float length4(vec2 p) {
  p*=p;
  return pow(dot(p,p),.25);
}

float circle(vec2 p, float r) {
  return length(p) - r;
}

float box(vec2 p, vec2 b) {
  vec2 d = abs(p)-b;
  return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}


float length8(vec2 p) {
  p*=p;
  p*=p;
  return pow(dot(p,p), .125);
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
float capsule(vec3 p, float h, float r) {
  p.y -= clamp( p.y, 0.0, h );
  return length(p) - r;
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
//  Tweaked with length8
float torus8(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz)-t.x,p.y);
  return length8(q)-t.y;
}

vec3 rot(vec3 p) {
  const mat2
    R0=ROT(radians(20.6))
  , R1=ROT(radians(-30.))
  ;
  p.xy*=R0;
  p.xz*=R1;
  p.yz*=ROT(.05*TIME);
  return p;
}

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
float tanh_approx(float x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  float x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

//#define FINE_DETAILS

float dsputnik(vec3 p) {
  p=rot(p);
  const mat2
    R0=ROT(radians(90.-20.6))
  , R1=ROT(radians(45.))
  , R2=ROT(radians(-60.0))
  ;
  vec3
    p0=p
  , p1=p
  , p2
#ifdef FINE_DETAILS
  , p3=p.zxy
  , s=sin(39.*p)
#endif
  ;
  p1.yz=abs(p1.yz);
  p1.yz*=R1;
  p1-=vec3(.15,.61,0);
  p1.xy*=R0;
  p2=p1;
  p2+=vec3(.1,.2,0);
  p2=p2.yzx;
  p2.xz*=R2;
  float
  , d0=length(p0)-.58
  , d1=capsule(p1, 2.81, .03)
  , d2=rhombus(p2,.1,.3, .03, .0)-.01
#ifdef FINE_DETAILS
  , d3=torus8(p3,.63*vec2(1.,.1))
#endif
  , d=d0
  ;
#ifdef FINE_DETAILS
  d+=3e-3*pow(.5+.5*s.x*s.y*s.z,16.);
  d=max(d,-d3);
#endif
  d=pmin(d,d2,.1);
  d=min(d,d1);
  return d;
}


float dscenesat(vec2 p) {
  vec2 tp=p;
  tp-=vec2(-.03,.02);
  tp.x *= 465./2048.;
  tp*=2.0-.75;
  tp += .5;
  tp = clamp(tp,0,1);
#ifdef KODELIFE
  tp.y = 1.-tp.y;
#endif
  float d = .75-texture(t_scenesat,tp).x;

  return d/6.;

}

float df(vec2 p) {
  float d=dscenesat(p);
  d=abs(d-.01)-.01;
  return d;
}


float hf(vec2 p) {
  float
    d0 = df(p)
  , x = clamp(inner+d0, 0., full)
  , h = sqrt(full*full-x*x)/full
  ;

  return -.5*full*h;
}

vec3 nf(vec2 p) {
  vec2 e = vec2(sqrt(8.)/RENDERSIZE.y, 0);

  return normalize(vec3(
    hf(p + e.xy) - hf(p - e.xy)
  , hf(p + e.yx) - hf(p - e.yx)
  , 2.*e.x
  ));
}

float mountain(float p) {
  float
    a=.125
  , h=-0.
  ;
  p+=1.5+TIME/1e2;
  p*=2.;
  for(int i=0;i<4;++i) {
    h+=a*sin(p);
    p*=1.9;
    p+=1.234;
    a*=.5;
  }
  return h/2.;
}

vec3 logo(vec3 col, vec2 p, float aa) {
  const float Z=.05;
  float
    d=dscenesat(p)
  , m=p.y+.025
  , f=1.5*(.75+.25*sin(TAU*sqrt(2.)/8.*p.y/aa))
  ;
  vec2
    sp=p
  ;
  vec3
    n =nf(p)
  , p3=vec3(p,0)
  , ro=vec3(0,0,10)
  , rd=normalize(p3-ro)
  , r =reflect(rd,n)
  , ld=normalize(vec3(.7,1,1))
  , scol
  ;
  col=mix(col, vec3(1.1)*max(dot(n,ld),0.), smoothstep(aa,-aa, d-full-.01-full));
//  col=vec3(1.1)*max(dot(n,ld),0.);
  col+=pow(max(dot(r,ld),0.),30.);
  scol=hsv2rgb(vec3(.58,tanh_approx(.4+4.*m),.7-3.*m));
  scol+=3e-3*HSV2RGB(vec3(.05,.5,1.))/max(dot(sp,sp),1e-4);
  m+=mountain(p.x);
  scol=mix(scol, hsv2rgb(vec3(.95-.5*m,1.+m,-3.*m)),smoothstep(aa,-aa,m));
  col=mix(col, f*scol, smoothstep(aa,-aa,d));
  return max(col,0.);
}

float commodore(vec2 p, out bool isRed) {
  const vec2
    c0 = vec2(1.35, .435)
  , l3 = c0-vec2(.92, .035)
  , n3 = normalize(vec2(l3.y, -l3.x))
  ;
  const float
    m3 = -dot(c0, n3)
  ;
  vec2 op = p;
  p.y = abs(p.y);
  float
    d0 = circle(p*vec2(.865, 1.), .865)
  , d1 = p.x-.375
  , d2 = box(p-vec2(.385+(1.35-.385)*.5, .235), vec2((1.35-.385)*.5, 0.2))
  , d3 = dot(p, n3)+m3
  , d  = abs(d0)- .275;
  ;
  d = pmax(d, d1, .025);
  d = pmin(d, d2, .025);
  d = pmax(d, d3, .025);
  isRed = op.y > .0 && d2 <= .0025;
  return d;
}

vec3 commodore(vec3 col, vec2 p, float aa) {
  bool isRed;
  const float Z=1.-.2;
  float
    d=commodore(p/Z, isRed)*Z
  ;
  col=mix(col,isRed?dark:light,smoothstep(aa,-aa,d));

  return col;
}

vec3 sputnik(vec3 col, vec2 p, float aa) {
  float i,d,z=.0,m=1e3;
  vec3
    p3
  , rd=normalize(vec3(p,2.));
  ;
  const float
    STEPS=50.
  , DIST=3.
  ;
  for(i=.0;i<STEPS;++i) {
    p3=z*rd;
    p3.z-=DIST;
    d=dsputnik(p3);
    m=min(m,d);
    if (z>DIST+2.||d<1e-3) {
      break;
    }
    z+=d;
  }
  col=mix(col, light, smoothstep(10.*aa, .0, m));

  return col;
}

float segment(vec2 p, vec2 sz) {
  p.y=abs(p.y)-sz.x;
  return (p.y>0.?length4(p):abs(p.x))-sz.y;
}

vec3 bars(vec3 col, vec2 p, float aa) {
  const float
    L=8.
  , Z=.4/L
  ;
  float
    n=clamp(round(p.x/Z),-L,L)
  , f=freq((n+L)/L*.5)
  , d
  ;
  vec2
    c=p
  ;
  c.x-=n*Z;

  d=segment(c,vec2(Z,Z*.4));
  col=mix(col,light,smoothstep(aa,-aa,d));
  d=segment(c+vec2(0,Z-Z*f),vec2(Z*f,Z*.4));
  col=mix(col,dark,smoothstep(aa,-aa,d));

  return col;
}

vec3 wave(vec3 col, vec2 p, float aa) {
  const float
    L=24.
  , Z=.4/L
  ;
  float
    n=clamp(round(p.x/Z),-L,L)
  , f=(wave((n+L)/L*.5)-.5)*2.
  , d
  ;
  vec2
    c=p
  ;
  c.x-=n*Z;

  d=segment(c+vec2(0,.25*Z*L*f),Z*vec2(.0,.45));
  p.x=abs(p.x)-Z*(L+1.);
  d=min(d, segment(p,Z*vec2(.15*L,.5)));
  col=mix(col,dark,smoothstep(aa,-aa,d));

  return col;
}

vec3 program(vec3 col, vec2 p, float aa) {
  vec2 tp=p;
  tp.y += 1.-3.*fract(TIME/1e2-.125)+1.;
  tp*=.5;
  tp+=.5;
  tp = clamp(tp,0,1);
#ifdef KODELIFE
  tp.y = 1.-tp.y;
#endif
  vec4 tcol=texture(t_program, tp);
  col=mix(col, tcol.xyz, tcol.w*exp(-8.*max(p.y+0.5, 0.)));

  return col;
}

vec4 renderMain() {
  vec2
    R=RENDERSIZE.xy
  , p=(2.*_xy-R)/R.y
  , lp=p
  ;
  const float
    FADE_IN=.5
  ;
  float
  , d = df(p)
  , aa=sqrt(2.)/R.y
  , fi=max(1.-TIME/FADE_IN,0.);
  ;

  vec3 col = vec3(0),lcol;
  col=lighter;
  if (commodore()) {
    col=commodore(col, p, aa);
  } else {
    col=sputnik(col, p, aa);
  }
  col=bars(col, p-vec2(R.x/R.y-.5,-.9), aa);
  col=wave(col, p-vec2(-R.x/R.y+.5,-.9), aa);
  col=program(col,p,aa);
  col=mix(lighter,col,step(FADE_IN, TIME));
  lp.y-=sign(lp.y)*fi;
  lcol=logo(col, lp, aa);
  if (abs(p.y) > fi) {
    col=lcol;
  } else {
    col=vec3(0);
  }
  col += 2.*step(FADE_IN,TIME)*exp(-2.*max(TIME-FADE_IN+p.y*p.y,.0));
  return vec4(sqrt(tanh(col)),1);
}