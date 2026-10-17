vec4 mod289(vec4 x)
{
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x)
{
  return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

vec2 fade(vec2 t) {
  return t*t*t*(t*(t*6.0-15.0)+10.0);
}

// Classic Perlin noise
float noise(vec2 P)
{
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod289(Pi); // To avoid truncation effects in permutation
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;

  vec4 i = permute(permute(ix) + iy);

  vec4 gx = fract(i / 42.) * 2.0 - 1.0 ;
  vec4 gy = abs(gx) - 0.5 ;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;

  vec2 g00 = vec2(gx.x,gy.x);
  vec2 g10 = vec2(gx.y,gy.y);
  vec2 g01 = vec2(gx.z,gy.z);
  vec2 g11 = vec2(gx.w,gy.w);

  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;  
  g01 *= norm.y;  
  g10 *= norm.z;  
  g11 *= norm.w;  

  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));

  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
  return 2.3 * n_xy;
}
///
//
// END NOISE SNIPPET
//

vec4 renderMain()
{
    const float iters = 10.0;

    if (PASSINDEX == 0.0){
        float nMed = noise(_uvc*pow(scale_liquid,2.0) + TIME*100.0);
        float nBig = _fbm(_uvc*10.0+_pixelate(TIME, 20));

        vec4 newCol = vec4(0.0);
        if (_isMediaActive()){
          newCol = _loadMedia();
        }
        vec4 oldCol = texture(backbuffer, _uv);
        float oldNoise = oldCol.a;

        float nextNoise = oldNoise + nMed*(liquify+step(0.5, syn_HighHits)*auto_liquid);


        if ((refresh > 0.5)||(syn_OnBeat*auto_refresh > 0.5)||(FRAMECOUNT < 5)){
            return newCol;
        }

        vec2 direction = vec2(0.0,1.0)*reverse;
        // direction = floor(direction);
        direction += _rotate(direction, nextNoise*2*PI);
        direction *= pow(1.0+length(oldCol),2.0)*0.1*speed;
        if (blend < 0.5){
            direction = floor(direction);
        }

        vec4 nextCol = texture(backbuffer, _uv-direction/RENDERSIZE.y);
        nextCol = mix(nextCol, 1.0-nextCol, step(0.5,invert));

        vec3 moddedCol = nextCol.rgb*(1.0-colorize)+nextCol.rgb*vec3(1.0,0.0,0.0)*2.0*colorize;
        moddedCol = _rgb2hsv(moddedCol);
        moddedCol.r += colorize*moddedCol.b;
        moddedCol = _hsv2rgb(vec3(_pixelate(moddedCol.rg,colorize*5.0),moddedCol.b));
        moddedCol = clamp(moddedCol, 0.0, 1.0);
        nextCol.rgb = mix(nextCol.rgb, moddedCol, step(0.5,colorize));

        vec4 finalCol = nextCol;
        finalCol.a = nextNoise;
        return finalCol;
    } else if (PASSINDEX == 1.0){
        return texture(backbuffer, _uv);
    }


}