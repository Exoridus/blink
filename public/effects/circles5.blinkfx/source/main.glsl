float circles(vec2 coord)
{
    float reso = 5.0;
    float width = RENDERSIZE.x / reso;

    vec2 center = floor(coord / width + 0.5) * width;
    float dist = distance(coord, center);

    float time = TIME * 0.9;
    float phase = dot(center, vec2(1.647346, 7.323874));
    float radius = width* (0.3 + sin(bassTime_scr*1.3 + phase) * 0.16);

    return dist - radius;
}

float line(vec2 coord, float seed)
{
    vec2 dir = vec2(-1.0, 1.0);
    float bound = dot(RENDERSIZE.xy, abs(dir));

    float speed = fract(seed * 4785.9433) * 0.3 + 0.3;
    float time = fract(script_time * speed )*1.1;

    float phase = TIME * (fract(seed * 438.454) * 3.3 + 3.3);
    float width = bound * 0.02 * (sin(phase) + 1.0);

    float dist = dot(coord, dir) + (time - 0.5) * bound;
    return abs(dist) - width;
}

vec4 renderMain()
{
    if (PASSINDEX == 0.0){
        vec2 p = _xy.xy;
        p = mix(p, p-_uvc*RENDERSIZE.y*2.0, pop);
        
        float c = 1e+6;
        for (int i = 0; i < 4; i++)
            c = min(c, line(p, 94.3 * float(i)));

        float circ = circles(p);
        float glow = 1000.0;
        for (int i = 0; i <4; i++){
            glow = min(glow, line(p*1.0, 100.0*(1.0-_uvc.x*rain) * float(i)));
        }

        c = max(c, circles(p));
        c = clamp(1.0 - abs(1.0 - c), 0.0, 1.0);
        
        vec4 finalCol = vec4(c);

        finalCol += clamp(1.0-circ,0.0,1.0)*clamp(1.0-glow,0.0,1.0);

        if (_isMediaActive()){
            finalCol = _loadMedia()*(1.0-clamp(circ, 0.0, 1.0)) + finalCol;
        }

        finalCol = mix(finalCol, texture(firstBuffer, _uv+normalize(_uvc)*pow(feedback_warp,2.0)), feedback_on);

        return finalCol;
    } else if (PASSINDEX == 1.0){
        return texture(firstBuffer, _uv);
    }
}