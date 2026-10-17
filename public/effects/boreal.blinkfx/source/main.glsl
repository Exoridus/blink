vec4 texMirror(sampler2D samplerIn, vec2 uvIn){
  if (mod(uvIn.x, 2.0) > 1.0){
    uvIn.x = 1.0-uvIn.x;
  }
  if (mod(uvIn.y, 2.0) > 1.0){
    uvIn.y = 1.0-uvIn.y;
  }
  return texture(samplerIn, uvIn);
}


vec4 renderMainPass() {
    vec2 p = _uv - 0.5;
    float time = tScript;

    float intensity = mix(0, 0.02, syn_Intensity);
    // Original: intensity = mix(intensity, -intensity, movesIn);
    // Convert to dropdown: inOutMovement (0=movesOut, 1=movesIn)

    intensity *= (wind_movement-1.0);

    float zoom = 1 + intensity;

    vec2 offset = 3e-3*syn_FadeInOut*sin(.3*time+vec2(0,1.6));
    // offset = _rotate(vec2(normalize(_uvc)-vec2(0.0, _uvc.x)), texture(syn_Spectrum, length(_uvc)).g*PI)*0.001;
    vec4 lastPass = texture(syn_FinalPass, p * zoom  + 0.5 - offset);

    float minMix = 0.01;
    float maxMix = 0.04;

    float distFromWhite = length(1 - lastPass.xyz);
    lastPass.xyz += vec3(
      _noise(vec3(p, TIME/5)),
      _noise(vec3(p, TIME/5 + 10)),
      _noise(vec3(p, TIME/5 + 20))
    ) * mix(minMix, maxMix, syn_MidHighPresence);

    float ratio = RENDERSIZE.y/RENDERSIZE.x;

    float exponent = mix(20, 30 + syn_BassHits * 10, syn_BassPresence);

    vec2 pos = p +0.3*vec2(sin(TIME*0.02),cos(TIME*0.02));
    vec2 pos2 = p;

    float waving, spinning;
    waving      = _pulse(warp_type, 0.0, 1.0);
    spinning    = _pulse(warp_type, 3.0, 1.0);

    if (waving > 0.1) {
      float amt = waving*_fbm(vec3(pos, TIME/10)) - 0.5;
      pos += amt;
      pos2 += amt;
    }
    if (spinning > 0.1) {
      float amt = spinning*(_fbm(vec3(p*10 * _rotate(vec2(0.1, 1), syn_Time/50),  TIME/10)) - 0.5);
      pos += amt;
      pos2 += amt;
    }

    pos = abs(pos);
    pos2 = abs(pos2);

    if (pos.x > 1) {
      pos.x = 2 - pos.x;
    }

    if (pos.y > 1) {
      pos.y = 2 - pos.y;
    }
    if (pos2.x > 1) {
      pos2.x = 2 - pos2.x;
    }

    if (pos2.y > 1) {
      pos2.y = 2 - pos2.y;
    }

    vec4 tex1 = _textureImage(bubbles, pos*1.2);
    vec4 tex2 = _textureImage(lines, 0.5*vec2(sin(TIME*0.02),cos(TIME*0.02))+_toPolar(pos*0.8*vec2(1.9,0.9)));
    vec4 tex3 = texMirror(tears, pos*vec2(1.6,0.9));
    vec4 tex4 = _textureImage(linework, pos*0.65);
    vec4 texColor = tex1;
    
    float image1 = 0.0;
    float image2 = 0.0;
    float image3 = 0.0;
    float image4 = 0.0;
    image1 = _pulse(image_select, 0.0, 1.0);
    image2 = _pulse(image_select, 1.0, 1.0);
    image3 = _pulse(image_select, 2.0, 1.0);
    image4 = _pulse(image_select, 3.0, 1.0);

    // Original image mixing:
    texColor = mix(texColor, tex2, image2);
    texColor = mix(texColor, tex3, image3);
    texColor = mix(texColor, tex4, image4);

    if (_isMediaActive()){
        texColor = _loadMedia();
        if (media_warp > 0.5){
          texColor = _textureMedia(_invertYAxisVideo(pos2));
        }
    }
  
    texColor = 1.0-texColor;
    
    vec3 colorTint = vec3(
        sin(_uvc.x * 2.0 + TIME * 0.08) * 0.5 + 0.5,
        sin(_uvc.y * 1.5 + TIME * 0.12) * 0.5 + 0.5,
        sin(length(_uvc) * 1.8 + TIME * 0.1) * 0.5 + 0.5
    );
    texColor.rgb = mix(texColor.rgb, texColor.rgb * colorTint, 0.15*extra_color_tint);
    
    vec4 tex = pow(abs(sin(6.3*scanline_thinness*texColor+time+static_scan*2*PI)),vec4(exponent));
    // tex.rgb = mix(tex.rgb, tex.gbr, 0.1);
    // tex.rgb = 2.0-vec3(1.0,1.0,0.0)*(1.0-tex.b)-vec3(0.0,1.0,1.0)*(1.0-tex.r)-vec3(1.0,0.0,1.0)*(1.0-tex.g);
    // tex.rgb = tex.rgb*5.0*fiddle;
    vec4 col = mix(lastPass, tex, mix(0.00, 0.05, syn_FadeInOut));
    // col += texture(syn_Spectrum, length(col)*0.33)*col*0.05-0.01;
    col = clamp(col, 0, 1);
    col *= pow(syn_FadeInOut, 0.07);
    return col;
}

vec4 renderMain() {
    if (PASSINDEX == 0) {
        return renderMainPass();
    } else {
        return texture(backbuff, _uv);
    }
}

