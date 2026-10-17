float plot(vec2 st, float pct){
  return smoothstep( pct-0.01, pct, st.y) -
         smoothstep( pct, pct+0.01, st.y);
  
  // return step(pct -0.01, st.y) - step(pct + 0.01, st.y);
}

/**
 * Main Rendering Function
 * The vec4 return from this will be the pixel color for the current pass.
 */
vec4 renderMain() {
  /*
  vec2 st = gl_FragCoord.xy/u_resolution;
	gl_FragColor = vec4(st.x,st.y,0.0,1.0);
  */
  // vec2 st = vec2(_uv / RENDERSIZE);

  // return vec4(_uv.x, _uv.y, 0.0, 1.0);

  float exp = syn_BassLevel * 5.0;
  float y = pow(_uv.x, exp);
  // float y = pow(cos(PI * _uv.x / 2.0), exp);
  // float y = pow(abs(sin(PI * _uv.x / 2.0)), exp);
  // float y = pow(min( cos(PI * _uv.x / 2.0), 1.0 - abs(_uv.x)), exp);
  // float y = pow(max(0.0, abs(_uv.x) * 2.0 - 1.0), exp);

  // float y = step(0.5, pow(_uv.x, skn_MidLevel * 5));

  vec3 bgColor = vec3(y);

  // Plot a line
  float pct = plot(_uv, y); // pct stands for "percent"
  bgColor = (1.0-pct) * bgColor + pct * vec3(0.0, syn_BassLevel, 0.0);

	return vec4(bgColor,1.0);
}
