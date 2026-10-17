// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

// I use KodeLife (by hexler) as my main shader IDE, in order to make
// code work both in KodeLife and Synesthesia I use KODELIFE as a condition

const float
  TAU           =2.*PI
, PI_2          =.5*PI
#ifdef KODELIFE
, base_color        =6.
, crt_effect        =0.
, rot_speed         =.1
, spectrum_boost    =1.
, speed             =3.
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
  // Attempt at cheap tanh. Keeps values in [-1, 1] range without the cost of
  // the real tanh. Used here for soft tone mapping in post-processing.

  // Main motivation is that tanh on Macbook M's don't like large input values

  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/intersectors/
float ray_cylinder(vec3 ro, vec3 rd, float r) {
  // Intersects a ray with an infinite cylinder of radius r centered on the z-axis.
  // Returns the ray parameter t at the hit point, or -1 if missed.

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
  // Fast atan2 approximation. Cheaper than atan() on some GPUs.

  float
    cosatan2 = x/(abs(x)+abs(y))
  , t = PI_2-cosatan2*PI_2
  ;
  return y<0.?-t:t;
}

// License: MIT OR CC-BY-NC-4.0, author: mercury, found: https://mercury.sexy/hg_sdf/
vec2 mod_polar(inout vec2 p, float repetitions) {
  // Divides the xy-plane into angular slices around the origin.
  // Folds p into a single slice and returns (slice index, radius).
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
  // Produces a pseudo-random number based on co

  co+=.1234;
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233)))*13758.5453);
}

// License: Unknown, author: knarkowicz, found: https://www.shadertoy.com/view/XtlSD7
vec2 crt_distort(vec2 q) {
  // Barrel distortion for CRT screen effect

  q = _uv*2. - 1.;
  vec2
    o = crt_effect*q.yx/vec2(6,4)
  ;
  q = q + q*o*o;
  return q*.5 + .5;
}

// License: Unknown, author: knarkowicz, found: https://www.shadertoy.com/view/XtlSD7
float vig(vec2 q) {
  // Vignette: darkens corners, bright in center

  float
    v = q.x*q.y*(1.0 - q.x)*(1.0 - q.y)
  ;
  v = clamp(pow(16.*v, .3), 0., 1.);
  return v;
}

// Distance to a line segment along z-axis with half-length hl.
float segmentz(vec3 p, float hl) {
  // Returns distance to the segment surface (treating it as a capsule-like shape).

  p.z=abs(p.z)-hl;
  float
    d0=length(p)       // distance to segment endpoint (sphere cap)
  , d1=length(p.xy)    // distance to segment body (cylinder)
  ;

  // If past the endpoint, use sphere distance; otherwise cylinder distance
  return p.z>0.?d0:d1;
}

vec3 hyperspace(vec3 RO, vec3 RD, float FO) {
  // The main effect: concentric cylinders of glowing line segments
  // arranged in a tunnel-like hyperspace.

  // RO: ray origin, RD: ray direction, FO: fog/glow falloff factor
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
    // Base glow that pulses with bass. The division by (1+1e-3-RD.z+RD.x*RD.x)
    // makes rays looking straight down the tunnel brighter.
    o=mix(0e-4,3e-4, bass_thump)*(vec3(1,4,16))/(1.+1e-3-(RD.z)+RD.x*RD.x)
  , p
  , c
  ;
  vec4
    O
  ;

  // Rotation matrix for the cylinder
  mat2
#ifdef KODELIFE
    R=ROT(rot_speed*time)
#else
    R=ROT(rot_speed)
#endif
  ;

  // Loop over concentric cylinders at increasing radii
  for (float j=2.;j<9.;++j) {
    REP=j*j+3.;  // more segments on larger cylinders
    ci=ray_cylinder(RO,RD,j);  // find where the ray hits this cylinder
    p=ci*RD+RO;  // hit position on cylinder surface
    p.xy*=R;     // rotate the hit point
    N=mod_polar(p.xy,REP);  // fold into one angular slice; N.x=slice, N.y=radius

    // Per-slice random value, seeded by cylinder and slice index
    H0=hash(.123*vec2(j,N.x));
    // Scroll along z at a speed that varies per slice
#ifdef KODELIFE
    p.z-=speed*time*(1.+H0*H0*H0);
#else
    p.z-=speed*(1.+H0*H0*H0);
#endif
    // Distance-based fog: far-away cylinders contribute less light
    fo=exp(-2e-3*ci*ci);
    // Offset from the cell center on the cylinder surface
    c=vec3(N.y,0,p.z);
    // Split into cells along z-axis
    c-=vec3(p.xy,floor(p.z+.5));

    // Check the 3 nearest z-cells: previous, current, next
    //  This to reduce visual artifacts when colors from one cell leaks into
    //  the other
    for(float i=-1.;i<=1.;++i) {
      n1=floor(i+p.z+.5);
      // Per-segment random value
      H1=hash(vec2(H0,n1));
      // Color derived from hash, shifted by base_color uniform
      O=1.+sin(PI*H1+vec4(0,1,8,4)-base_color);
      // Distance to the line segment in this cell
      d=segmentz(c-vec3(0,0,i),.35*H1*H1+.1);
      // Audio reactivity: spectrum lookup maps each segment to a frequency band
      H1=spectrum_boost*spectrum(mix(.975,.025,H1)).z;
      // Accumulate glow: inverse-distance falloff, modulated by
      // audio, fog, and per-segment color
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


vec4 renderMain() {
  vec2
    r=RENDERSIZE
  , q=crt_distort(_uv)
  , p=(2.*q-1.)*r/r.y  // map to aspect-corrected coordinates centered at origin
#ifdef KODELIFE
  , t2=.2*time*vec2(sqrt(2.),1.)
#endif
  ;

  vec3
#ifdef KODELIFE
    RO=vec3(sin(t2),-2)
  , LA=vec3(0)
  , Z =normalize(LA-RO)
  , X =normalize(cross(Z,vec3(.2*cos(t2)+vec2(0,1.),0)))
  , Y =cross(X,Z)
  , RD=normalize(2.*Z+p.y*Y-p.x*X)
#else
    RO=cam_RO
  , LA=vec3(0)
  , RD=normalize(2.*cam_Z+p.y*cam_Y-p.x*cam_X)
#endif
  , o =vec3(0)
  ;

#ifndef KODELIFE
  vec4
    m=_loadMedia()
  ;
#endif

  o=hyperspace(RO,RD,0.);

  // Post-processing chain
  o*=mix(1.,vig(q),crt_effect);          // apply vignette
  o-=3e-2*vec3(3,2,1)*length(p+.25);     // subtle warm-toned gradient
  o=max(o,0.);
  o=tanh_approx(1.125*o);                // soft tone mapping (keeps highlights from clipping)
  o=sqrt(o)-.05;                          // gamma correction with slight black lift

  o*=mix(1.,1.5+.5*sin(_xy.y*TAU/6.), crt_effect);  // CRT scanline effect


#ifndef KODELIFE
  o=mix(o,m.xyz,m.w*mix(1.,dot(m.xyz,vec3(0.299, 0.587, 0.114)),media_mix_mode)*media_opacity);
#endif
  return vec4(o,1);
}
