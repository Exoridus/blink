vec2 resolution = RENDERSIZE; // the rendering resolution (in pixels)
float time = TIME;
vec2 uv = _uv;

vec2 toPolar(vec2 cart) {
    return vec2(length(cart), atan(cart.x, cart.y));
}

vec2 toCart(vec2 polar) {
    return vec2(polar.x * cos(polar.y), polar.x * sin(polar.y));
}

float uvrand(vec2 uv)
{
    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
}

float arc(vec2 coord)
{
    const float pi = 3.1415926;
    float t = floor(time * 1.1) * 7.3962;

    vec2 sc = coord;
    float phi = atan(sc.y, sc.x + 1e-6);
    vec2 pc = vec2(fract(phi / (pi * 2) + syn_BassTime*0.01), length(sc));

    vec2 org = vec2(0.5, 0.5);
    vec2 wid = vec2(0.5, 0.5);

    for (int i = 0; i < 4; i++)
    {
        if (uvrand(org + t) < 0.04 * i) break;
        wid *= 0.5;
        org += wid * (step(org, pc) * 2 - 1);
    }

    return uvrand(org);
}

float arcGridPattern()
{
    vec4 delta = vec4(-1, -1, 1, 1) * 0.5;
    delta *= (1/resolution.y);

    // neightbor four samples
    float c1 = arc(abs(_uvc)*0.4 + delta.xy);
    float c2 = arc(abs(_uvc)*0.4 + delta.zy);
    float c3 = arc(abs(_uvc)*0.4 + delta.xw);
    float c4 = arc(abs(_uvc)*0.4 + delta.zw);

    // roberts cross operator
    float gx = c1 - c4;
    float gy = c2 - c3;
    float g = sqrt(gx * gx + gy * gy);

    return g*4;
}


vec2 getLap(sampler2D tex, vec2 pos, vec2 dx, vec2 dy, vec4 c){
  // return  texture(tex, fract(pos + dx)).xy * 0.2 +
  //         texture(tex, fract(pos + dx + dy)).xy * 0.05 +
  //         texture(tex, fract(pos - dx)).xy * 0.2 +
  //         texture(tex, fract(pos - dx - dy)).xy * 0.05 +
  //         texture(tex, fract(pos + dy)).xy * 0.2 +
  //         texture(tex, fract(pos + dx - dy)).xy * 0.05 +
  //         texture(tex, fract(pos - dy)).xy * 0.2 +
  //         texture(tex, fract(pos - dx + dy)).xy * 0.05 -
  //         c.xy;

  return  texture(tex, fract(pos + dx)).xy * 0.25 +
        texture(tex, fract(pos - dx)).xy * 0.25 +
        texture(tex, fract(pos + dy)).xy * 0.25 +
        texture(tex, fract(pos - dy)).xy * 0.25 -
        c.xy;
}

