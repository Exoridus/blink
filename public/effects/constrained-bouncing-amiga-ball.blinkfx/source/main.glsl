// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
const vec4 hsv2rgb_K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);

// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
//  Macro version of above to enable compile-time constants
#define HSV2RGB(c)  (c.z * mix(hsv2rgb_K.xxx, clamp(abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www) - hsv2rgb_K.xxx, 0.0, 1.0), c.y))

// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www);
  return c.z * mix(hsv2rgb_K.xxx, clamp(p - hsv2rgb_K.xxx, 0.0, 1.0), c.y);
}
#define ROT(a)      mat2(cos(a), sin(a), -sin(a), cos(a))

const float
  TAU=2.*PI
, PI_2=.5*PI
;

#ifdef KODELIFE
#define syn_BassHits (.5+.5*sin(TAU*TIME))

const float
  crt_effect      =1.
, low_bass_edge   =.5
, high_bass_edge  =1.
, main_bass_gain  =0.5
, min_bass_gain   =1.
, max_bass_gain   =1.5
, reflection_mode =.9
, sky_mode        =1.
, sun_mode        =1.
, denoise_level   =7.
, motion_blur     =.2
;
#endif

float fft(float x) {
#ifdef KODELIFE
  return .5+.5*sin(.2*x*+10.*TIME);
#else
  return textureLod(syn_Spectrum,.05+.85*(.5+.5*sin(x*.2)),0).y;
#endif
}

#ifdef KODELIFE
mat3 rot_axis(vec3 axis, float angle) {
  float
    c = cos(angle)
  , s = sin(angle)
  , t = 1. - c
  ;
  vec3
    a = normalize(axis)
  ;
  return mat3(
    t*a.x*a.x + c,      t*a.x*a.y - s*a.z,  t*a.x*a.z + s*a.y,
    t*a.x*a.y + s*a.z,  t*a.y*a.y + c,      t*a.y*a.z - s*a.x,
    t*a.x*a.z - s*a.y,  t*a.y*a.z + s*a.x,  t*a.z*a.z + c
  );
}
#endif


mat3 angle() {
#ifdef KODELIFE
  return rot_axis(vec3(1,0,0),TIME);
#else
  return mat3(u_rot_x, u_rot_y, u_rot_z);
#endif
}

// License: Unknown, author: Unknown, found: don't remember
float hash(float co) {
  return fract(sin(co*12.9898) * 13758.5453);
}

// License: Unknown, author: Unknown, found: don't remember
float hash(vec3 r)  {
  return fract(sin(dot(r.xy,vec2(1.38984*sin(r.z),1.13233*cos(r.z))))*653758.5453);
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

vec3 sphere_pos() {
#ifdef KODELIFE
  float
    B=fract(TIME*.5)-.5
  ;
  B*=B;
  B=(1.-4.*B)*3.-3.;
  return vec3(0,B,0);
#else
  return u_sphere_pos;
#endif
}

// License: Unknown, author: Unknown, found: don't remember
float hash(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233))) * 13758.5453);
}

// License: Unknown, author: catnip, found: FieldFX discord
vec3 point_on_sphere(vec2 r) {
  r=vec2(PI*2.*r.x, 2.*r.y-1.);
  return vec3(sqrt(1. - r.y * r.y) * vec2(cos(r.x), sin(r.x)), r.y);
}

// License: Unknown, author: catnip, found: FieldFX discord
vec3 uniform_lambert(vec2 r, vec3 n) {
  return normalize(n*(1.001) + point_on_sphere(r)); // 1.001 required to avoid NaN
}

vec3 noisy_ray_dir(vec2 r, vec2 uv, vec3 cam_right, vec3 cam_up, vec3 cam_fwd) {
  uv += (-1. + 2.*r) / RENDERSIZE.y;
  return normalize(-uv.x*cam_right + uv.y*cam_up + 2.*cam_fwd);
}

// License: Unknown, author: Unknown, found: don't remember
vec2 hash2(float co) {
  return fract(sin(co*vec2(12.9898,78.233))*43758.5453);
}

