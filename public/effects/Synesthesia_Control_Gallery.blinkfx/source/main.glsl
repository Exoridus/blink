// Control Matrix — SSF control catalog, 2026.
// Supports all 19 documented control TYPE strings (7 families).
// Shader does NOT redeclare SSF uniforms: Synesthesia injects them from scene.json.
// Coordinates here are top-left based UI coordinates in a 1920x1080 reference canvas.
// The scene is resolution-independent via _uv.
//
// Texture lookup uses GL coordinates; the UI overlays below use top-left coordinates.

float rr(vec2 p, vec2 origin, vec2 size, float radius) {
  vec2 delta = abs(p - (origin + size * 0.5)) - size * 0.5 + vec2(radius);
  float sd = length(max(delta, vec2(0.0))) + min(max(delta.x, delta.y), 0.0) - radius;
  return 1.0 - smoothstep(-1.15, 1.15, sd);
}
float circleMask(vec2 p, vec2 center, float radius) {
  return 1.0 - smoothstep(radius-1.2, radius+1.2, length(p-center));
}
float ringMask(vec2 p, vec2 center, float radius, float halfThickness) {
  return 1.0 - smoothstep(halfThickness-1.0, halfThickness+1.0, abs(length(p-center)-radius));
}
void applyColor(inout vec3 col, vec3 overlay, float mask) {
  col = mix(col, overlay, clamp(mask, 0.0, 1.0));
}
void drawBar(inout vec3 col, vec2 p, vec2 start, float width, float value, vec3 accent) {
  float t = clamp(value, 0.0, 1.0);
  applyColor(col, vec3(0.065, 0.105, 0.151), rr(p,start,vec2(width,9.0),4.5));
  applyColor(col, accent * 0.8, rr(p,start,vec2(max(0.001,width*t),9.0),4.5));
  applyColor(col, vec3(0.86,0.95,1.0), circleMask(p,start+vec2(width*t,4.5),5.3));
}
void drawKnob(inout vec3 col, vec2 p, vec2 center, float value, vec3 accent) {
  float t = clamp(value,0.0,1.0);
  applyColor(col,vec3(0.072,0.112,0.17),circleMask(p,center,25.0));
  applyColor(col,vec3(0.19,0.25,0.33),ringMask(p,center,20.5,2.3));
  float theta = -2.36 + t * 4.72;
  vec2 n = vec2(sin(theta), -cos(theta));
  applyColor(col,accent, circleMask(p,center+n*19.0,4.7));
  applyColor(col,vec3(0.12,0.19,0.28),circleMask(p,center,13.0));
  applyColor(col,accent*0.8, circleMask(p,center,3.6));
}
void drawToggle(inout vec3 col, vec2 p, vec2 start, float value, vec3 accent) {
  float t=clamp(value,0.0,1.0);
  vec3 offColor=vec3(0.1,0.15,0.22);
  applyColor(col,mix(offColor,accent*0.65,t),rr(p,start,vec2(64.0,26.0),13.0));
  applyColor(col,vec3(0.94,0.97,1.0),circleMask(p,start+vec2(13.0+t*38.0,13.0),9.3));
}
void drawBang(inout vec3 col, vec2 p, vec2 center, float strength, float counter, vec3 accent) {
  float v=clamp(strength,0.0,1.0);
  applyColor(col,vec3(0.105,0.135,0.20),circleMask(p,center,20.0));
  applyColor(col,mix(accent*0.27,accent,v),circleMask(p,center,15.0));
  applyColor(col,vec3(0.92,0.96,1.0),circleMask(p,center,4.1));
  float theta=counter*6.2831853;
  applyColor(col,accent, circleMask(p, center+vec2(sin(theta),-cos(theta))*22.0,3.8));
}
void drawXY(inout vec3 col, vec2 p, vec2 topLeft, vec2 norm, vec3 accent) {
  float bx=70.0; float by=70.0;
  applyColor(col,vec3(0.07,0.11,0.18),rr(p,topLeft,vec2(bx,by),7.0));
  applyColor(col,vec3(0.16,0.22,0.32),rr(p,topLeft+vec2(34.0,4.0),vec2(1.0,62.0),0.0));
  applyColor(col,vec3(0.16,0.22,0.32),rr(p,topLeft+vec2(4.0,34.0),vec2(62.0,1.0),0.0));
  vec2 dot=topLeft+vec2(7.0,7.0)+clamp(norm,vec2(0.0),vec2(1.0))*vec2(56.0,56.0);
  applyColor(col,accent*0.33,circleMask(p,dot,11.0));
  applyColor(col,accent,circleMask(p,dot,6.3));
  applyColor(col,vec3(0.96),circleMask(p,dot,2.0));
}
void drawColor(inout vec3 col, vec2 p, vec2 origin, vec2 size, vec3 colorValue, vec3 accent) {
  applyColor(col,vec3(0.32,0.38,0.46),rr(p,origin-vec2(1.3),size+vec2(2.6),7.0));
  applyColor(col,clamp(colorValue,vec3(0.0),vec3(1.0)),rr(p,origin,size,6.0));
  applyColor(col,accent,circleMask(p,origin+vec2(size.x-14.0,size.y*0.5),3.2));
}
void drawDrop(inout vec3 col, vec2 p, vec2 origin, float width, float value, vec3 accent) {
  float t=clamp(value,0.0,1.0);
  applyColor(col,vec3(0.082,0.13,0.19),rr(p,origin,vec2(width,25.0),7.0));
  applyColor(col,accent*0.48,rr(p,origin+vec2(3.0,3.0),vec2(max(0.001,(width-23.0)*t),19.0),5.0));
  applyColor(col,accent,circleMask(p,origin+vec2(7.0+t*(width-24.0),12.5),4.0));
  applyColor(col,vec3(0.86,0.89,0.92),circleMask(p,origin+vec2(width-12.0,12.5),2.0));
}

