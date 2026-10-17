// more here: https://thebookofshaders.com/edit.php#06/easing.frag
// vec3 colorA = vec3(0.149, 0.141, 0.912);
// vec3 colorB = vec3(1.000, 0.833, 0.224);

vec3 colorA = vec3(0.00, 0.00, 0.00);
// vec3 colorB = vec3(0.65,0.05,0.14);
vec3 colorB = vec3(0.80, 0.00, 0.00);
// vec3 colorB = vec3(1.00, 0.00, 0.00);

float linear(float t) {
  return t;
}

float exponentialIn(float t) {
  return t == 0.0 ? t : pow(2.0, 10.0 * (t - 1.0));
}

float circularInOut(float t) {
  return t < 0.5
    ? 0.5 * (1.0 - sqrt(1.0 - 4.0 * t * t))
    : 0.5 * (sqrt((3.0 - 2.0 * t) * (2.0 * t - 1.0)) + 1.0);
}

float bounceOut(float t) {
  const float a = 4.0 / 11.0;
  const float b = 8.0 / 11.0;
  const float c = 9.0 / 10.0;

  const float ca = 4356.0 / 361.0;
  const float cb = 35442.0 / 1805.0;
  const float cc = 16061.0 / 1805.0;

  float t2 = t * t;

  return t < a
    ? 7.5625 * t2
    : t < b
      ? 9.075 * t2 - 9.9 * t + 3.4
      : t < c
        ? ca * t2 - cb * t + cc
        : 10.8 * t * t - 20.52 * t + 10.72;
}

float smile(float t) {
  float edgeRamp = 11.0;
  float midRamp = 4.5;
  float midDepth = 0.25;

  // float 
  float calc = t < 0.3 
    ? edgeRamp * pow(t, 2.0)
    : t > 0.7
      ? (edgeRamp * pow(1.0 - t, 2.0))
      : pow(t * midRamp - (0.5 * midRamp), 2.0) + midDepth;

  return min(1.0, calc);
}

float ease(float t) {
  // return linear(t);
  // return exponentialIn(t);
  // return bounceOut(t);
  // return circularInOut(t);
  return smile(t);
}

float plot (vec2 st, float pct){
  return  smoothstep( pct-0.01, pct, st.y) -
          smoothstep( pct, pct+0.01, st.y);
}

float calcT(float t) {
  // return sin(t / .2) * .5 + .5;
  // return sin(t) * .5 + .5;
  // return sin(t * HALF_PI) * .5 + .5;
  // return abs(sin(t));
  // return abs(sin(t * PI));
  return abs(sin(t * (PI / 2)));
  // return abs(sin(t * (PI / (2 + syn_BassLevel)));
}

vec4 renderMain() {
  vec3 color = vec3(0.0);

  float t = calcT(TIME);
  float pct = ease(t);
  // float pct = ease(_uv.x);

  color = mix(colorA, colorB, pct);

  color = mix(color, vec3(0.0, 1.0, 0.0), plot(_uv, calcT(_uv.x)));
  color = mix(color, vec3(0.0, 0.0, 1.0), plot(_uv, ease(_uv.x)));
  color = mix(color, vec3(0.0, 1.0, 1.0), plot(_uv, ease(calcT(_uv.x))));
  color = mix(color, vec3(1.0, 1.0, 1.0), plot(_uv.yx, t));

	return vec4(color, 1.0);
}
