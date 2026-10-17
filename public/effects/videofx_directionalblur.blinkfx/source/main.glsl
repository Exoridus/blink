vec4 texMirror(sampler2D samplerIn, vec2 uvIn, float isMediaIn){
	vec2 uvInM = uvIn;
	if (mirror_tile>0.5){
		if (mod(uvInM.x, 2.0) > 1.0){
			uvInM.x = 1.0-uvInM.x;
		}
		if (mod(uvInM.y, 2.0) > 1.0){
			uvInM.y = 1.0-uvInM.y;
		}
	}
	vec4 tex = texture(samplerIn, uvInM);
	vec4 col = vec4(0.0);
	col += _sqPulse(fract(uvInM.x), 0.0, 0.01+thickness_grid);
	col += _sqPulse(fract(uvInM.y), 0.0, 0.01+thickness_grid);
	return mix(col, tex, isMediaIn);
}

vec2 _rotateAboutCenter(vec2 uvIn, float amt){
  vec2 uvNew = uvIn;
  _uv2uvc(uvNew);
  uvNew = _rotate(uvNew, amt);
  _uvc2uv(uvNew);
  return uvNew;
}

vec4 renderMain(void) {
	float isMedia = float(_isMediaActive());
	vec2 lookupPos = mix(_uvc*20.0, _correctMediaCoords(), isMedia);
	float zoomAmt = zoom_amt*zoom_amt;
	vec3 radialBlur = vec3(0.0);
	int numIters = int(zoom_levels);
	vec2 zoompos = mix(zoom_pos, vec2(sin(syn_Time*0.25+syn_ToggleOnBeat*0.5*PI), (-0.5+1.0*_statelessContinuousChaotic(syn_ToggleOnBeat*0.009+syn_Time*0.0033)))*0.5, auto_direction);
	for(int i = 0; i < numIters+1; i++){
		vec3 video = texMirror(syn_Media, lookupPos+media_pos, isMedia).rgb;
		lookupPos = lookupPos*(1.0-zoomAmt);
		lookupPos += vec2(zoomAmt, zoomAmt)*0.5-zoompos*mix(0.025, 0.0025, micro_adjust)*mix(20.0,1.0,isMedia);
		lookupPos *= vec2(RENDERSIZE.x/RENDERSIZE.y, 1.0);
		//0.218 magic number that keeps it centered? wat?
		lookupPos -= vec2(0.218*RENDERSIZE.x/RENDERSIZE.y, 0.0);
		lookupPos = _rotateAboutCenter(lookupPos, sign(roto)*roto*roto*2*PI);
		lookupPos += vec2(0.218*RENDERSIZE.x/RENDERSIZE.y, 0.0);
		lookupPos /= vec2(RENDERSIZE.x/RENDERSIZE.y, 1.0);

		if (audio_zoom > 0.5){
			radialBlur += video*brightness*5.0*(0.5+0.5*sin(-syn_BassTime*1.5-TIME*0.75+4*PI*float(i)/numIters));
		} else {
			radialBlur += video*brightness;
		}
	}
	radialBlur = pow(radialBlur/(numIters+1), vec3(1.0+blur_gamma));
	// vec3 finalColor = pow(loopOut/(numIters*0.8+1), vec3(2.0));
	// finalColor += _sqPulse(_uv.x, 0.5, 0.001);
	vec3 finalColor = radialBlur;
  return vec4(finalColor, 1.0);
}