vec4 amiga(mat3 R, vec3 p) {
  p*=R;
  vec2 pp=clamp(.5+.5*vec2(p.z,.25*p.y/p.x),1./512.,511./512.);
  vec4 tcol=textureLod(tex_amiga, pp, 0.);
  return tcol;
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/intersectors/
float ray_sphere_1(vec3 ro, vec3 rd) {
  float
    b=dot(ro, rd)
  , c=dot(ro, ro)-1.
  , h=b*b-c
  ;
  if(h<.0) return -1.;
  return -b-sqrt(h);
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/intersectors/
float ray_isphere_4(vec3 ro, vec3 rd) {
  float
    b = dot(ro, rd)
  , c = dot(ro, ro)-16.
  , h = b*b-c
  , t
  ;
  if (h<0.) return -1.;
  return -b+sqrt(h);
}

float L4(vec3 p) {
  return sqrt(length(p*p));
}


// License: MIT, author: Pascal Gilcher, found: https://www.shadertoy.com/view/flSXRV
float atan_approx(float y, float x) {
  float cosatan2 = x/(abs(x)+abs(y));
  float t = PI_2-cosatan2*PI_2;
  return y<0.?-t:t;
}

float acos_approx(float x) {
  float
    ax = abs(x)
  , r  = ax*(-.0187293*ax+.0742610)-.2121144
  ;
  r = (r*ax+PI_2)*sqrt(1.-ax);
  return x<0.?PI-r:r;
}

vec3 to_spherical_approx(vec3 p) {
  float
    r = length(p)
  ;
  return vec3(r, acos_approx(p.z/r), atan_approx(p.y, p.x));
}

vec3 sun(vec3 R, float bh) {
  const vec3
    sun_dir=normalize(vec3(1,.5,0))
  , sun_col=HSV2RGB(vec3(.78,.9,1e-2))
  , fog_col=HSV2RGB(vec3(.58,1.,0.05))
  ;
  
  vec3 
    col=vec3(0)
  ;
  col += (1.-R.y*R.y)*fog_col;
  col+=(sun_mode/(1.001+dot(R, sun_dir)))*(bh*5e-3+sun_col);
  
  return col;
}

vec3 stars(vec3 R, float bh) {
  float
    Z=TAU/200.
  ;

  vec3
    col=sun(R, bh);
  ;
  float
    a=1.
  , o=1.-dot(vec3(0.2126, 0.7152, 0.0722),col)
  ;
  for(int i=0;i<3;++i) {
    R=R.zxy;
    vec2
      s=to_spherical_approx(R).yz
    , n=floor(s/Z+.5)
    , c=s-Z*n
    ;

    float
      h=sin(s.x)
    , h0=hash(n+123.4*float(i+1))
    , h1=fract(8887.*h0)
    , h3=fract(9677.*h0)
    ;
    c.y*=h;

    col += a*hsv2rgb(vec3(-.4*h1,(h3)+.2,o*step(h0,.1*h)*h1*vec3(1e-6)/(7e-8+dot(c,c))));
    Z*=.5;
    a*=.5;
  }
  return col;
}


vec4 pass_main() {
  vec3
    ro        = vec3(3,1,3.)
  ;

#ifdef KODELIFE
  ro.xz*=ROT(.25*TIME);
  ro.xy*=ROT(.1234*TIME);
#else
  ro.xz*=ROT(rotation_speed_0);
  ro.xy*=ROT(rotation_speed_1);
#endif
  vec3
    la        = vec3(0,-2,0.)
  , cam_fwd   = normalize(la - ro)
  , cam_right = normalize(cross(cam_fwd, vec3(0,1,0)))
  , cam_up    = cross(cam_right, cam_fwd)
  ;

  vec2
    p=2.*_uvc
  ;

  int
    max_iter=int(denoise_level)
  ;

  float
    samples = 0.
  , fresnel
  , fade_out=.005
  , t
  , throughput
  , t_sphere
  , t_isphere
  , seed
  , h0
  , h1
  , d
  , f
  , ha=0.
  , bh=main_bass_gain*mix(min_bass_gain,max_bass_gain,syn_BassHits)
  , as=mix(3.,1.5,crt_effect)
  ;

  vec2
    r=vec2(0)
  ;

  mat3 R=angle();

  seed = fract(hash(p) + float(FRAMECOUNT)/1337.);

  vec3
    sphere_center = sphere_pos()
  , col           = vec3(0)
  , pos
  , prev_pos
  , prev_normal
  , normal
  , reflect_dir
  , diffuse_dir
  , y=vec3(0)
  , s=vec3(0)
  ;

  vec4
    acol
  ;

  bool
    missed
  , hit_amiga
  , hit_grid
  , hit_fft
  ;

  prev_pos    = ro;
  prev_normal = noisy_ray_dir(r, p, cam_right, cam_up, cam_fwd);
  throughput  = 1.;

  pos = prev_pos - sphere_center;
  t_sphere=ray_sphere_1(pos, prev_normal);
  normal = reflect(prev_normal, pos+prev_normal*t_sphere);

  y=sky_mode*stars(prev_normal,syn_BassHits);
  s=sun(normal,syn_BassHits);

  for(int j=0; j<max_iter; ++j)
  for(int i=0; i<10; ++i) {
    ++seed;
    r=hash2(seed);

    pos = prev_pos - sphere_center;
    t_sphere  = ray_sphere_1(pos, prev_normal);
    t_isphere = ray_isphere_4(prev_pos, prev_normal);

    t = 1e3;
    if(t_sphere>0. && t_sphere<t)   { t=t_sphere      ; normal = (pos + prev_normal*t); }
    if(t_isphere>0. && t_isphere<t) { t=t_isphere     ; normal = -.25*(prev_pos + prev_normal*t_isphere); }

    pos = prev_pos + prev_normal*t;

    vec3
      n = floor(pos+.5)
    , c = abs(pos-n)
    ;

    h0=hash(n+.123);
    h1=fract(8667.*h0);

    fresnel = 1. + dot(prev_normal, normal);
    f=fft(h0)*bh;
    f*=f;
    f+=.2;
    f=clamp(f,0.,1.);
    d=(L4(c)-.4*f);

    if (t==t_sphere&&throughput==1.) ++ha;

    missed      = t==1e3 || throughput<1e-1;
    hit_amiga   = t==t_sphere ? (acol=amiga(R, pos-sphere_center), true) : false;

    f=smoothstep(low_bass_edge,high_bass_edge,f);

    hit_amiga = hit_amiga && r.y*r.y>fresnel;
    hit_grid    = t==t_isphere && (c.x<.01||c.y<.01||c.z<.01) && r.x>.5;
    hit_fft     = t==t_isphere && (abs(d)<.01 || f*5e-4/max(d*mix(d,abs(d),step(.8,f)),1e-4)>r.x) ;

    if(missed || hit_amiga || hit_grid ||hit_fft) {
      throughput/=(1.+fade_out*t*t);

      vec3 tc=vec3(0);
      if (hit_grid) {
        tc += .5+.5*sin(3.+.5*pos.y+vec3(2,1,0));
      }

      if (hit_fft) {
        tc += (1.+f-d) + sin(pos.y+TIME+.3*h0+vec3(0,1,2));
      }

      if (hit_amiga) {
        tc +=as*sqrt(max(0.,-dot(prev_normal,normal)))*acol.xyz;
      }

      col += throughput*tc;

      prev_pos    = ro;
      prev_normal = noisy_ray_dir(r, p, cam_right, cam_up, cam_fwd);
      throughput  = 1.;

      ++samples;
      continue;
    }

    reflect_dir = reflect(prev_normal, normal);
    diffuse_dir = uniform_lambert(r, reflect_dir);
    diffuse_dir = normalize(mix(diffuse_dir, reflect_dir, reflection_mode));

    if(t==t_sphere) {
      prev_normal = reflect_dir;
      throughput *= .9;
    } else {
      prev_normal = diffuse_dir;
      throughput *= .3;
    }

    throughput/=(1.+fade_out*t*t);

    prev_pos = pos + 1e-3*normal;
  }

  col /= max(samples, 1.);
  col+=mix(y, s, ha/samples);
  return vec4(col, 1.);
}

float dot2(vec3 p) {
  return dot(p,p);
}

vec3 denoise(ivec2 xy) {
  const int
    MAX=3
  ;
  const float
    DIV=1./float(MAX*MAX)
  ;
  vec3
    center  = texelFetch(passMain, xy, 0).xyz
  , s
  , sum     = center
  ;
  float
    w
  , weight = 1.0
  ;
  for(int dy = -MAX; dy <= MAX; ++dy)
  for(int dx = -MAX; dx <= MAX; ++dx) {
    if(dx == 0 && dy == 0) continue;

    s = texelFetch(passMain, xy + ivec2(dx, dy), 0).xyz;
    w=exp(-float(dx*dx + dy*dy) * DIV-dot2(s - center) *1E1);
    sum += s * w;
    weight += w;
  }

  return sum / weight;
}


vec4 pass_denoise() {
  ivec2
    xy=ivec2(_xy)
  ;
  vec3
    col=denoise(xy)
  , pcol=texelFetch(passDenoise, xy,0).xyz
  ;

  pcol=mix(pcol,vec3(0),isnan(pcol));

  col=mix(col,pcol,motion_blur);
  return vec4(col,1);
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

vec4 pass_post() {
  ivec2
    xy=ivec2(_xy)
  ;

  vec2
    q=crt_distort(_uv)
  ;

  vec3
    col=textureLod(passDenoise, q, 0.).xyz
  ;
  col *= mix(1.,vig(q),crt_effect);
  col -=1e-2*vec3(2,3,1);
  col=max(col,0.);
  col *= 1.5;
  col=aces_approx(col);
  col=sqrt(col)-.05;

  col*=mix(1.,1.5+.5*sin(_xy.y*TAU/6.), crt_effect);

#ifndef KODELIFE
  vec4 mcol=_loadMedia();
  col=mix(col,mcol.xyz,media_opaque*mix(dot(mcol.xyz,vec3(0.299, 0.587, 0.114)), mcol.w, mix_mode));
#endif


  return vec4(col,1);
}

vec4 renderMain() {
  switch(PASSINDEX) {
  case 0:
    return pass_main();
  case 1:
    return pass_denoise();
  default:
    return pass_post();
  }
}