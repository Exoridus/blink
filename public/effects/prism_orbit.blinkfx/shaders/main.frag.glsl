vec3 orbitPalette(float phase) {
    return 0.55 + 0.45 * cos(6.283185 * (phase + vec3(0.0, 0.33, 0.67)));
}

void main() {
    vec2 p = (2.0 * gl_FragCoord.xy - bl_resolution) / bl_resolution.y;
    float t = bl_time * speed;
    float bass = clamp(au_bass * sensitivity, 0.0, 1.5);
    float mids = clamp(au_mid * sensitivity, 0.0, 1.5);
    float highs = clamp(au_high * sensitivity, 0.0, 1.5);
    vec3 color = vec3(0.004, 0.007, 0.018);
    for (int i = 0; i < 7; i++) {
        float layer = float(i);
        float angle = t * (0.12 + layer * 0.03) + layer * 0.48;
        mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        vec2 q = rotation * p;
        q.y *= 1.4 + 0.35 * sin(t * 0.4 + layer);
        float a = atan(q.y, q.x);
        float radius = 0.22 + layer * 0.11 + bass * 0.06;
        float ripple = sin(a * (3.0 + layer) + t + layer) * (0.012 + mids * 0.025);
        float distanceToRing = abs(length(q) - radius - ripple);
        float glow = 0.0025 / (distanceToRing * distanceToRing + 0.0018);
        float filament = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(a * 12.0 - t * 2.0 + layer), 3.0);
        color += orbitPalette(layer * 0.13 + sin(a) * 0.04 + t * 0.015) * glow * filament * (0.24 + highs * 0.16);
    }
    color *= mix(vec3(1.0), tint.rgb * 1.5, 0.28);
    color *= exp(-0.32 * dot(p, p));
    fragColor = vec4(1.0 - exp(-color), 1.0);
}
