vec3 plasma_quintic( float x )
{
  x = clamp( x, 0.0, 1.0);
  vec4 x1 = vec4( 1.0, x, x * x, x * x * x ); // 1 x x2 x3
  vec4 x2 = x1 * x1.w * x; // x4 x5 x6 x7
  return vec3(
    dot( x1.xyzw, vec4( +0.063861086, +1.992659096, -1.023901152, -0.490832805 ) ) + dot( x2.xy, vec2( +1.308442123, -0.914547012 ) ),
    dot( x1.xyzw, vec4( +0.049718590, -0.791144343, +2.892305078, +0.811726816 ) ) + dot( x2.xy, vec2( -4.686502417, +2.717794514 ) ),
    dot( x1.xyzw, vec4( +0.513275779, +1.580255060, -5.164414457, +4.559573646 ) ) + dot( x2.xy, vec2( -1.916810682, +0.570638854 ) ) );
}

vec4 renderMain(void)
{
	if (PASSINDEX == 0){
		float marginPixels = 10;
		vec2 margin = marginPixels / RENDERSIZE;
		float xThresh = 0.9;
		
		float x = _map(_uv.x, margin.x, xThresh - margin.x, 0.0, 1.0);

		vec4 spect = texture(syn_Spectrum, x);
		vec4 spectTexel = texelFetch(syn_Spectrum, int(x*1024), 0);
		vec4 levelTrail = texture(syn_LevelTrail, x);

		vec4 col = vec4(0.0);
		float fftMin = -0.05;

		float slot;
		float numSlots = 5.0;

		slot = 0.0;
		if ((_uv.y > slot/numSlots + margin.y) && (_uv.y < (slot+1)/numSlots - margin.y)){
			float range = _map(_uv.y, slot/numSlots + margin.y, (slot+1)/numSlots - margin.y, fftMin, 1.0);
			float val = spectTexel.r;
			float bar = step(range, val);
			col = vec4(plasma_quintic(val)*bar,1.0);
		}

		slot = 1.0;
		if ((_uv.y > slot/numSlots + margin.y) && (_uv.y < (slot+1)/numSlots - margin.y)){
			float range = _map(_uv.y, slot/numSlots + margin.y, (slot+1)/numSlots - margin.y, fftMin, 1.0);
			float val = spect.g;
			float bar = step(range, val);
			col = vec4(plasma_quintic(val)*bar,1.0);
		}

		slot = 2.0;
		if ((_uv.y > slot/numSlots + margin.y) && (_uv.y < (slot+1)/numSlots - margin.y)){
			float range = _map(_uv.y, slot/numSlots + margin.y, (slot+1)/numSlots - margin.y, fftMin, 1.0);
			float val = spect.b;
			float bar = step(range, val);
			col = vec4(plasma_quintic(val)*bar,1.0);
		}

		slot = 3.0;
		if ((_uv.y > slot/numSlots + margin.y) && (_uv.y < (slot+1)/numSlots - margin.y)){
			float range = _map(_uv.y, slot/numSlots + margin.y, (slot+1)/numSlots - margin.y, 0.0, 1.0);
			float val = spectTexel.a;
			float bar = _sqPulse(range, val, 0.01);
			col = vec4(vec3(1.0, 0.5, 0.0)*bar,1.0);

			// add feedback
			vec4 lastWaveform = texture(helper, _uv);;
			vec3 colW = lastWaveform.rgb;
			colW = _rgb2hsv(colW);
			colW.r -= 0.012;
			colW.g += 0.0;
			colW.b -= 0.05;
			colW.gb = clamp(colW.gb, 0.0, 1.0);
			colW = _hsv2rgb(colW);
			col.rgb += colW;
		}

		slot = 4.0;
		if ((_uv.y > slot/numSlots) && (_uv.y < (slot+1)/numSlots - margin.y)){
			float range = _map(_uv.y, slot/numSlots, (slot+1)/numSlots - margin.y, 0.0, 1.0);

			float smoothness = 0.1;

			vec3 bassColor = vec3(0.0,0.0,1.0) * smoothstep(range, range + smoothness, levelTrail.g);
			col += vec4(bassColor, 1.0);

			vec3 midColor = vec3(1.0,0.0,0.0) * smoothstep(range, range + smoothness, levelTrail.b);
			col += vec4(midColor, 1.0);

			vec3 highColor = vec3(0.0,1.0,0.0) * smoothstep(range, range + smoothness, levelTrail.a);
			col += vec4(highColor, 1.0);
		}

		if (_uv.x > xThresh-margin.x) {
			col = vec4(0.0);
			float xScaled = _map(_uv.x, xThresh, 1.0-margin.x, 0.0, 1.0);
			float yScaled = _map(_uv.y, margin.y * 2, 1.0-margin.y, 0.0, 1.0);

			float val = clamp(syn_InputLevel,0.0,1.0);
			float trackerVal = clamp(inputTrackerScript,0.0,1.0);
			float barWidthMask = _inRange(xScaled, margin.x*10, 0.5-margin.x*10);
			float barHeightMask = (1.0-step(val, yScaled)) * (1.0-step(_uv.y, margin.y));

			float indicatorWidth = 0.0075;
			float indicatorMask = _sqPulse(yScaled, trackerVal-indicatorWidth, indicatorWidth);

			vec3 barColor = mix(vec3(0.7, 0.1, 0.3), vec3(1.0, 0.5, 0.0), yScaled);
			col.rgb += barColor*barWidthMask*barHeightMask + vec3(1.0)*indicatorMask*barWidthMask;


			float val2 = clamp(trackerSmoothScript,0.0,1.0);
			float trackerVal2 = clamp(trackerSmoothIDScript,0.0,1.0);

			float barWidthMask2 = _inRange(xScaled, 0.5+margin.x*10, 1.0-margin.x*10);
			float barHeightMask2 = (1.0-step(val2, yScaled)) * (1.0-step(_uv.y, margin.y));

			float indicatorMask2 = _sqPulse(yScaled, trackerVal2-indicatorWidth, indicatorWidth);

			vec3 col1 = vec3(0.7, 0.0, 0.0);
			vec3 col2 = vec3(0.2, 0.7, 0.5);
			vec3 col3 = vec3(1.0, 1.0, 0.0);
			vec3 barColor2 = col1;
			float bound1 = 0.01;
			float bound2 = 0.06;
			float bound3 = 0.9;
			float bound4 = 0.95;
			if ((trackerVal2 > bound1) && (trackerVal2 < bound2)){
				barColor2 = mix(col1, col2, (trackerVal2-bound1)*1/(bound2-bound1));
			} else if ((trackerVal2 >= bound2) && (trackerVal2 < bound3)){
				barColor2 = col2;
			} else if ((trackerVal2 >= bound3) && (trackerVal2 < bound4)){
				barColor2 = mix(col2, col3, (trackerVal2-bound3)*1/(bound4-bound3));
			} else if (trackerVal2 >= bound4){
				barColor2 = col3;
			}
			col.rgb += barColor2*barWidthMask2*barHeightMask2 + vec3(1.0)*indicatorMask2*barWidthMask2;
		}

		col *= _inRange(_uv.x, margin.x+0.001, 1.0 - margin.x);
		col *= _inRange(_uv.y, margin.y, 1.0 - margin.y);

		return col;
	} else if (PASSINDEX == 1){
		return texture(feedback, _uv);
	} else if (PASSINDEX == 2){
		return texture(helper, _uv);
	}
}
