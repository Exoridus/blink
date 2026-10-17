void main() {
    vec2 p = (2.0 * gl_FragCoord.xy - bl_resolution) / bl_resolution.y;
    float t = bl_time * speed * 0.25;
    float bass = clamp(au_bass * sensitivity, 0.0, 1.5);
    float mids = clamp(au_mid * sensitivity, 0.0, 1.5);
    float highs = clamp(au_high * sensitivity, 0.0, 1.5);
    vec2 q = p;
    for (int i = 0; i < 5; i++) {
        float layer = float(i) + 1.0;
        q += vec2(sin(q.y * layer + t), cos(q.x * layer - t * 0.7)) * (0.18 + bass * 0.05) / layer;
    }
    float field = sin(q.x * 2.5 + t) * cos(q.y * 2.0 - t);
    field += 0.35 * sin(q.x * 3.0 + q.y * 2.0 + t * 1.3);
    float bands = 0.5 + 0.5 * sin(field * detail + mids * 1.4);
    float veins = pow(bands, 12.0 - highs * 3.0);
    vec3 dark = vec3(0.012, 0.025, 0.055);
    vec3 pigment = mix(vec3(0.02, 0.22, 0.3), vec3(0.35, 0.08, 0.27), 0.5 + field * 0.3);
    vec3 color = mix(dark, pigment, bands * 0.65);
    color += mix(vec3(0.12, 0.9, 0.75), vec3(1.0, 0.55, 0.25), 0.5 + field * 0.35) * veins * (0.4 + mids * 0.4);
    color *= exp(-0.25 * dot(p, p));
    fragColor = vec4(1.0 - exp(-color * 1.8), 1.0);
}