vec4 renderMain() {
  vec2 p=vec2(_uv.x*1920.0,(1.0-_uv.y)*1080.0);
  vec3 col=texture(controlGuide, _uv).rgb;
  // 01 Sliders
  if (p.x >= 52.0000 && p.x <= 951.0000 && p.y >= 183.0000 && p.y <= 466.0000) {
    if (p.x >= 70.0000 && p.x <= 277.5000 && p.y >= 241.0000 && p.y <= 340.5000) {
      drawBar(col,p,vec2(84.0000, 314.5000), 179.5000, Slider_Min, vec3(0.2588, 0.8471, 0.9412));
    }
    if (p.x >= 288.5000 && p.x <= 496.0000 && p.y >= 241.0000 && p.y <= 340.5000) {
      drawBar(col,p,vec2(302.5000, 314.5000), 179.5000, Slider_Mid, vec3(0.2588, 0.8471, 0.9412));
    }
    if (p.x >= 507.0000 && p.x <= 714.5000 && p.y >= 241.0000 && p.y <= 340.5000) {
      drawBar(col,p,vec2(521.0000, 314.5000), 179.5000, Slider_Max, vec3(0.2588, 0.8471, 0.9412));
    }
    if (p.x >= 725.5000 && p.x <= 933.0000 && p.y >= 241.0000 && p.y <= 340.5000) {
      drawBar(col,p,vec2(739.5000, 314.5000), 179.5000, ((Slider_Bipolar + 1.0) * 0.5), vec3(0.2588, 0.8471, 0.9412));
    }
    if (p.x >= 70.0000 && p.x <= 277.5000 && p.y >= 349.5000 && p.y <= 449.0000) {
      drawBar(col,p,vec2(84.0000, 423.0000), 179.5000, Slider_Smooth_Fast, vec3(0.2588, 0.8471, 0.9412));
    }
    if (p.x >= 288.5000 && p.x <= 496.0000 && p.y >= 349.5000 && p.y <= 449.0000) {
      drawBar(col,p,vec2(302.5000, 423.0000), 179.5000, Slider_Smooth_Slow, vec3(0.2588, 0.8471, 0.9412));
    }
    if (p.x >= 507.0000 && p.x <= 714.5000 && p.y >= 349.5000 && p.y <= 449.0000) {
      drawBar(col,p,vec2(521.0000, 423.0000), 179.5000, fract(0.5 + Slider_Speed_Plus * 0.07), vec3(0.2588, 0.8471, 0.9412));
    }
    if (p.x >= 725.5000 && p.x <= 933.0000 && p.y >= 349.5000 && p.y <= 449.0000) {
      drawBar(col,p,vec2(739.5000, 423.0000), 179.5000, fract(0.5 + Slider_Speed_Minus * 0.07), vec3(0.2588, 0.8471, 0.9412));
    }
  }
  // 02 Knobs
  if (p.x >= 52.0000 && p.x <= 951.0000 && p.y >= 483.0000 && p.y <= 703.0000) {
    if (p.x >= 70.0000 && p.x <= 350.3333 && p.y >= 541.0000 && p.y <= 609.0000) {
      drawKnob(col,p,vec2(305.3333, 579.0000), Knob_Min, vec3(0.4392, 0.6627, 1.0000));
    }
    if (p.x >= 361.3333 && p.x <= 641.6667 && p.y >= 541.0000 && p.y <= 609.0000) {
      drawKnob(col,p,vec2(596.6667, 579.0000), Knob_Mid, vec3(0.4392, 0.6627, 1.0000));
    }
    if (p.x >= 652.6667 && p.x <= 933.0000 && p.y >= 541.0000 && p.y <= 609.0000) {
      drawKnob(col,p,vec2(888.0000, 579.0000), Knob_Max, vec3(0.4392, 0.6627, 1.0000));
    }
    if (p.x >= 70.0000 && p.x <= 350.3333 && p.y >= 618.0000 && p.y <= 686.0000) {
      drawKnob(col,p,vec2(305.3333, 656.0000), Knob_Smooth, vec3(0.4392, 0.6627, 1.0000));
    }
    if (p.x >= 361.3333 && p.x <= 641.6667 && p.y >= 618.0000 && p.y <= 686.0000) {
      drawKnob(col,p,vec2(596.6667, 656.0000), fract(0.5 + Knob_Speed_Plus * 0.07), vec3(0.4392, 0.6627, 1.0000));
    }
    if (p.x >= 652.6667 && p.x <= 933.0000 && p.y >= 618.0000 && p.y <= 686.0000) {
      drawKnob(col,p,vec2(888.0000, 656.0000), fract(0.5 + Knob_Speed_Minus * 0.07), vec3(0.4392, 0.6627, 1.0000));
    }
  }
  // 03 Toggles
  if (p.x >= 52.0000 && p.x <= 951.0000 && p.y >= 720.0000 && p.y <= 876.0000) {
    if (p.x >= 70.0000 && p.x <= 233.8000 && p.y >= 778.0000 && p.y <= 859.0000) {
      drawToggle(col,p,vec2(119.9000, 822.0000), Toggle_Off, vec3(0.3216, 0.9098, 0.6902));
    }
    if (p.x >= 244.8000 && p.x <= 408.6000 && p.y >= 778.0000 && p.y <= 859.0000) {
      drawToggle(col,p,vec2(294.7000, 822.0000), Toggle_On, vec3(0.3216, 0.9098, 0.6902));
    }
    if (p.x >= 419.6000 && p.x <= 583.4000 && p.y >= 778.0000 && p.y <= 859.0000) {
      drawToggle(col,p,vec2(469.5000, 822.0000), Toggle_Smooth_Off, vec3(0.3216, 0.9098, 0.6902));
    }
    if (p.x >= 594.4000 && p.x <= 758.2000 && p.y >= 778.0000 && p.y <= 859.0000) {
      drawToggle(col,p,vec2(644.3000, 822.0000), Toggle_Smooth_On, vec3(0.3216, 0.9098, 0.6902));
    }
    if (p.x >= 769.2000 && p.x <= 933.0000 && p.y >= 778.0000 && p.y <= 859.0000) {
      drawToggle(col,p,vec2(819.1000, 822.0000), ((Toggle_Bipolar + 1.0) * 0.5), vec3(0.3216, 0.9098, 0.6902));
    }
  }
  // 04 Bangs
  if (p.x >= 52.0000 && p.x <= 951.0000 && p.y >= 893.0000 && p.y <= 1043.0000) {
    if (p.x >= 70.0000 && p.x <= 233.8000 && p.y >= 951.0000 && p.y <= 1026.0000) {
      drawBang(col,p,vec2(204.8000, 993.5000), Bang_Trigger, 0.0, vec3(1.0000, 0.5333, 0.4902));
    }
    if (p.x >= 244.8000 && p.x <= 408.6000 && p.y >= 951.0000 && p.y <= 1026.0000) {
      drawBang(col,p,vec2(379.6000, 993.5000), Bang_Envelope_Fast, 0.0, vec3(1.0000, 0.5333, 0.4902));
    }
    if (p.x >= 419.6000 && p.x <= 583.4000 && p.y >= 951.0000 && p.y <= 1026.0000) {
      drawBang(col,p,vec2(554.4000, 993.5000), Bang_Envelope_Slow, 0.0, vec3(1.0000, 0.5333, 0.4902));
    }
    if (p.x >= 594.4000 && p.x <= 758.2000 && p.y >= 951.0000 && p.y <= 1026.0000) {
      drawBang(col,p,vec2(729.2000, 993.5000), (0.26 + 0.65 * fract(Bang_Counter * 0.125)), fract(Bang_Counter * 0.125), vec3(1.0000, 0.5333, 0.4902));
    }
    if (p.x >= 769.2000 && p.x <= 933.0000 && p.y >= 951.0000 && p.y <= 1026.0000) {
      drawBang(col,p,vec2(904.0000, 993.5000), (0.26 + 0.65 * fract(Bang_Counter_Smooth * 0.125)), fract(Bang_Counter_Smooth * 0.125), vec3(1.0000, 0.5333, 0.4902));
    }
  }
  // 05 XY Pads
  if (p.x >= 968.0000 && p.x <= 1868.0000 && p.y >= 183.0000 && p.y <= 466.0000) {
    if (p.x >= 986.0000 && p.x <= 1266.6667 && p.y >= 241.0000 && p.y <= 340.5000) {
      drawXY(col,p,vec2(1178.6667, 255.7500), XY_Center, vec3(0.7059, 0.5686, 1.0000));
    }
    if (p.x >= 1277.6667 && p.x <= 1558.3333 && p.y >= 241.0000 && p.y <= 340.5000) {
      drawXY(col,p,vec2(1470.3333, 255.7500), XY_Origin, vec3(0.7059, 0.5686, 1.0000));
    }
    if (p.x >= 1569.3333 && p.x <= 1850.0000 && p.y >= 241.0000 && p.y <= 340.5000) {
      drawXY(col,p,vec2(1762.0000, 255.7500), XY_Corner, vec3(0.7059, 0.5686, 1.0000));
    }
    if (p.x >= 986.0000 && p.x <= 1266.6667 && p.y >= 349.5000 && p.y <= 449.0000) {
      drawXY(col,p,vec2(1178.6667, 364.2500), ((XY_Asymmetric - vec2(-1.0,-2.0)) / vec2(2.0,4.0)), vec3(0.7059, 0.5686, 1.0000));
    }
    if (p.x >= 1277.6667 && p.x <= 1558.3333 && p.y >= 349.5000 && p.y <= 449.0000) {
      drawXY(col,p,vec2(1470.3333, 364.2500), XY_Smooth, vec3(0.7059, 0.5686, 1.0000));
    }
    if (p.x >= 1569.3333 && p.x <= 1850.0000 && p.y >= 349.5000 && p.y <= 449.0000) {
      drawXY(col,p,vec2(1762.0000, 364.2500), fract(XY_Speed * 0.08 + vec2(0.5)), vec3(0.7059, 0.5686, 1.0000));
    }
  }
  // 06 Colors
  if (p.x >= 968.0000 && p.x <= 1868.0000 && p.y >= 483.0000 && p.y <= 743.0000) {
    if (p.x >= 986.0000 && p.x <= 1193.7500 && p.y >= 541.0000 && p.y <= 629.0000) {
      drawColor(col,p,vec2(998.0000, 591.0000), vec2(183.7500, 25.0000), Color_Black, vec3(0.9804, 0.5608, 0.8196));
    }
    if (p.x >= 1204.7500 && p.x <= 1412.5000 && p.y >= 541.0000 && p.y <= 629.0000) {
      drawColor(col,p,vec2(1216.7500, 591.0000), vec2(183.7500, 25.0000), Color_White, vec3(0.9804, 0.5608, 0.8196));
    }
    if (p.x >= 1423.5000 && p.x <= 1631.2500 && p.y >= 541.0000 && p.y <= 629.0000) {
      drawColor(col,p,vec2(1435.5000, 591.0000), vec2(183.7500, 25.0000), Color_Red, vec3(0.9804, 0.5608, 0.8196));
    }
    if (p.x >= 1642.2500 && p.x <= 1850.0000 && p.y >= 541.0000 && p.y <= 629.0000) {
      drawColor(col,p,vec2(1654.2500, 591.0000), vec2(183.7500, 25.0000), Color_Green, vec3(0.9804, 0.5608, 0.8196));
    }
    if (p.x >= 986.0000 && p.x <= 1193.7500 && p.y >= 638.0000 && p.y <= 726.0000) {
      drawColor(col,p,vec2(998.0000, 688.0000), vec2(183.7500, 25.0000), Color_Blue, vec3(0.9804, 0.5608, 0.8196));
    }
    if (p.x >= 1204.7500 && p.x <= 1412.5000 && p.y >= 638.0000 && p.y <= 726.0000) {
      drawColor(col,p,vec2(1216.7500, 688.0000), vec2(183.7500, 25.0000), Color_Dim, vec3(0.9804, 0.5608, 0.8196));
    }
    if (p.x >= 1423.5000 && p.x <= 1631.2500 && p.y >= 638.0000 && p.y <= 726.0000) {
      drawColor(col,p,vec2(1435.5000, 688.0000), vec2(183.7500, 25.0000), Color_Smooth, vec3(0.9804, 0.5608, 0.8196));
    }
  }
  // 07 Dropdowns
  if (p.x >= 968.0000 && p.x <= 1868.0000 && p.y >= 760.0000 && p.y <= 1043.0000) {
    if (p.x >= 986.0000 && p.x <= 1266.6667 && p.y >= 818.0000 && p.y <= 917.5000) {
      drawDrop(col,p,vec2(998.0000, 877.5000), 256.6667, (Drop_First * 0.5), vec3(0.9569, 0.7647, 0.4353));
    }
    if (p.x >= 1277.6667 && p.x <= 1558.3333 && p.y >= 818.0000 && p.y <= 917.5000) {
      drawDrop(col,p,vec2(1289.6667, 877.5000), 256.6667, (Drop_Last * 0.5), vec3(0.9569, 0.7647, 0.4353));
    }
    if (p.x >= 1569.3333 && p.x <= 1850.0000 && p.y >= 818.0000 && p.y <= 917.5000) {
      drawDrop(col,p,vec2(1581.3333, 877.5000), 256.6667, Drop_Values_Only, vec3(0.9569, 0.7647, 0.4353));
    }
    if (p.x >= 986.0000 && p.x <= 1266.6667 && p.y >= 926.5000 && p.y <= 1026.0000) {
      drawDrop(col,p,vec2(998.0000, 986.0000), 256.6667, Drop_Named_Values, vec3(0.9569, 0.7647, 0.4353));
    }
    if (p.x >= 1277.6667 && p.x <= 1558.3333 && p.y >= 926.5000 && p.y <= 1026.0000) {
      drawDrop(col,p,vec2(1289.6667, 986.0000), 256.6667, Drop_Smooth, vec3(0.9569, 0.7647, 0.4353));
    }
  }
  return vec4(col,1.0);
}
