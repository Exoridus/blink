import type { HelperBlock } from './helperLibrary';

export const SSF_NATIVE_MATH_HELPERS: readonly HelperBlock[] = [
    {
        provides: ['_scale'],
        nativeArithmetic: true,
        code: `float _scale(float var, float min, float max) {
  return var * (max - min) + min;
}`,
    },
    {
        provides: ['_map'],
        nativeArithmetic: true,
        code: `float _map(float value, float min, float max, float new_min, float new_max) {
  return new_min + (value - min) * (new_max - new_min) / (max - min);
}
vec2 _map(vec2 value, vec2 min, vec2 max, vec2 new_min, vec2 new_max) {
  return new_min + (value - min) * (new_max - new_min) / (max - min);
}
vec3 _map(vec3 value, vec3 min, vec3 max, vec3 new_min, vec3 new_max) {
  return new_min + (value - min) * (new_max - new_min) / (max - min);
}
vec4 _map(vec4 value, vec4 min, vec4 max, vec4 new_min, vec4 new_max) {
  return new_min + (value - min) * (new_max - new_min) / (max - min);
}`,
    },
    {
        provides: ['_smin'],
        nativeArithmetic: true,
        code: `float _smin( float a, float b, float k ) {
  float res = exp( -k*a ) + exp( -k*b );
  return -log( res )/k;
}`,
    },
    {
        provides: ['_rand'],
        nativeArithmetic: true,
        code: `float _rand(float seed){
  return fract(sin(seed) * 43758.5453123);
}
float _rand(vec2 seed) {
  return fract(sin(dot(seed, vec2(12.9898, 4.1414))) * 43758.5453);
}`,
    },
    {
        provides: ['_pulse'],
        nativeArithmetic: true,
        code: `float _pulse(float variable, float center, float width){
  return (smoothstep(center-width, center, variable)-(smoothstep(center, center+width, variable)));
}`,
    },
    {
        provides: ['_sqPulse'],
        nativeArithmetic: true,
        code: `float _sqPulse(float variable, float center, float width){
  return step(center-width, variable)-step(center+width, variable);
}`,
    },
    {
        provides: ['_inRange'],
        nativeArithmetic: true,
        code: `float _inRange(float value, float minimum, float maximum) {
  return step(minimum, value) - step(maximum, value);
}
float _inRange(vec2 value, float minimum, float maximum) {
  return _inRange(value.x, minimum, maximum) * _inRange(value.y, minimum, maximum);
}
float _inRange(vec3 value, float minimum, float maximum) {
  return _inRange(value.x, minimum, maximum) * _inRange(value.y, minimum, maximum) * _inRange(value.z, minimum, maximum);
}
float _inRange(vec4 value, float minimum, float maximum) {
  return _inRange(value.x, minimum, maximum) * _inRange(value.y, minimum, maximum) * _inRange(value.z, minimum, maximum) * _inRange(value.w, minimum, maximum);
}
float _inRange(float value) {
  return _inRange(value, 0.0, 1.0);
}
float _inRange(vec2 value) {
  return _inRange(value, 0.0, 1.0);
}
float _inRange(vec3 value) {
  return _inRange(value, 0.0, 1.0);
}
float _inRange(vec4 value) {
  return _inRange(value, 0.0, 1.0);
}`,
    },
    {
        provides: ['_triWave'],
        nativeArithmetic: true,
        code: `float _triWave(float var, float period){
  float up = (abs(mod(var,period))-period/2.0)/period;
  float down = (abs(mod(-var,period))-period/2.0)/period;
  if (mod(var, period)<period/2.0){
    return up;
  }
  else {
    return down;
  }
}`,
    },
    {
        provides: ['_pixelate'],
        nativeArithmetic: true,
        code: `float _pixelate(float x, float amount) {
  return floor(x*amount)/amount;
}
vec2 _pixelate(vec2 x, float amount) {
  return floor(x*amount)/amount;
}
vec3 _pixelate(vec3 x, float amount) {
  return floor(x*amount)/amount;
}`,
    },
    {
        provides: ['_mix3'],
        nativeArithmetic: true,
        code: `float _mix3(float val1, float val2, float val3, float mixVal){
  mixVal *= 2.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  return mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
}
vec2 _mix3(vec2 val1, vec2 val2, vec2 val3, float mixVal){
  mixVal *= 2.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  return mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
}
vec3 _mix3(vec3 val1, vec3 val2, vec3 val3, float mixVal){
  mixVal *= 2.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  return mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
}
vec4 _mix3(vec4 val1, vec4 val2, vec4 val3, float mixVal){
  mixVal *= 2.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  return mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
}`,
    },
    {
        provides: ['_mix4'],
        nativeArithmetic: true,
        code: `float _mix4(float val1, float val2, float val3, float val4, float mixVal){
  mixVal *= 3.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
  float firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
  return mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal));
}
vec2 _mix4(vec2 val1, vec2 val2, vec2 val3, vec2 val4, float mixVal){
  mixVal *= 3.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
  vec2 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
  return mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal));
}
vec3 _mix4(vec3 val1, vec3 val2, vec3 val3, vec3 val4, float mixVal){
  mixVal *= 3.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
  vec3 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
  return mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal));
}
vec4 _mix4(vec4 val1, vec4 val2, vec4 val3, vec4 val4, float mixVal){
  mixVal *= 3.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
  vec4 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
  return mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal));
}`,
    },
    {
        provides: ['_mix5'],
        nativeArithmetic: true,
        code: `float _mix5(float val1, float val2, float val3, float val4, float val5, float mixVal){
  mixVal *= 4.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
  float mix4 = clamp(mixVal-3.0, 0.0, 1.0);
  float firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
  float third = mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal));
  float fourth = mix(third, mix(val4, val5, mix4), step(3.0, mixVal));
  return fourth;
}
vec2 _mix5(vec2 val1, vec2 val2, vec2 val3, vec2 val4, vec2 val5, float mixVal){
  mixVal *= 4.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
  float mix4 = clamp(mixVal-3.0, 0.0, 1.0);
  vec2 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
  vec2 third = mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal));
  vec2 fourth = mix(third, mix(val4, val5, mix4), step(3.0, mixVal));
  return fourth;
}
vec3 _mix5(vec3 val1, vec3 val2, vec3 val3, vec3 val4, vec3 val5, float mixVal){
  mixVal *= 4.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
  float mix4 = clamp(mixVal-3.0, 0.0, 1.0);
  vec3 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
  vec3 third = mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal));
  vec3 fourth = mix(third, mix(val4, val5, mix4), step(3.0, mixVal));
  return fourth;
}
vec4 _mix5(vec4 val1, vec4 val2, vec4 val3, vec4 val4, vec4 val5, float mixVal){
  mixVal *= 4.0;
  float mix1 = clamp(mixVal,0.0,1.0);
  float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
  float mix3 = clamp(mixVal-2.0, 0.0, 1.0);
  float mix4 = clamp(mixVal-3.0, 0.0, 1.0);
  vec4 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal));
  vec4 third = mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal));
  vec4 fourth = mix(third, mix(val4, val5, mix4), step(3.0, mixVal));
  return fourth;
}`,
    },
    {
        provides: ['_nsin'],
        nativeArithmetic: true,
        code: `float _nsin(float valIn){
  return 0.5+0.5*sin(valIn);
}`,
    },
    {
        provides: ['_ncos'],
        nativeArithmetic: true,
        code: `float _ncos(float valIn){
  return 0.5+0.5*cos(valIn);
}`,
    },
    {
        provides: ['_nclamp'],
        nativeArithmetic: true,
        code: `float _nclamp(float var){
  return clamp(var, 0.0, 1.0);
}
vec2 _nclamp(vec2 var){
  return clamp(var, vec2(0.0), vec2(1.0));
}
vec3 _nclamp(vec3 var){
  return clamp(var, vec3(0.0), vec3(1.0));
}
vec4 _nclamp(vec4 var){
  return clamp(var, vec4(0.0), vec4(1.0));
}`,
    },
    {
        provides: [
            '_hash11',
            '_hash12',
            '_hash13',
            '_hash21',
            '_hash22',
            '_hash23',
            '_hash31',
            '_hash32',
            '_hash33',
            '_hash41',
            '_hash42',
            '_hash43',
            '_hash44',
        ],
        nativeArithmetic: true,
        code: `float _hash11(float p) {
  p = fract(p * .1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float _hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float _hash13(vec3 p3) {
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 _hash21(float p) {
  vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx+p3.yz)*p3.zy);
}
vec2 _hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.xx+p3.yz)*p3.zy);
}
vec2 _hash23(vec3 p3) {
  p3 = fract(p3 * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.xx+p3.yz)*p3.zy);
}
vec3 _hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.xxy+p3.yzz)*p3.zyx);
}
vec3 _hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz+33.33);
  return fract((p3.xxy+p3.yzz)*p3.zyx);
}
vec3 _hash33(vec3 p3) {
  p3 = fract(p3 * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz+33.33);
  return fract((p3.xxy + p3.yxx)*p3.zyx);
}
vec4 _hash41(float p) {
  vec4 p4 = fract(vec4(p) * vec4(.1031, .1030, .0973, .1099));
  p4 += dot(p4, p4.wzxy+33.33);
  return fract((p4.xxyz+p4.yzzw)*p4.zywx);
}
vec4 _hash42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(.1031, .1030, .0973, .1099));
  p4 += dot(p4, p4.wzxy+33.33);
  return fract((p4.xxyz+p4.yzzw)*p4.zywx);
}
vec4 _hash43(vec3 p) {
  vec4 p4 = fract(vec4(p.xyzx) * vec4(.1031, .1030, .0973, .1099));
  p4 += dot(p4, p4.wzxy+33.33);
  return fract((p4.xxyz+p4.yzzw)*p4.zywx);
}
vec4 _hash44(vec4 p4) {
  p4 = fract(p4 * vec4(.1031, .1030, .0973, .1099));
  p4 += dot(p4, p4.wzxy+33.33);
  return fract((p4.xxyz+p4.yzzw)*p4.zywx);
}`,
    },
    {
        provides: ['_noise'],
        requires: ['_rand', '_perm'],
        nativeArithmetic: true,
        code: `float _noise(float seed){
  float _floor = floor(seed);
  float _remainder = fract(seed);
  return mix(_rand(_floor), _rand(_floor + 1.0), _remainder);
}
float _noise(vec2 seed) {
  const vec2 d = vec2(0.0, 1.0);
  vec2 _floor = floor(seed);
  vec2 _remainder = smoothstep(vec2(0.0), vec2(1.0), fract(seed));
  return mix(mix(_rand(_floor), _rand(_floor + d.yx), _remainder.x), mix(_rand(_floor + d.xy), _rand(_floor + d.yy), _remainder.x), _remainder.y);
}
float _noise(vec3 p){
  vec3 a = floor(p);
  vec3 d = p - a;
  d = d * d * (3.0 - 2.0 * d);
  vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
  vec4 k1 = _perm(b.xyxy);
  vec4 k2 = _perm(k1.xyxy + b.zzww);
  vec4 c = k2 + a.zzzz;
  vec4 k3 = _perm(c);
  vec4 k4 = _perm(c + 1.0);
  vec4 o1 = fract(k3 * (1.0 / 41.0));
  vec4 o2 = fract(k4 * (1.0 / 41.0));
  vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
  vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);
  return o4.y * d.y + o4.x * (1.0 - d.y);
}`,
    },
    {
        provides: ['_fbm'],
        requires: ['_noise'],
        nativeArithmetic: true,
        code: `float _fbm(float position, float octaves) {
  float v = 0.0;
  float a = 0.5;
  float shift = float(100.0);
  for (int i = 0; float(i) < octaves; ++i) {
    v += a * _noise(position);
    position = position * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}
float _fbm(vec2 position, float octaves) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
  for (int i = 0; float(i) < octaves; ++i) {
    v += a * _noise(position);
    position = rot * position * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}
float _fbm(vec3 position, float octaves) {
  float v = 0.0;
  float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; float(i) < octaves; ++i) {
    v += a * _noise(position);
    position = position * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}
float _fbm(float position) {
  return _fbm(position, 5.0);
}
float _fbm(vec2 position) {
  return _fbm(position, 5.0);
}
float _fbm(vec3 position) {
  return _fbm(position, 5.0);
}`,
    },
    {
        provides: ['_statelessContinuousChaotic'],
        nativeArithmetic: true,
        code: `float _statelessContinuousChaotic(float t){
  float primes[10] = float[](2.0,3.0,5.0,7.0,11.0,13.0,17.0,19.0,23.0,29.0);
  float chaosTotal = 0.0;
  for (int i = 0; i<10; i++){
    chaosTotal+=float(i)*sin(primes[i]*t);
  }
  return sin(chaosTotal);
}`,
    },
    {
        provides: ['_uv2uvc'],
        nativeArithmetic: true,
        code: `void _uv2uvc(inout vec2 posIn){
  posIn *= 2.0;
  posIn -= 1.0;
}`,
    },
    {
        provides: ['_uvc2uv'],
        nativeArithmetic: true,
        code: `void _uvc2uv(inout vec2 posIn){
  posIn *= 0.5;
  posIn += 0.5;
}`,
    },
    {
        provides: ['_rotate'],
        nativeArithmetic: true,
        code: `vec2 _rotate(vec2 v, float t) {
  mat2 T = mat2(cos(t), -sin(t), sin(t), cos(t));
  return T*v;
}`,
    },
    {
        provides: ['_mirror'],
        nativeArithmetic: true,
        code: `float _mirror(float x) {
  if (mod(floor(x), 2.0) == 1.0) x = 1.0-x;
  return mod(x, 1.0);
}
vec2 _mirror(vec2 xy) {
  xy.x = _mirror(xy.x);
  xy.y = _mirror(xy.y);
  return xy;
}
vec3 _mirror(vec3 xyz) {
  xyz.x = _mirror(xyz.x);
  xyz.y = _mirror(xyz.y);
  xyz.z = _mirror(xyz.z);
  return xyz;
}
vec4 _mirror(vec4 xyzw) {
  xyzw.x = _mirror(xyzw.x);
  xyzw.y = _mirror(xyzw.y);
  xyzw.z = _mirror(xyzw.z);
  xyzw.w = _mirror(xyzw.w);
  return xyzw;
}`,
    },
    {
        provides: ['_toPolar'],
        nativeArithmetic: true,
        code: `vec2 _toPolar(vec2 v) {
  return vec2(length(v), atan(v.y/v.x));
}`,
    },
    {
        provides: ['_toPolarTrue'],
        nativeArithmetic: true,
        code: `vec2 _toPolarTrue(vec2 uv){
  float r = length(uv);
  float theta = 0.0;
  float real = uv.x;
  float imag = uv.y;
  if (real > 0.0 && imag >= 0.0) theta = atan(imag/real);
  if (real <= 0.0 && imag > 0.0) theta = -1.0*atan(real/imag)+PI/2.0;
  if (real < 0.0 && imag <= 0.0) theta = atan(imag/real)+PI;
  if (real >= 0.0 && imag < 0.0) theta = -1.0*atan(real/imag)+3.0*PI/2.0;
  theta = theta/(2.0*PI);
  return vec2(r, theta);
}`,
    },
    {
        provides: ['_toRect'],
        nativeArithmetic: true,
        code: `vec2 _toRect(vec2 v) {
  return vec2(v.r * cos(v.t), v.r * sin(v.t));
}`,
    },
    {
        provides: ['_rgb2hsv'],
        nativeArithmetic: true,
        code: `vec3 _rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}`,
    },
    {
        provides: ['_hsv2rgb'],
        nativeArithmetic: true,
        code: `vec3 _hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}`,
    },
    {
        provides: ['_normalizeRGB'],
        nativeArithmetic: true,
        code: `vec3 _normalizeRGB(float r, float g, float b) {
  r = clamp(r,0.0,255.0);
  g = clamp(g,0.0,255.0);
  b = clamp(b,0.0,255.0);
  return vec3(r,g,b)/255.0;
}`,
    },
    {
        provides: ['_palette'],
        nativeArithmetic: true,
        code: `vec3 _palette(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
  return a + b*cos( 6.28318*(c*t+d) );
}`,
    },
    {
        provides: ['_brightness'],
        nativeArithmetic: true,
        code: `vec4 _brightness(vec4 color, float brightness){
  return color * brightness;
}
vec3 _brightness(vec3 color, float brightness){
  return color * brightness;
}`,
    },
    {
        provides: ['_gamma'],
        nativeArithmetic: true,
        code: `vec3 _gamma(vec3 color, float gamma){
  color.rgb = pow(color.rgb, 1.0/vec3(gamma));
  return color;
}
vec4 _gamma(vec4 color, float gamma){
  color.rgb = _gamma(color.rgb, gamma);
  return color;
}`,
    },
    {
        provides: ['_contrast'],
        nativeArithmetic: true,
        code: `vec3 _contrast(vec3 color, float contrast) {
  color = (color - 0.5) * contrast + 0.5;
  return color;
}
vec4 _contrast(vec4 color, float contrast) {
  color.rgb = _contrast(color.rgb, contrast);
  return color;
}`,
    },
    {
        provides: ['_luminance'],
        nativeArithmetic: true,
        code: `float _luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}
float _luminance(vec4 color) {
  return _luminance(color.rgb);
}`,
    },
    {
        provides: ['_saturation'],
        requires: ['_rgb2hsv', '_hsv2rgb'],
        nativeArithmetic: true,
        code: `vec3 _saturation(vec3 color, float saturation) {
  vec3 hsv = _rgb2hsv(color);
  hsv.y *= saturation;
  return _hsv2rgb(hsv);
}
vec4 _saturation(vec4 color, float saturation) {
  color.rgb = _saturation(color.rgb, saturation);
  return color;
}`,
    },
    {
        provides: ['_hueRotate'],
        nativeArithmetic: true,
        code: `vec3 _hueRotate(vec3 color, float rot) {
  float hue = radians(rot);
  const vec3 k = vec3(0.57735, 0.57735, 0.57735);
  float cosAngle = cos(hue);
  return vec3(color * cosAngle + cross(k, color) * sin(hue) + k * dot(k, color) * (1.0 - cosAngle));
}
vec4 _hueRotate(vec4 color, float rot) {
  color.rgb = _hueRotate(color.rgb, rot);
  return color;
}`,
    },
    {
        provides: ['_invert'],
        nativeArithmetic: true,
        code: `vec3 _invert(vec3 color, float invert) {
  return mix(color, 1.0-color, invert);
}
vec4 _invert(vec4 color, float invert) {
  return mix(color, 1.0-color, invert);
}`,
    },
    {
        provides: ['_grayscale'],
        requires: ['_luminance'],
        nativeArithmetic: true,
        code: `vec3 _grayscale(vec3 rgb, float intensity){
  float luminance = _luminance(rgb);
  return mix(rgb, vec3(luminance), clamp(intensity, 0.0, 1.0));
}
vec4 _grayscale(vec4 rgba, float intensity){
  rgba.rgb = _grayscale(rgba.rgb, intensity);
  return rgba;
}
vec3 _grayscale(vec3 rgb){
  return _grayscale(rgb, 1.0);
}
vec4 _grayscale(vec4 rgba){
  return _grayscale(rgba, 1.0);
}`,
    },
    {
        provides: ['_dichrome'],
        requires: ['_luminance'],
        nativeArithmetic: true,
        code: `vec3 _dichrome(vec3 color, vec3 lowColor, vec3 highColor) {
  float luminance = _luminance(color);
  luminance = sqrt(luminance);
  luminance *= 3.0;
  vec3 black = vec3(0.0);
  vec3 white = vec3(1.0);
  if (luminance <= 1.0){
    color = mix(black, lowColor, clamp(luminance,0.0,1.0));
  }
  else if (luminance <= 2.0){
    color = mix(lowColor, highColor, clamp(luminance-1.0,0.0,1.0));
  }
  else if (luminance <= 3.0){
    color = mix(highColor, white, clamp(luminance-2.0,0.0,1.0));
  }
  return color;
}
vec4 _dichrome(vec4 color, vec3 lowColor, vec3 highColor) {
  color.rgb = _dichrome(color.rgb, lowColor, highColor);
  return color;
}`,
    },
    {
        provides: ['_hueSaturationContrast', '_hueSaturationContrastLEGACY'],
        requires: ['_hueSaturation', '_applyContrast', '_hueSaturationLEGACY'],
        nativeArithmetic: true,
        code: `vec4 _hueSaturationContrast(vec4 colIn, float hue, float saturation, float contrast){
  colIn = _hueSaturation(colIn, hue, saturation);
  colIn = _applyContrast(colIn);
  return colIn;
}
vec4 _hueSaturationContrastLEGACY(vec4 colIn, float hue, float saturation, float contrast){
  colIn = _hueSaturationLEGACY(colIn, hue, saturation);
  colIn = _applyContrast(colIn);
  return colIn;
}`,
    },
    {
        provides: ['_invertImage'],
        requires: ['_applyInvertMedia'],
        nativeArithmetic: true,
        code: `vec4 _invertImage(vec4 colIn){
  return _applyInvertMedia(colIn);
}`,
    },
];
