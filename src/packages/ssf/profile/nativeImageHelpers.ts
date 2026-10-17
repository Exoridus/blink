import type { HelperBlock } from './helperLibrary';

export const SSF_NATIVE_IMAGE_HELPERS: readonly HelperBlock[] = [
    {
        provides: ['_isMediaActive'],
        nativeArithmetic: true,
        code: `bool _isMediaActive() {
  return syn_MediaType > 0.5;
}`,
    },
    {
        provides: ['_correctMediaCoords'],
        requires: ['_correctImageCoords', '_mediaSize'],
        nativeArithmetic: true,
        code: `vec2 _correctMediaCoords(vec2 uv) {
  return _correctImageCoords(_mediaSize(), uv);
}
vec2 _correctMediaCoords() {
  return _correctImageCoords(_mediaSize(), _uv);
}`,
    },
    {
        provides: ['_flipMediaCoords', '_invertYAxisVideo'],
        nativeArithmetic: true,
        code: `vec2 _flipMediaCoords(vec2 pos) {
  if (syn_MediaType > 1.5 && syn_MediaType < 2.5) {
    pos.y = 1.0 - pos.y;
  }
  else if (syn_MediaType > 2.5 && syn_MediaType < 3.5) {
    pos.x = 1.0 - pos.x;
    pos.y = 1.0 - pos.y;
  }
  if (_Hor_Flip > 0.5) pos.x = 1.0 - pos.x;
  if (_Vert_Flip > 0.5) pos.y = 1.0 - pos.y;
  return pos;
}
vec2 _invertYAxisVideo(vec2 pos){
  return _flipMediaCoords(pos);
}`,
    },
    {
        provides: ['_applyMediaScale'],
        nativeArithmetic: true,
        code: `vec2 _applyMediaScale(vec2 uv) {
  return (uv - 0.5) / pow(2., (_Media_Scale - 1.) * 5.) + 0.5;
}`,
    },
    {
        provides: ['_applyMediaContrast'],
        requires: ['_contrast'],
        nativeArithmetic: true,
        code: `vec4 _applyMediaContrast(vec4 color) {
  float contrast = _Media_Contrast;
  if (contrast > 1.0) contrast *= contrast;
  return _contrast(color, contrast);
}`,
    },
    {
        provides: ['_applyInvertMedia'],
        requires: ['_invert'],
        nativeArithmetic: true,
        code: `vec4 _applyInvertMedia(vec4 colIn) {
  return _invert(colIn, _Invert_Media);
}`,
    },
    {
        provides: ['_loadMedia', '_textureMedia'],
        requires: ['_applyMediaScale', '_correctImageCoords', '_inRange'],
        samplers: ['syn_Media'],
        nativeArithmetic: true,
        code: `vec4 _loadMedia() {
  vec2 uv = _applyMediaScale(_correctImageCoords(vec2(textureSize(syn_Media, 0))));
  if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0);
  return texture(syn_Media, uv);
}
vec4 _loadMedia(vec2 offset) {
  vec2 uv = _applyMediaScale(_correctImageCoords(vec2(textureSize(syn_Media, 0))));
  if (_inRange(uv + offset, 0.0, 1.0) < 0.5) return vec4(0.0);
  return texture(syn_Media, uv + offset);
}
vec4 _loadMedia(float lod) {
  vec2 uv = _applyMediaScale(_correctImageCoords(vec2(textureSize(syn_Media, int(lod)))));
  if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0);
  return textureLod(syn_Media, uv, lod);
}
vec4 _loadMedia(vec2 offset, float lod) {
  vec2 uv = _applyMediaScale(_correctImageCoords(vec2(textureSize(syn_Media, int(lod)))));
  if (_inRange(uv + offset, 0.0, 1.0) < 0.5) return vec4(0.0);
  return textureLod(syn_Media, uv + offset, lod);
}
vec4 _textureMedia(vec2 uv) {
  uv = _applyMediaScale(_correctImageCoords(vec2(textureSize(syn_Media, 0)), uv));
  return texture(syn_Media, uv);
}
vec4 _textureMedia(vec2 uv, float lod) {
  uv = _applyMediaScale(_correctImageCoords(vec2(textureSize(syn_Media, int(lod))), uv));
  return texture(syn_Media, uv, lod);
}`,
    },
    {
        provides: ['_loadMediaAsMask', '_textureMediaAsMask'],
        requires: [
            '_applyMediaScale',
            '_flipMediaCoords',
            '_correctImageCoords',
            '_inRange',
            '_applyInvertMedia',
            '_imageToMask',
        ],
        samplers: ['syn_UserImage'],
        nativeArithmetic: true,
        code: `vec4 _loadMediaAsMask() {
  vec2 uv = _applyMediaScale(_flipMediaCoords(_correctImageCoords(vec2(textureSize(syn_UserImage, 0)))));
  if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0);
  return _applyInvertMedia(_imageToMask(texture(syn_UserImage, uv)));
}
vec4 _loadMediaAsMask(vec2 offset) {
  vec2 uv = _applyMediaScale(_flipMediaCoords(_correctImageCoords(vec2(textureSize(syn_UserImage, 0)))));
  if (_inRange(uv + offset, 0.0, 1.0) < 0.5) return vec4(0.0);
  return _applyInvertMedia(_imageToMask(texture(syn_UserImage, uv + offset)));
}
vec4 _loadMediaAsMask(float lod) {
  vec2 uv = _applyMediaScale(_flipMediaCoords(_correctImageCoords(vec2(textureSize(syn_UserImage, int(lod))))));
  if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0);
  return _applyInvertMedia(_imageToMask(textureLod(syn_UserImage, uv, lod)));
}
vec4 _loadMediaAsMask(vec2 offset, float lod) {
  vec2 uv = _applyMediaScale(_flipMediaCoords(_correctImageCoords(vec2(textureSize(syn_UserImage, int(lod))))));
  if (_inRange(uv + offset, 0.0, 1.0) < 0.5) return vec4(0.0);
  return _applyInvertMedia(_imageToMask(textureLod(syn_UserImage, uv + offset, lod)));
}
vec4 _textureMediaAsMask(vec2 uv) {
  uv = _applyMediaScale(_flipMediaCoords(_correctImageCoords(vec2(textureSize(syn_UserImage, 0)), uv)));
  return _applyInvertMedia(_imageToMask(texture(syn_UserImage, uv)));
}
vec4 _textureMediaAsMask(vec2 uv, float lod) {
  uv = _applyMediaScale(_flipMediaCoords(_correctImageCoords(vec2(textureSize(syn_UserImage, int(lod))), uv)));
  return _applyInvertMedia(_imageToMask(textureLod(syn_UserImage, uv, lod)));
}`,
    },
    {
        provides: ['_loadUserImage', '_textureUserImage'],
        requires: ['_loadMedia', '_textureMedia'],
        nativeArithmetic: true,
        code: `vec4 _loadUserImage() {
  return _loadMedia();
}
vec4 _loadUserImage(vec2 offset) {
  return _loadMedia(offset);
}
vec4 _textureUserImage(vec2 uv) {
  return _textureMedia(uv);
}`,
    },
    {
        provides: ['_edgeDetectMedia', '_edgeDetectSobelMedia'],
        requires: ['_correctMediaCoords', '_inRange', '_edgeDetect', '_edgeDetectSobel'],
        samplers: ['syn_Media'],
        nativeArithmetic: true,
        code: `vec4 _edgeDetectMedia(){
  vec2 uv = _correctMediaCoords();
  if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0);
  return _edgeDetect(syn_Media, uv);
}
vec4 _edgeDetectSobelMedia() {
  vec2 uv = _correctMediaCoords();
  if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0);
  return _edgeDetectSobel(syn_Media, uv);
}`,
    },
    {
        provides: ['IMG_NORM_PIXEL', 'IMG_PIXEL', 'IMG_SIZE'],
        nativeArithmetic: true,
        code: `vec4 IMG_NORM_PIXEL(sampler2D tex, vec2 uv){
  return texture(tex, uv);
}
vec4 IMG_PIXEL(sampler2D tex, ivec2 uv){
  return texelFetch(tex, uv, 0);
}
vec4 IMG_PIXEL(sampler2D tex, vec2 uv){
  return texelFetch(tex, ivec2(uv), 0);
}
vec2 IMG_SIZE(sampler2D tex){
  return vec2(textureSize(tex, 0));
}`,
    },
    {
        provides: ['_correctImageCoords'],
        requires: ['_ratioFix'],
        nativeArithmetic: true,
        code: `vec2 _correctImageCoords(vec2 imageSize, vec2 uv) {
  float wr = RENDERSIZE.x/imageSize.x;
  float hr = RENDERSIZE.y/imageSize.y;
  float ratio = _ratioFix(wr, hr);
  vec2 correctedUv = uv;
  correctedUv.y *= hr/ratio;
  correctedUv.x *= wr/ratio;
  correctedUv.x += -wr/ratio/2.0 + 0.5;
  correctedUv.y += -hr/ratio/2.0 + 0.5;
  return correctedUv;
}
vec2 _correctImageCoords(vec2 imageSize){
  return _correctImageCoords(imageSize, _uv);
}`,
    },
    {
        provides: ['_loadImage', '_textureImage'],
        requires: ['_correctImageCoords', '_flipMediaCoords', '_inRange'],
        nativeArithmetic: true,
        code: `vec4 _loadImage(sampler2D imageName, vec2 offset, bool isRawMedia) {
  vec2 uv = _correctImageCoords(vec2(textureSize(imageName, 0)));
  if (isRawMedia) uv = _flipMediaCoords(uv);
  if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0);
  return texture(imageName, uv+offset);
}
vec4 _loadImage(sampler2D imageName) {
  return _loadImage(imageName, vec2(0.0), false);
}
vec4 _loadImage(sampler2D imageName, vec2 offset) {
  return _loadImage(imageName, offset, false);
}
vec4 _loadImage(sampler2D imageName, vec2 offset, bool isRawMedia, float lod) {
  vec2 uv = _correctImageCoords(vec2(textureSize(imageName, int(lod))));
  if (isRawMedia) uv = _flipMediaCoords(uv);
  if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0);
  return textureLod(imageName, uv+offset, lod);
}
vec4 _textureImage(sampler2D imageName, vec2 uv, bool isRawMedia) {
  uv = _correctImageCoords(vec2(textureSize(imageName, 0)), uv);
  if (isRawMedia) uv = _flipMediaCoords(uv);
  return texture(imageName, uv);
}
vec4 _textureImage(sampler2D imageName, vec2 uv) {
  return _textureImage(imageName, uv, false);
}
vec4 _textureImage(sampler2D imageName, vec2 uv, bool isRawMedia, float lod) {
  uv = _correctImageCoords(vec2(textureSize(imageName, int(lod))), uv);
  if (isRawMedia) uv = _flipMediaCoords(uv);
  return textureLod(imageName, uv, lod);
}`,
    },
    {
        provides: ['_edgeDetect', '_edgeDetectSobel'],
        requires: ['_sobelHelper'],
        nativeArithmetic: true,
        code: `vec4 _edgeDetect(sampler2D smp, vec2 uv) {
  vec4 edgeX = abs(dFdx(texture(smp, uv + 0.5/RENDERSIZE)));
  vec4 edgeY = abs(dFdy(texture(smp, uv + 0.5/RENDERSIZE)));
  return max(edgeX,edgeY);
}
vec4 _edgeDetect(sampler2D smp) {
  return _edgeDetect(smp, _uv);
}
vec4 _edgeDetectSobel(sampler2D tex, vec2 uv) {
  vec2 stepSize = 1.0 / RENDERSIZE.xy;
  float edge = _sobelHelper(stepSize.x, stepSize.y, uv, tex);
  return vec4(edge);
}
vec4 _edgeDetectSobel(sampler2D tex) {
  return _edgeDetectSobel(tex, _uv);
}`,
    },
    {
        provides: ['_hBlurTiltShift'],
        requires: ['_mirror', '_tiltShiftGauss'],
        nativeArithmetic: true,
        code: `vec4 _hBlurTiltShift(sampler2D texIn, vec2 uv, float blurAmt, float blurLoc) {
  int blur_size = 1 + int(20.0*blurAmt);
  float blur_width = 2.;
  vec4 pixval = vec4(0.);
  float tot = 0.;
  int nb = 2*blur_size+1;
  for (int x=0; x<nb; x++) {
    float x2 = blur_width*float(x-blur_size);
    vec2 ipos = uv + vec2(x2/RENDERSIZE.x, 0.);
    ipos = _mirror(ipos);
    float g = _tiltShiftGauss(x2, float(20*blur_size)*2.*pow(0.01+abs(uv.y - blurLoc), 2.3));
    pixval+= g*texture(texIn, ipos);
    tot+= g;
  }
  return pixval/tot;
}
vec4 _hBlurTiltShift(sampler2D texIn, vec2 uv, float blurAmt) {
  return _hBlurTiltShift(texIn, uv, blurAmt, 0.5);
}
vec4 _hBlurTiltShift(sampler2D texIn, vec2 uv) {
  return _hBlurTiltShift(texIn, uv, 5.0, 0.5);
}
vec4 _hBlurTiltShift(sampler2D texIn) {
  return _hBlurTiltShift(texIn, _uv, 5.0, 0.5);
}`,
    },
    {
        provides: ['_vBlurTiltShift'],
        requires: ['_mirror', '_tiltShiftGauss'],
        nativeArithmetic: true,
        code: `vec4 _vBlurTiltShift(sampler2D texIn, vec2 uv, float blurAmt, float blurLoc) {
  int blur_size = 1 + int(20.0*blurAmt);
  float blur_width = 2.;
  vec4 pixval = vec4(0.);
  float tot = 0.;
  int nb = 2*blur_size+1;
  for (int x=0; x<nb; x++) {
    float x2 = blur_width*float(x-blur_size);
    vec2 ipos = uv + vec2(0., x2/RENDERSIZE.x);
    ipos = _mirror(ipos);
    float g = _tiltShiftGauss(x2, float(20*blur_size)*2.*pow(0.01+abs(uv.y - blurLoc), 2.3));
    pixval+= g*texture(texIn, ipos);
    tot+= g;
  }
  return pixval/tot;
}
vec4 _vBlurTiltShift(sampler2D texIn, vec2 uv, float blurAmt) {
  return _vBlurTiltShift(texIn, uv, blurAmt, 0.5);
}
vec4 _vBlurTiltShift(sampler2D texIn, vec2 uv) {
  return _vBlurTiltShift(texIn, uv, 5.0, 0.5);
}
vec4 _vBlurTiltShift(sampler2D texIn) {
  return _vBlurTiltShift(texIn, _uv, 5.0, 0.5);
}`,
    },
    {
        provides: ['_exists'],
        nativeArithmetic: true,
        code: `bool _exists(sampler2D tex) {
  ivec2 size = textureSize(tex, 0);
  if (float(size.x) <= 1.0 && float(size.y) <= 1.0) {
    return false;
  }
  return true;
}`,
    },
    {
        provides: ['_perm'],
        requires: ['_mod289'],
        nativeArithmetic: true,
        code: `vec4 _perm(vec4 x){
  return _mod289(((x * 34.0) + 1.0) * x);
}`,
    },
    {
        provides: ['_mod289'],
        nativeArithmetic: true,
        code: `float _mod289(float x){
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
vec4 _mod289(vec4 x){
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}`,
    },
    {
        provides: ['_hueSaturation'],
        requires: ['_rgb2hsv', '_hsv2rgb'],
        nativeArithmetic: true,
        code: `vec4 _hueSaturation(vec4 color, float hue, float saturation){
  color.rgb = _rgb2hsv(clamp(color.rgb, 0.0, 1.0));
  color.r = color.r+hue;
  color.g = clamp(color.g*(saturation*abs(saturation)*2.5+1.0), 0.0, 1.0);
  color.rgb = _hsv2rgb(color.rgb);
  return color;
}`,
    },
    {
        provides: ['_applyContrast'],
        requires: ['_contrast'],
        nativeArithmetic: true,
        code: `vec4 _applyContrast(vec4 color) {
  float contrast = _Contrast;
  if (contrast > 1.0) contrast *= contrast;
  return _contrast(color, contrast);
}`,
    },
    {
        provides: ['_hueSaturationLEGACY'],
        requires: ['_rgb2hsv', '_hsv2rgb'],
        nativeArithmetic: true,
        code: `vec4 _hueSaturationLEGACY(vec4 color, float hue, float saturation){
  color.rgb = _rgb2hsv(clamp(color.rgb, 0.0, 1.0));
  color.r = color.r+hue;
  color.g = clamp(color.g+saturation, 0.0, 1.0);
  color.rgb = _hsv2rgb(color.rgb);
  return color;
}`,
    },
    {
        provides: ['_mediaSize'],
        samplers: ['syn_Media'],
        nativeArithmetic: true,
        code: `vec2 _mediaSize() {
  return vec2(textureSize(syn_Media, 0));
}`,
    },
    {
        provides: ['_imageToMask'],
        requires: ['_luminance'],
        nativeArithmetic: true,
        code: `vec4 _imageToMask(vec4 colIn){
  float threshold = _Media_Contrast*0.5;
  float luminance = _luminance(colIn);
  float value = step(threshold, luminance);
  return vec4(value);
}`,
    },
    {
        provides: ['_ratioFix'],
        nativeArithmetic: true,
        code: `float _ratioFix(float wr, float hr) {
  return _Fit_or_Fill > 0.5 ? max(wr, hr) : min(wr, hr);
}`,
    },
    {
        provides: ['_sobelHelper'],
        requires: ['_sobelIntensity'],
        nativeArithmetic: true,
        code: `float _sobelHelper(float stepx, float stepy, vec2 uv, sampler2D tex){
  float tleft = _sobelIntensity(texture(tex, uv + vec2(-stepx,stepy)));
  float left = _sobelIntensity(texture(tex, uv + vec2(-stepx,0.0)));
  float bleft = _sobelIntensity(texture(tex, uv + vec2(-stepx,-stepy)));
  float top = _sobelIntensity(texture(tex, uv + vec2(0.0,stepy)));
  float bottom = _sobelIntensity(texture(tex, uv + vec2(0.0,-stepy)));
  float tright = _sobelIntensity(texture(tex, uv + vec2(stepx,stepy)));
  float right = _sobelIntensity(texture(tex, uv + vec2(stepx,0.0)));
  float bright = _sobelIntensity(texture(tex, uv + vec2(stepx,-stepy)));
  float x = tleft + 2.0*left + bleft - tright - 2.0*right - bright;
  float y = -tleft - 2.0*top - tright + bleft + 2.0 * bottom + bright;
  float color = sqrt((x*x) + (y*y));
  return color;
}`,
    },
    {
        provides: ['_sobelIntensity'],
        nativeArithmetic: true,
        code: `float _sobelIntensity(in vec4 color){
  return sqrt((color.x*color.x)+(color.y*color.y)+(color.z*color.z));
}`,
    },
    {
        provides: ['_tiltShiftGauss'],
        nativeArithmetic: true,
        code: `float _tiltShiftGauss(float x, float e) {
  return exp(-pow(x, 2.)/e);
}`,
    },
];
