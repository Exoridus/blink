vec3 sunset() {
  float sunRotation = - 1 * PI / 2.5;

  // TODO: Is there a trick we could use to prevent jumps when tweaking animation params?
  // on/off jumps from base position
  // speed change fast-forwards or rewinds
  if (animate > 0) {
    sunRotation -= TIME * animation_speed;
  }

  vec2 sunPos = _rotate(_uvc, sunRotation);
  float pct = (sunPos.x + sunPos.y) / 2;
  vec3 skyGradient = mix(sky_color, sun_color, pct);

  if (_uv.y > horizon) {
    return skyGradient;
  }

  vec3 water = vec3(0.25, 0.27, 0.34);

  // TODO: how can we "reflect" the gradient on the water's surface?
  // pct = ((sunPos.x) + (1 - sunPos.y)) / 2;
  // float pct = (((1 - xySunPos.x) + (xySunPos.y)) / 1.5)
  // float pct = (((1 - xySunPos.x) + (xySunPos.y)) / 1.5)

  vec3 reflectionGradient = mix(sky_color, sun_color, pct);

  vec3 color = mix(reflectionGradient, water, 0.5);


  return color;
}

vec3 germanflag() {
  // naive approach (forgot the "range" trick)
  return (1 - step(2.0 / 3.0, _uv.y)) * vec3(1.0, 0.0, 0.0)
       + (1 - step(1.0 / 3.0, _uv.y)) * vec3(0.0, 1.0, 0.0);
}

float yBetween(float a, float b, float size) {
  return step(a * size, _uv.y) - step(b * size, _uv.y);
}

vec3 prideFlag() {
  float stripeSize = 1.0 / 6.0;

  return yBetween(5.0, 6.0, stripeSize) * vec3(0.89, 0.05, 0.10)
       + yBetween(4.0, 5.0, stripeSize) * vec3(0.99, 0.55, 0.15)
       + yBetween(3.0, 4.0, stripeSize) * vec3(1.00, 0.93, 0.21)
       + yBetween(2.0, 3.0, stripeSize) * vec3(0.07, 0.50, 0.18)
       + yBetween(1.0, 2.0, stripeSize) * vec3(0.06, 0.33, 0.98)
       + yBetween(0.0, 1.0, stripeSize) * vec3(0.46, 0.08, 0.53);
}

/**
 * -1 * abs(-5x + start) +2
 * bounded to 0:1
 */
float rampFrom(float x, float start) {
  return max(0, min(1.0, -1.0 * abs(-5.0 * x + start) + 2.0));
}

vec3 rainbow() {
  /*
   * T:  0 1 2 3 4 5
   * R:  1 1 0 0 0 1
   * G:  0 1 1 1 0 0
   * B:  0 0 0 1 1 1
  */
  vec3 rainbow = vec3(
    rampFrom(_uv.x, 0) + rampFrom(_uv.x, 6),
    rampFrom(_uv.x, 2),
    rampFrom(_uv.x, 4)
  );

  // TODO: Can we do this with mix?
  // vec3 red = vec3(1.0, 0.0, 0.0);
  // vec3 green = vec3(0.0, 1.0, 0.0);
  // vec3 blue = vec3(0.0, 0.0, 1.0);
  // vec3 rainbow = vec3(0.0, 0.0, 0.0);
  // rainbow = mix(rainbow, red,   rampFrom(_uv.x, 0));
  // rainbow = mix(rainbow, green, rampFrom(_uv.x, 2));
  // rainbow = mix(rainbow, blue,  rampFrom(_uv.x, 4));
  // rainbow = mix(rainbow, red,   rampFrom(_uv.x, 6));

  return rainbow;
}

vec3 rainbowify(vec3 color) {
  float showRainbow = 1 - min(show_german_flag + show_pride_flag, 1);

  vec3 mask = show_pride_flag  * prideFlag()
            + show_german_flag * germanflag()
            + showRainbow      * rainbow();

  return mix(mask, color, 1 - rainbow_mask);
}

vec4 renderMain() {
  vec3 color = rainbowify(sunset());

  return vec4(color, 1);
}