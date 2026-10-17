float cityHash(float value) {
    return fract(sin(value * 127.1 + 31.7) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy / bl_resolution;
    float t = bl_time * speed;
    float bass = clamp(au_bass * sensitivity, 0.0, 1.5);
    float mids = clamp(au_mid * sensitivity, 0.0, 1.5);
    float highs = clamp(au_high * sensitivity, 0.0, 1.5);
    float cell = floor(uv.x * float(columns));
    float x = fract(uv.x * float(columns));
    float height = 0.13 + cityHash(cell) * 0.38;
    height += bass * 0.17 + sin(cell * 0.9 + t) * (0.015 + mids * 0.035);
    float baseline = 0.2;
    float y = uv.y - baseline;
    float shape = smoothstep(0.035, 0.055, x) * (1.0 - smoothstep(0.945, 0.965, x));
    float body = shape * (1.0 - smoothstep(height, height + 0.003, y)) * step(0.0, y);
    vec3 tower = mix(vec3(0.04, 0.85, 0.75), vec3(0.9, 0.15, 0.55), uv.x);
    float windowRow = floor(max(y, 0.0) * 64.0);
    float window = step(0.64 - mids * 0.15, cityHash(cell * 43.0 + windowRow));
    window *= step(0.24, x) * step(x, 0.76) * step(0.35, fract(y * 64.0));
    vec3 color = mix(vec3(0.007, 0.009, 0.028), tower * (0.15 + window * 0.75), body);
    float roof = exp(-abs(y - height) * 250.0) * shape;
    color += tower * roof * (0.65 + highs * 0.7);
    float horizon = exp(-abs(y) * 180.0);
    color += vec3(0.15, 0.55, 0.95) * horizon;
    float reflected = shape * step(y, 0.0) * exp(y * 16.0);
    reflected *= 0.5 + 0.5 * sin(y * 160.0 + t * 3.0 + sin(uv.x * 60.0));
    color += tower * reflected * (0.12 + bass * 0.15);
    fragColor = vec4(1.0 - exp(-color * 1.4), 1.0);
}
