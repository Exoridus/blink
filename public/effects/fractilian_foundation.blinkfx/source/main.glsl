///////////////////////////////////////////
// FractilianFoundation  by mojovideotech
// orgin of the Fractilian series of ISFs
//
// based on :
//
// Fractals: MRS
// by Nikos Papadopoulos, 4rknova / 2015
//
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
///////////////////////////////////////////

vec3 _grad3(vec3 col1, vec3 col2, vec3 col3, float mixVal){
    mixVal *= 2.0;
    float mix1 = clamp(mixVal,0.0,1.0);
    float mix2 = clamp(mixVal-1.0, 0.0, 1.0);
    return mix(mix(col1, col2, mix1), mix(col2, col3, mix2), step(1.0, mixVal));
}

vec3 colorPaletteChooser(float colReg, float var){
  vec3 paletteCol = vec3(0.5);
  vec3 color1 = clamp(_palette(var, vec3(0.500, 0.531, 0.177), vec3(0.500, 0.500, 0.531), vec3(0.535, 0.688, 0.612), vec3(0.500, 0.500, 0.669)), 0.0, 1.0);
  vec3 color2 = clamp(_palette(var, vec3(-0.038, -0.146, -0.131), vec3(0.838, 0.531, 0.392), vec3(0.962, 1.000, 1.281), vec3(0.354, 0.262, 0.915)), 0.0, 1.0);
  vec3 color3 = clamp(_palette(var,vec3(-0.346, -0.423, -0.269), vec3(0.877, 0.862, 1.000), vec3(1.054, 1.085, 0.15), vec3(0.238, 0.432, 0.908)), 0.0, 1.0);

  paletteCol = _grad3(color1, color2, color3, colReg);
  // paletteCol = mix(paletteCol, color4, max(0, colReg - 2));

  return paletteCol;
}

vec2 barrelDistortion(vec2 coord, float amt) {

	vec2 cc = coord - 0.5;
	float dist = dot(cc, cc);
	//return coord + cc * (dist*dist)  * amt;
	return coord + cc * dist * amt;
}

vec4 applyVignette(vec4 fragColor)
{
    // vec2 position = (_xy / u_resolution) - vec2(0.5);
    vec2 position = _uvc;
    float dist = length(position);


    float radius = 1.35 - 0.4*barrel_distortion;
    float softness = 0.4;
    float vignette = smoothstep(radius, radius - softness, dist);

    fragColor.rgb = fragColor.rgb - max(0, 0.75 - vignette);

    return fragColor;
}

vec4 applyBarrelDistortion(vec4 fragColor) {

	//vec2 uv=(gl_FragCoord.xy/iResolution.xy);

	// vec2 uv=modifier * zoom*_uvc;
  // vec2 uv = (_xy/RENDERSIZE.xy*.5)+.25;
  vec2 uv = _uv;
	//uv.y +=.1;
	vec4 a1=texture(BuffA, barrelDistortion(uv,0.0));
	vec4 a2=texture(BuffA, barrelDistortion(uv,barrel_distortion*0.6));
	vec4 a3=texture(BuffA, barrelDistortion(uv,barrel_distortion*0.9));
	vec4 a4=texture(BuffA, barrelDistortion(uv,barrel_distortion*1.2));

	// vec4 a5=texture2D(BuffA, barrelDistortion(uv,0.8));
	// vec4 a6=texture2D(BuffA, barrelDistortion(uv,1.0));
	// vec4 a7=texture2D(BuffA, barrelDistortion(uv,1.2));
	// vec4 a8=texture2D(BuffA, barrelDistortion(uv,1.4));

	// vec4 a9=texture2D(BuffA, barrelDistortion(uv,1.6));
	// vec4 a10=texture2D(BuffA, barrelDistortion(uv,1.8));
	// vec4 a11=texture2D(BuffA, barrelDistortion(uv,2.0));
	// vec4 a12=texture2D(BuffA, barrelDistortion(uv,2.2));

	// vec4 tx=(a1+a2+a3+a4+a5+a6+a7+a8+a9+a10+a11+a12)/12.;
	vec4 tx=(a1+a2+a3+a4)/4.;
	fragColor = vec4(tx.rgb, 1. );

  return fragColor;
}

vec4 renderPassA() {

	vec4 colOut = vec4(0.0);
  vec2 uv =  zoom*(_uvc+0.5);
  uv += camera_position.xy;
  // vec2 uv = vec2(modifier * zoom * _xy - RENDERSIZE.xy/2.) / RENDERSIZE.x;
  // vec2 uv = (modifier * zoom*_uvc);

  float t = auto_rotate*syn_Time*.00325+auto_rotate*syn_BassTime*0.005+40.+rotate;
  float k = cos(t+syn_Presence*.00125);
  float l = sin(t);
  float s = 1.25;

  vec3 imageBase = vec3(0.);

  //load user image

  if (_isMediaActive()){
      vec4 image = _loadMedia();
      imageBase = image.rgb;
  }

  for(int i=0; i<60; ++i)
  {
      uv  = abs(uv) - s;
      // uv = _rotate(uv, 0.5+);
      uv *= mat2(k,-l,l,k);
      s  *= detail;
      // uv *= ;
      // s *= exp(i);
  }


  float x = .92*cos(0.325*(237.*fractal_softness*length(uv)));
  float x2 = .92*sin(0.325*(237.*fractal_softness*length(uv)));

  vec4 last = texture(BuffA, _uv);

  float pulse = _pulse(x, syn_BPMSin4, 0.6);
  float secondPulse = _pulse(x2, abs(sin(syn_BassTime*.75)*0.5), 0.1+syn_ToggleOnBeat*0.9);

  colOut = vec4(colorPaletteChooser(color_regime, colorModifier - x), 1.0);
  //color tweaking + pulse
  colOut.rgb = _rgb2hsv(colOut.rgb);
  // out_FragColor.b -= 0.2;
  colOut.g -= 0.96*color_beat_pulse;
  colOut.g += secondPulse*0.8*color_beat_pulse;
  colOut.g += pulse*0.8*color_beat_pulse;
  colOut.g = clamp(colOut.g, 0.0, 1.0);

  colOut.b -= 0.7*color_beat_pulse;
  colOut.b += secondPulse*0.7*color_beat_pulse;
  colOut.b += pulse*0.7*color_beat_pulse;
  colOut.b = clamp(colOut.b, 0.0, 1.0);
  colOut.rgb = _hsv2rgb(colOut.rgb);
  colOut = _gamma(colOut, 0.8);
  colOut = clamp(mix(colOut, last, 0.99*pow(feedback, 0.1)),0.0,1.0);
  return colOut;
}


vec4 renderMainImage(){
 vec4 fragColor = texture(BuffA, _uv);
 // fragColor.xy = _rotate(fragColor.xy, 0.003);
 fragColor = applyBarrelDistortion(fragColor);
 fragColor = applyVignette(fragColor);
 // fragColor *= 1.;
 return fragColor;
}

vec4 renderMain(){
 if(PASSINDEX == 0){
		return renderPassA();
	}
	if(PASSINDEX == 1){
		return renderMainImage();
	}
}
