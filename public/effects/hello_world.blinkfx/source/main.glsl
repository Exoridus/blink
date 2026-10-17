
vec3 splitScreen(vec3 screen1, vec3 screen2, vec3 screen3, float split_value) {
  if (_uv.y < .25) {
    return screen3;
  } else if (_uv.y < split_value) {
     return screen2; 
  } else {
    return screen1;
  }
  // return (_uv.y > split_value) ? screen1 : screen2;
}

bool isInsideCircle(vec2 circlePosition, float circleSize) {
  return distance(_uvc, circlePosition) < circleSize;
}

vec3 drawSplitScreen() {
  vec3 screen1 = vec3(0, 0, syn_HighLevel);
  vec3 screen2 = vec3(0, syn_MidLevel, 0);
  vec3 screen3 = vec3(syn_BassLevel, 0, 0);
  return splitScreen(screen1, screen2, screen3, split_position);
}

/**
 * Main Rendering Function
 * The vec4 return from this will be the pixel color for the current pass.
 */
vec4 renderMain() {
  vec3 finalColor = isInsideCircle(circle_position, 0.2 + grow_circle)
    ? vec3(1.0, 0.75, 0.1)
    : drawSplitScreen();
  
  if (color_transition > 0.5) {
    finalColor = 1.0 - finalColor;
  }

  return vec4(finalColor, 1.0);
  // return vec4(background * (1.0 - insideCircle), 1.0);
  //return vec4(_uvc.x * syn_OnBeat, _uvc.y * syn_HighLevel, 0, 1);
  // return vec4(_uvc.x * syn_BassLevel, _uvc.y * syn_HighLevel, 0, 1);
  // return vec4(1, 0, 1, 1); //Return the color red
}