vec4 doReacDiff(void)
{
  vec2 uvn = (uv-0.5) * vec2(resolution.x/resolution.y, 1.0);

  vec2 dx = vec2(1. / resolution.x, 0.0)*(2.5+scale)*(1.0+pulse_ripple*10.0);
  vec2 dy = vec2(0.0, 1. / resolution.y)*(2.5+scale)*(1.0+pulse_ripple*10.0);

  vec4 c = vec4(0.0);
  vec2 laplacian = vec2(0.0);

  if (PASSINDEX < 1.0){
    c = texture(buffB2, uv);
    laplacian = getLap(buffB2, uv, dx, dy, c);
  } else if (PASSINDEX < 3.0) {
    c = texture(buffA2, uv);
    laplacian = getLap(buffA2, uv, dx, dy, c);
  }

  float reaction = c.r * c.g * c.g;

  float dt = 1.0;

  // THESE ARE THE MAGIC NUMBERS
  float f = 0.018;
  float k = 0.048;

  // equation
  c.r += dt * (0.6 * laplacian.r - reaction + f * (1. - c.r))*(1.0+grow*50.0*_pulse(length(_uvc)*0.85 + 0.1, (1.0-grow)*1.0, 0.3));
  c.g += dt * (0.3 * laplacian.g + reaction - (k + f) * c.g )*(1.0+grow*50.0*_pulse(length(_uvc)*0.85 + 0.1, (1.0-grow)*1.0, 0.3));


  float briSim = 1.0-clamp(pow(1.0-dot(abs(c.rg), vec2(1.0, 1.0)),0.25)*2.0,0.0,1.0);

  vec3 fft = vec3(_sqPulse(fract(length(_uvc)*3.3), fract(TIME*0.1), 0.03))*syn_HighHits;
  if (_isMediaActive()){
    fft = _loadMedia().rgb*(_pulse(dot(_uvc, _uvc)*0.75 + 0.1, pow(1.0-pulse_out,2.0), 0.1)+auto_feed*briSim*pow(syn_HighHits,2.0)*10.0);
  } else {
    fft = vec3(1.0)*arcGridPattern()*(_pulse(dot(_uvc, _uvc)*0.75 + 0.1, pow(1.0-pulse_out,2.0), 0.1)+auto_feed*briSim*pow(syn_HighHits,2.0)*20.0)*0.5;
  }

  // fft = _loadMedia().rgb*(_pulse(dot(_uvc, _uvc)*0.75 + 0.1, pow(1.0-pulse_out,2.0), 0.1)+auto_feed*briSim*syn_HighHits*3.0)*0.5;

  float fftF = pow(dot(fft, vec3(1.0))/3.0,1.0);

  // FFT MODIFICATION
  c.r += fftF*0.1;
  c.g += fftF*0.01;

  c *= 1.0-_pulse(length(_uvc)*0.85 + 0.1, (1.0-black_pulse)*2.0, 0.15)*0.01;
  c *= 1.0-full_erase*0.05;


  if( length(uvn) < 0.001) {
      c.r = 0.0; c.g = 100.0 *length(uvn);
  }

  return min(max(vec4(0.), c), vec4(1.));
}

//END REACTION DIFFUSION

//BEING WORLD TEX COLORING

float getSim(vec2 uv, vec2 d) {
    float result = texture(buffB2, uv + d ).y;
    return result;
}

vec4 renderPass1(void)
{
  const int iters = 5;
  vec3 finalCol = vec3(0.0);

    vec2 uvn = (uv - 0.5) * vec2(resolution.x/resolution.y, 1.0);


    vec2 px = vec2(1. / resolution.x, 0.0);
    vec2 py = vec2(0.0, 1. / resolution.y);

    vec2 g_uv = uv;

    float p = getSim(g_uv, vec2(0.));
    float u = p - getSim(g_uv, - py);
    float r = p - getSim(g_uv, - px);

    vec3 dy = normalize(vec3(0.0, py.y, u/7.0));
    vec3 dx = normalize(vec3(px.x ,0.0, r/7.0));

    vec3 n = cross(dy,dx);

    // n *= (1.0+scale+2.0);

    float shade = 0.1 + dot(n, normalize(vec3(0., 0., -1.)));

    vec3 color =  (1. - n ) * shade * vec3(p * 3.0);

    color = _rgb2hsv(clamp(color,0.0,1.0));
    color.r = sin(color.r*10.0);
    color.g = color.g*2.0;
    // color.b -= dot(_loadMedia().rgb, vec3(1.0))/3.0;
    color = _hsv2rgb(color);
    if (color.g > color.r+color.b){
      color += vec3(color.r, -color.g, color.b);
    }

    // color = vec3(1.0-clamp(pow(1.0-dot(abs(texture(buffB2, g_uv).rg), vec2(1.0, 1.0)),0.25)*2.0,0.0,1.0));

  return vec4(color, 1.);
}

vec4 renderMain(void){
  if (FRAMECOUNT < 2){
    if (_isMediaActive()){
      return _loadMedia()*0.5;
    } else {
      return vec4(step(abs(_uvc), vec2(0.01)), 0.0, 1.0);
    }
  }
  if (PASSINDEX == 0.0){
    return doReacDiff();
  } else if (PASSINDEX == 1.0){
    return texture(buffA, _uv);
  } else if (PASSINDEX == 2.0){
    return doReacDiff();
  } else if (PASSINDEX == 3.0){
    return texture(buffB, _uv);
  } else if (PASSINDEX == 4.0){
    return renderPass1();
  }

}

