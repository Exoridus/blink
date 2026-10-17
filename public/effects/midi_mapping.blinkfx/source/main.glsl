vec4 midiBlue = vec4(0.2,0.2,0.2,1.0);

vec4 renderMain(void)
{
	if (_uv.y > 0.8){
		vec4 colOut = vec4(0.0);
		vec2 pos = _uv;
		pos.x = fract(_uv.x*16.0);
		pos.y = (_uv.y-0.8)*1/0.2;
		int ind = int(_uv.x*16.0);
		vec4 toggleCol = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pos.y);

		if (ind == 0) colOut = toggleCol*smoothstep(TOGGLE_0+0.05, TOGGLE_0, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, TOGGLE_0, 0.025);
		if (ind == 1) colOut = toggleCol*smoothstep(TOGGLE_1+0.05, TOGGLE_1, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, TOGGLE_1, 0.025);
		if (ind == 2) colOut = toggleCol*smoothstep(TOGGLE_2+0.05, TOGGLE_2, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, TOGGLE_2, 0.025);
		if (ind == 3) colOut = toggleCol*smoothstep(TOGGLE_3+0.05, TOGGLE_3, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, TOGGLE_3, 0.025);
		if (ind == 4) colOut = toggleCol*smoothstep(TOGGLE_4+0.05, TOGGLE_4, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, TOGGLE_4, 0.025);
		if (ind == 5) colOut = toggleCol*smoothstep(TOGGLE_5+0.05, TOGGLE_5, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, TOGGLE_5, 0.025);
		if (ind == 6) colOut = toggleCol*smoothstep(TOGGLE_6+0.05, TOGGLE_6, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, TOGGLE_6, 0.025);
		if (ind == 7) colOut = toggleCol*smoothstep(TOGGLE_7+0.05, TOGGLE_7, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, TOGGLE_7, 0.025);

		if (abs(pos.y-0.5)>0.45){
			colOut = midiBlue;
		}
		if (fract(pos.x)>0.95||fract(pos.x)<0.05){
			colOut = midiBlue;
		}

		if (_uv.x>0.5){
			vec4 colOut = vec4(0.0);
			vec2 pos = _uv;
			pos.x = fract(_uv.x/0.25);
			pos.y = (_uv.y)*1/0.5;
	
			vec2 gridPos = pos;

			vec2 polar = _toPolarTrue(pos-0.5);
			// int indX = int((_uv.x/0.25)*2.0);
			// int indY = int(_uv.y,2.0);

			vec2 xyPos = fract(gridPos*2.0);
			xyPos += vec2(-0.05,-0.1)*2.0;
			xyPos *= vec2(1.1,1.2);
			vec2 xyGrid = vec2((_uv.x-0.5)*2.0*4.0, fract(_uv.y*5.0));

			if ((xyGrid.x > 0.00)&&(xyGrid.x < 1.00)) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0),dot(xyPos, vec2(1.0))/3.0)+vec4(0.0,1.0,1.0,1.0)*_pulse(distance(XY_0, xyPos), 0.07, 0.02)+vec4(1.0,1.0,1.0,1.0)*(1.0-smoothstep(distance(XY_0, xyPos), 0.02, 0.05));
			if ((xyGrid.x > 1.00)&&(xyGrid.x < 2.00)) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0),dot(xyPos, vec2(1.0))/3.0)+vec4(0.0,1.0,1.0,1.0)*_pulse(distance(XY_1, xyPos), 0.07, 0.02)+vec4(1.0,1.0,1.0,1.0)*(1.0-smoothstep(distance(XY_1, xyPos), 0.02, 0.05));
			if ((xyGrid.x > 2.00)&&(xyGrid.x < 3.00)) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0),dot(xyPos, vec2(1.0))/3.0)+vec4(0.0,1.0,1.0,1.0)*_pulse(distance(XY_2, xyPos), 0.07, 0.02)+vec4(1.0,1.0,1.0,1.0)*(1.0-smoothstep(distance(XY_2, xyPos), 0.02, 0.05));
			if ((xyGrid.x > 3.00)&&(xyGrid.x < 4.00)) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0),dot(xyPos, vec2(1.0))/3.0)+vec4(0.0,1.0,1.0,1.0)*_pulse(distance(XY_3, xyPos), 0.07, 0.02)+vec4(1.0,1.0,1.0,1.0)*(1.0-smoothstep(distance(XY_3, xyPos), 0.02, 0.05));

			float onGrid = _sqPulse(fract(xyGrid.x), 0.0, 0.1);
			onGrid += _sqPulse(fract(xyGrid.y), 0.0, 0.05);
			if (onGrid > 0.5){
				colOut = midiBlue;
			}

			return colOut;
		}

		return colOut;
	}	

	else if (_uv.y > 0.6){
		vec4 colOut = vec4(0.0);
		vec2 pos = _uv;
		pos.x = fract(_uv.x*8.0);
		pos.y = (_uv.y-0.6)*1/0.2;
		int ind = int(_uv.x*8.0);
		vec2 gridPos = pos;
		pos*=vec2(1.1,1.0);
		pos.x-=0.05;
		vec2 polar = _toPolarTrue(pos-0.5);
		vec4 bangCol = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pow(BANG_0,0.2));
		if (ind == 0) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pow(polar.x,2.0)*2.0+pow(BANG_0,0.2))*(1.0-smoothstep(0.25, 0.4+BANG_0, polar.x))+_pulse(polar.x, 0.3+BANG_0, 0.02);
		if (ind == 1) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pow(polar.x,2.0)*2.0+pow(BANG_1,0.2))*(1.0-smoothstep(0.25, 0.4+BANG_1, polar.x))+_pulse(polar.x, 0.3+BANG_1, 0.02);
		if (ind == 2) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pow(polar.x,2.0)*2.0+pow(BANG_2,0.2))*(1.0-smoothstep(0.25, 0.4+BANG_2, polar.x))+_pulse(polar.x, 0.3+BANG_2, 0.02);
		if (ind == 3) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pow(polar.x,2.0)*2.0+pow(BANG_3,0.2))*(1.0-smoothstep(0.25, 0.4+BANG_3, polar.x))+_pulse(polar.x, 0.3+BANG_3, 0.02);
		if (ind == 4) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pow(polar.x,2.0)*2.0+pow(BANG_4,0.2))*(1.0-smoothstep(0.25, 0.4+BANG_4, polar.x))+_pulse(polar.x, 0.3+BANG_4, 0.02);
		if (ind == 5) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pow(polar.x,2.0)*2.0+pow(BANG_5,0.2))*(1.0-smoothstep(0.25, 0.4+BANG_5, polar.x))+_pulse(polar.x, 0.3+BANG_5, 0.02);
		if (ind == 6) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pow(polar.x,2.0)*2.0+pow(BANG_6,0.2))*(1.0-smoothstep(0.25, 0.4+BANG_6, polar.x))+_pulse(polar.x, 0.3+BANG_6, 0.02);
		if (ind == 7) colOut = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pow(polar.x,2.0)*2.0+pow(BANG_7,0.2))*(1.0-smoothstep(0.25, 0.4+BANG_7, polar.x))+_pulse(polar.x, 0.3+BANG_7, 0.02);

		if (abs(gridPos.y-0.5)>0.45){
			colOut = midiBlue;
		}
		if (fract(gridPos.x)>0.95||fract(gridPos.x)<0.05){
			colOut = midiBlue;
		}

		return colOut;
	}	

	else if (_uv.y > 0.4){
		vec4 colOut = vec4(0.0);
		vec2 pos = _uv;
		pos.x = fract(_uv.x*8.0);
		pos.y = (_uv.y-0.4)*1/0.2;
		int ind = int(_uv.x*8.0);
				vec2 gridPos = pos;
		pos*=vec2(1.1,1.0);
		pos.x-=0.05;
		vec2 polar = _toPolarTrue(_rotate(pos-0.5, PI*3/2));
		polar.y = 1.0-polar.y;
		vec4 toggleCol = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), polar.y);

		if ((KNOB_0 > polar.y)&&(ind == 0)) colOut = toggleCol+_pulse(polar.y, KNOB_0, 0.03);
		if ((KNOB_1 > polar.y)&&(ind == 1)) colOut = toggleCol+_pulse(polar.y, KNOB_1, 0.03);
		if ((KNOB_2 > polar.y)&&(ind == 2)) colOut = toggleCol+_pulse(polar.y, KNOB_2, 0.03);
		if ((KNOB_3 > polar.y)&&(ind == 3)) colOut = toggleCol+_pulse(polar.y, KNOB_3, 0.03);
		if ((KNOB_4 > polar.y)&&(ind == 4)) colOut = toggleCol+_pulse(polar.y, KNOB_4, 0.03);
		if ((KNOB_5 > polar.y)&&(ind == 5)) colOut = toggleCol+_pulse(polar.y, KNOB_5, 0.03);
		if ((KNOB_6 > polar.y)&&(ind == 6)) colOut = toggleCol+_pulse(polar.y, KNOB_6, 0.03);
		if ((KNOB_7 > polar.y)&&(ind == 7)) colOut = toggleCol+_pulse(polar.y, KNOB_7, 0.03);

		colOut *= step(polar.x, 0.4);

		if (abs(gridPos.y-0.5)>0.45){
			colOut = midiBlue;
		}
		if (fract(gridPos.x)>0.95||fract(gridPos.x)<0.05){
			colOut = midiBlue;
		}

		return colOut;
	}	

	else if ((_uv.y > 0.0)&&(_uv.x<0.75)){
		vec4 colOut = vec4(0.0);
		vec2 pos = _uv;
		pos.x = fract((_uv.x/0.75)*8.0);
		pos.y = (_uv.y)*1/0.4;
		int ind = int((_uv.x/0.75)*8.0);
		vec4 sliderCol = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), pos.y);
		if (ind == 0) colOut = sliderCol*smoothstep(SLIDER_0+0.05, SLIDER_0, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, SLIDER_0, 0.025);
		if (ind == 1) colOut = sliderCol*smoothstep(SLIDER_1+0.05, SLIDER_1, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, SLIDER_1, 0.025);
		if (ind == 2) colOut = sliderCol*smoothstep(SLIDER_2+0.05, SLIDER_2, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, SLIDER_2, 0.025);
		if (ind == 3) colOut = sliderCol*smoothstep(SLIDER_3+0.05, SLIDER_3, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, SLIDER_3, 0.025);
		if (ind == 4) colOut = sliderCol*smoothstep(SLIDER_4+0.05, SLIDER_4, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, SLIDER_4, 0.025);
		if (ind == 5) colOut = sliderCol*smoothstep(SLIDER_5+0.05, SLIDER_5, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, SLIDER_5, 0.025);
		if (ind == 6) colOut = sliderCol*smoothstep(SLIDER_6+0.05, SLIDER_6, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, SLIDER_6, 0.025);
		if (ind == 7) colOut = sliderCol*smoothstep(SLIDER_7+0.05, SLIDER_7, pos.y)+vec4(1.0,1.0,1.0,1.0)*_pulse(pos.y-0.025, SLIDER_7, 0.025);


		if (abs(pos.y-0.5)>0.475){
			colOut = midiBlue;
		}
		if (fract(pos.x)>0.925||fract(pos.x)<0.075){
			colOut = midiBlue;
		}

		return colOut;
	}

	else if ((_uv.y > 0.0)&&(_uv.x>0.75)){
		vec4 colOut = vec4(0.0);
		vec2 pos = vec2((_uv.x-0.75)*4.0, _uv.y/(2.0/5.0));
		vec2 gridPos = pos*vec2(4.0, 1.0);
		vec2 inGridPos = fract(gridPos);

		vec2 selPos = vec2(inGridPos.x, inGridPos.y*6.0);
		vec2 indPos = fract(selPos);

		vec2 selArt = abs((indPos-0.5+vec2(0.05,-0.05))*vec2(1.0,1.0));
		vec4 indicatorCol = mix(vec4(0.2,0.0,0.0,1.0), vec4(1.2,0.6,0.0,1.0), clamp(pow(1.0-max(selArt.x, selArt.y),2.0), 0.0, 1.0));

		float sticky0 = floor(DROPDOWN_0);
		float sticky1 = floor(DROPDOWN_1);
		float sticky2 = floor(DROPDOWN_2);
		float sticky3 = floor(DROPDOWN_3);
		if ((gridPos.x > 0.0)&&(gridPos.x < 1.0)) colOut = indicatorCol*_sqPulse(selPos.y-0.5, sticky0, 0.5);
		if ((gridPos.x > 1.0)&&(gridPos.x < 2.0)) colOut = indicatorCol*_sqPulse(selPos.y-0.5, sticky1, 0.5);
		if ((gridPos.x > 2.0)&&(gridPos.x < 3.0)) colOut = indicatorCol*_sqPulse(selPos.y-0.5, sticky2, 0.5);
		if ((gridPos.x > 3.0)&&(gridPos.x < 4.0)) colOut = indicatorCol*_sqPulse(selPos.y-0.5, sticky3, 0.5);

		float whiteDividers = _pulse(fract(indPos.y), 0.0, 0.1);
		if (whiteDividers > 0.5){
			colOut = vec4(0.5);
		}


		float onGrid = _sqPulse(fract(gridPos.x+0.1), 0.0, 0.1);
		onGrid += _sqPulse(fract(gridPos.y), 0.0, 0.025);
		if (onGrid > 0.5){
			colOut = midiBlue;
		}

		return colOut;

	}


	return vec4(_uv.x, BANG_0, _uv.y, 1.0);
}
