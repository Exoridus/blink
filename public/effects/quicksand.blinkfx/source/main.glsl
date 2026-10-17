
#define tolerance 0.001;

bool almostEqual(float num1, float num2, float tolIn){
	return abs(num1-num2)<tolIn;
}

bool almostEqual(float num1, float num2){
	return abs(num1-num2)<tolerance;
}

vec4 renderMain(void)
{
	if (PASSINDEX == 0){
		if (FRAMECOUNT < 10){
			return vec4(0.5,1.0,1.0,0.5);
		}

		vec2 pixelSize = 1/RENDERSIZE;
		if (soften > 0.5){
			pixelSize *= 0.75;
		}

		float horAmt = 1.0+hor_speed;
		float vertAmt = 1.0+vert_speed;

		// float vertDisp = (5.0-floor(_rand(_pixelate(_uv.x, 50.0)+floor(syn_BPMTwitcher))*10.0));
		// if (_rand(_pixelate(_uv.x, 50.0))>_uv.y){
		// 	vertDisp *= 0.0;
		// }


		vec2 disp = vec2(0.0);

		if (pusher>0.5){
			disp = -_uvc*100.0*(clamp(syn_MidHighHits*syn_Presence,0.1,1.0)-0.1);
		}

		vec4 center;
		vec4 above;
		vec4 below;
		vec4 left;
		vec4 right;

		if (scroller<0.5){
			center = texture(firstBuff, _uv);
			above = texture(firstBuff, _uv+(vec2(0.0,vertAmt)+disp)*pixelSize);
			below = texture(firstBuff, _uv+(vec2(0.0,-vertAmt)+disp)*pixelSize);
			left = texture(firstBuff, _uv+(vec2(-horAmt,0.0)+disp)*pixelSize);
			right = texture(firstBuff, _uv+(vec2(horAmt,0.0)+disp)*pixelSize);

			if (_uv.x > 0.5){
				vec4 tempLeft = left;
				left = right;
				right = tempLeft;
			}

		} else if (scroller>0.5){
			if (_uv.x>0.5){
				horAmt *= -1;
			}
			vertAmt *= -1+2*mod(floor(syn_BPMTwitcher),2);
			center = texture(firstBuff, _uv);
			above = texture(firstBuff, _uv+(vec2(horAmt,vertAmt)+disp)*pixelSize);
			below = texture(firstBuff, _uv+(vec2(-horAmt,-vertAmt)+disp)*pixelSize);
			right = texture(firstBuff, _uv+(vec2(horAmt,vertAmt)+disp)*pixelSize);
			left = right;
		}

		vec4 dataOut = vec4(0.0);
		bvec4 dataSet = bvec4(false);

  	bool testForShape = false;
  	if (shape_type < 0.5){
  		float cpPulseTime = fract(syn_OnBeat+_uv.y);
  		float cpPulse = sin(smoothstep(0.0,0.3,cpPulseTime)-smoothstep(0.3,0.6,cpPulseTime));
  		testForShape = abs(_uvc.x)<0.0075+0.1*cpPulse*syn_OnBeat*syn_Presence;
  	} else if (shape_type < 1.5){
  		float cpPulseTime = fract(syn_OnBeat+sin(_toPolarTrue(_rotate(_uvc, -PI/2)).y*2*PI+cos(TIME*0.5))+TIME*0.5);
  		float cpPulse = sin(smoothstep(0.0,0.3,cpPulseTime)-smoothstep(0.3,0.6,cpPulseTime));
  		testForShape = length(_uvc*vec2(1.0,0.5+_uv.y))<0.15+0.05*syn_OnBeat+0.1*cpPulse*syn_OnBeat*syn_Presence;
  	} else if (shape_type < 2.5){
  		// float cpPulseTime = fract(syn_OnBeat+cos(_uvc.x*4.0));
  		// float cpPulse = sin(smoothstep(0.0,0.3,cpPulseTime)-smoothstep(0.3,0.6,cpPulseTime))*3.0;
  		// testForShape = 0.5-abs(_uvc.y)<0.0075+0.1*cpPulse*syn_OnBeat*syn_Presence;
  	}

  	if (_isMediaActive()){
  		if (_loadMediaAsMask().r>0.5){
  			dataOut.r = 0.5;
  			dataSet.r = true;
  			dataOut.g = 0.5;
  			dataSet.g = true;

  			// dataSet = bvec4(true);
  		} else if (dot(_loadMedia().rgb,vec3(1.0))/3.0>0.55){
  			dataOut.b = 0.05;
  			dataSet.b = true;
  		}
  	} else if (testForShape){
			dataOut = vec4(1.0);
			dataSet = bvec4(true);
		} else {
			dataOut.a = 0.0;
		}

		// if (almostEqual(center.g, center.b)){
			// dataOut.r = 0.5;
			// dataSet.r = true;
		// }

		if (almostEqual(below.r,center.r)&&almostEqual(above.r,center.r)&&!dataSet.r){
			dataOut.r = _rand(_uvc+TIME);
			dataSet.r = true;
		}

		if (almostEqual(left.r,center.r)&&almostEqual(right.r,center.r)&&!dataSet.r){
			dataOut.r = _rand(_uvc+TIME);
			dataSet.r = true;
		}

		if (below.r > center.r && !dataSet.r){
			dataOut.r = right.r;
			dataSet.r = true;
		}
		if (above.r > center.r && !dataSet.r){
			dataOut.r = left.r;
			dataSet.r = true;
		}
		if (left.r < center.r && !dataSet.r){
			dataOut.r = above.r;
			dataSet.r = true;
		}
		if (right.r < center.r && !dataSet.r){
			dataOut.r = below.r;
			dataSet.r = true;
		}

		
		if (almostEqual(1.0,center.g)&&!dataSet.g){
			dataOut.g = _rand(_uvc+TIME);
			dataSet.g = true;
		}

		if (below.g > center.g && !dataSet.g){
			dataOut.g = right.g;
			dataSet.g = true;
		}
		if (above.g > center.g && !dataSet.g){
			dataOut.g = left.g;
			dataSet.g = true;
		}
		if (left.g < center.g && !dataSet.g){
			dataOut.g = above.g;
			dataSet.g = true;
		}
		if (right.g < center.g && !dataSet.g){
			dataOut.g = below.g;
			dataSet.g = true;
		}

		if (almostEqual(center.b,1.0)&&!dataSet.b){
			dataOut.b = _rand(_uvc+TIME)*0.1;
			dataSet.b = true;
		}

		if (center.b < below.b && !dataSet.b){
			dataOut.b = below.b;
			dataSet.b = true;
		}
		if (above.b > center.b && !dataSet.b){
			dataOut.b = left.b;
			dataSet.b = true;
		}
		if (left.b < center.b && !dataSet.b){
			dataOut.b = above.b;
			dataSet.b = true;
		}
		if (right.b > center.b && !dataSet.b){
			dataOut.b = 1.0-below.b;
			dataSet.b = true;
		}
		// if (almostEqual(left.b, right.b)&&almostEqual(above.b,below.b)){
		// 	dataOut.b = center.b;
		// 	dataSet.b = true;
		// }

		dataOut = clamp(dataOut, 0.0, 1.0);

		return dataOut*vec4(dataSet)+center*vec4(not(dataSet));

	} else if (PASSINDEX == 1){
		float xPos = _uv.x;
		// float xPos = abs(-0.5-_uv.x);
		// if (_uv.x>0.5){
		// 	xPos = -_uv.x+0.5;
		// }
		// float xPos = _uv.x;

		vec4 dataTex = texture(firstBuff, vec2(xPos, _uv.y));


		vec4 monoColor = vec4(dataTex.b);

		vec4 finalCol = vec4(0.0);

		vec4 briCol = vec4(0.5,0.8,0.0,0.0);
		vec4 centerCol = vec4(0.7,0.1,0.1,0.0);
		vec4 outsideCol = vec4(0.1,0.1,0.4,0.0);


		briCol = mix(briCol, -vec4(0.9,0.9,0.9,0.0), cReg1);
		centerCol = mix(centerCol, vec4(0.7,0.5,0.5,0.0), cReg1);
		outsideCol = mix(outsideCol, vec4(0.7,0.1,0.0,0.0), cReg1);

		briCol = mix(briCol, -vec4(0.2,0.8,0.4,0.0), cReg2);
		centerCol = mix(centerCol, vec4(0.2,0.8,0.7,0.0), cReg2);
		outsideCol = mix(outsideCol, vec4(0.2,0.9,0.5,0.0), cReg2);


		finalCol += mix(briCol, vec4(1.0), clamp(abs(_uvc.x)*2.0,0.0,1.0))*dataTex.r;
		finalCol += mix(centerCol*2.0,outsideCol,abs(_uvc.x)*2.0)*(1.0-dataTex.g);
		//finalCol += vec4(1.0,1.0,1.0,0.0)*syn_MidLevel*pow(1.0-abs(_uvc.x),3.0)*dataTex.b*dataTex.a;

		
		float percolating = step(0.01,dataTex.r);
		vec4 percVal = vec4(1.0)*(1.0-percolating)*pow(1.0-abs(_uvc.x),3.0)*syn_BPMSin2*6.0;

		finalCol -= percVal;
		monoColor -= percVal;

		float highPulseTime = fract(-syn_HighHits+dataTex.r*2.0+abs(scanDirection<0.5 ? _uvc.x : _uvc.y));
  	float highPulse = sin(smoothstep(0.0,0.1,highPulseTime)-smoothstep(0.1,0.2,highPulseTime));

    finalCol += (1.0-finalCol)*highPulse*syn_Intensity*pow(syn_HighHits,0.25)*pow(length(_uvc),3.0)*2.0;

		// finalCol = mix(monoColor, finalCol, syn_Presence);

		float monoPulseTime = fract(-monochrome+dataTex.r*2.0+abs(scanDirection<0.5 ? _uvc.y : _uvc.x));
  	float monoPulse = smoothstep(0.0,0.4,monoPulseTime)-smoothstep(0.4,0.8,monoPulseTime);
		finalCol = mix(finalCol, 1.0-monoColor, monochrome);

		return finalCol;

	} else if (PASSINDEX == 2){
		vec2 pos = _uv*0.5+vec2(sin(floor(syn_BPMTwitcher/4.0)),cos(floor(syn_BPMTwitcher/4.0)));
		pos = _pixelate(pos, RENDERSIZE.x);
		pos = _uv;
		vec4 finalCol = texture(secondBuff, pos);
		vec4 dataTex = texture(firstBuff, _uv);

		// float gridLineX = mod(_uv.x*0.3,1/RENDERSIZE.x);
		// float gridLineY = mod(_uv.y*0.3,1/RENDERSIZE.y);

		// if(almostEqual(gridLineX,0.0,0.0001)||almostEqual(gridLineY,0.0,0.0001)){
		// 	finalCol = vec4(0.0);
		// }

		if(_isMediaActive()&&_loadMediaAsMask().r>0.5){
			finalCol = vec4(1.0-dataTex.b);
		}

		return finalCol;

	}

	return vec4(1.0,0.0,1.0,0.0);
}
