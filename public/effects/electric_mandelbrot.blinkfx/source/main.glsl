// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

#ifdef KODELIFE
const vec2
  initial_c             = vec2(-.76,.15)
, color_control         = vec2(1,2)
, motion_blur_intensity = vec2(.5,.9)
, motion_blur_limits    = vec2(.5,1.5)
, rotation_c            = vec2(.2,.289)
, twist_beat            = vec2(0)
, zoom_beat             = vec2(.5,0)
, zoom_center           = vec2(.5,-.05)
, zoom_factor           = vec2(.75,.125)
;

const float
  color_divider   = 9.
, fade_beat       = 0.
, invert_color    = 0.
, rotation_speed        = .3
;
#endif

void rot(inout vec2 p, float a) {
  float
    c=cos(a)
  , s=sin(a)
  ;
  p = vec2(c*p.x+s*p.y,c*p.y-s*p.x);
}

float beat() {
#ifdef KODELIFE
  return pow(1.-fract(TIME),2.);
#else
  return dot(pow(vec2(syn_BassLevel,syn_BassHits), bass_pow), bass_mix);
#endif
}

float freq(float x) {
#ifdef KODELIFE
  return 0.;
#else
  return texture(syn_Spectrum,.5+.45*sin(x)).y;
#endif
}

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
vec3 tanh_approx(vec3 x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

vec4 renderMain() {
  const float
    maxIterF = 80.
  ;

#ifdef KODELIFE
  float
    tm = .5*TIME
#else
  float
    tm = dot(speed_control,vec2(TIME, syn_BassTime))
#endif
  , i
  , l
  , D
  , L
  , B=beat()
  , re2
  , im2
  , reim
  , mag2=0.
  , shd
  , F=mix(1.,2.*B, fade_beat)
  ;

  vec2
    q   = _uv
  , p   = 2.*_uvc
  , c   = initial_c
  , z
  ;

  vec3
    col = vec3(0)
  ;

  D=dot(p,p);
  L=sqrt(D);
  p*=mix(1.,1./(1.+dot(zoom_beat, vec2(L,D))),B);
  rot(p,rotation_speed+dot(B*twist_beat,vec2(L,D)));
  p = zoom_center + zoom_factor.x*pow(zoom_factor.y, 0.5+0.5*cos(0.3*sqrt(2.0)*tm))*p;

  z=p;
  rot(c, rotation_c.x*sin(rotation_c.y*tm));

  for(i=0.; i<maxIterF; ++i) {
    re2  = z.x*z.x;
    im2  = z.y*z.y;
    mag2 = re2+im2;
    reim = z.x*z.y;
    z = vec2(re2 - im2+c.x, 2.*reim+c.y);

    shd = F*smoothstep(maxIterF, 0., i);
    shd /= mag2+.01;
    col+=shd*3e-3/abs(z.y+.1*(freq(2.*z.x)-.5))*(1.+sin(vec3(4.*z, 0.2*i)+vec3(0,color_control)));
    if (mag2>20.) break;
  }
  l = i - log2(log2(dot(z,z)));

  col /= color_divider;
  if (!isnan(l)) {
    col += F/(1.+l*l)*(0.5 + 0.5*cos(l*.5 + 3.+ vec3(0,2.*color_control)));
  }
  col = clamp(col,0.,9.);
  col = tanh_approx(col);
  col = mix(col, 1.-col, invert_color);

  col = max(col,0.);
  vec4 pcol = texture(syn_FinalPass, q);
  col.xyz = mix(col, pcol.xyz, mix(motion_blur_intensity.x, motion_blur_intensity.y, smoothstep(motion_blur_limits.x, motion_blur_limits.y, L)));

#ifdef KODELIFE
#else
  vec4 mcol=_loadMedia(media_warp.x*normalize(p)*freq(media_warp.y*L));
  col=mix(col,mcol.xyz,mcol.w*media_opacity*media_multiplier);
#endif
  return vec4(col, 1);
}

