// Based on the galaxy of the universes by Dave_Hoskins
//
// https://www.shadertoy.com/view/MdXSzS
// The Big Bang - just a small explosion somewhere in a massive Galaxy of Universes.
// Outside of this there's a massive galaxy of 'Galaxy of Universes'... etc etc. :D
// License: Unknown


vec3 whiteColor = vec3(0.99, 0.99, 0.99); //define white
vec4 renderMainImage() {
	vec4 fragColor = vec4(0.0);
	float c = curved;
	if (c<0.0) {
		c = c - 3.0;
	}
	vec2 uv = _uv - .5+GalaxyXY;
	float t = TIME * .1 + ((.25 + .05 * sin(TIME * .1))/(c*length(uv.xy) + 0.07)) * 2.2  + syn_BassTime*0.2;
	float si = sin(t);
	float co = cos(t);
	mat2 ma = mat2(co, si, -si, co);

	float v1, v2, v3;
	v1 = v2 = v3 = 0.0;

	float s = 0.0;
	for (int i = 0; i < 60; i++) // *(syn_HighLevel+syn_MidLevel)
	{
		vec3 p = s * vec3(uv, 0.0);
		p.xy *= ma/(rot_zoom+bass_rot_zoom/(syn_OnBeat+0.1));
		p += vec3(.22, .3, s - 1.5 - sin(TIME * .13) * .1);
		for (int i = 0; i < 9; i++)	p = abs(p) / dot(p,p) - 0.659;
		v1 += dot(p,p) * .0030 * (1.8 + sin(length(uv.xy * 13.0) + .5  - TIME * .2));
		v2 += dot(p,p) * .0010 * (1.5 + sin(length(uv.xy * 14.5) + 1.2 - TIME * .3));
		v3 += length(p.xy*10.) * .0003;
		s  += .035;
	}

	float len = length(uv)/(syn_BassLevel+syn_MidLevel)*2.0;
    // galaxy center
    float len2 = length(uv*vec2(1.5,1.0))/syn_BassLevel;
    // jet
    float len3 = length(uv*vec2(15,1.0))/syn_BassLevel;

    v1 *= smoothstep(.7, .0, len);
	v2 *= smoothstep(.5, .0, len);
	v3 *= smoothstep(.9, .0, len);

	vec3 col = vec3( v3, v1 * .1, v2) + smoothstep(0.2, .0, len2) * .85 + smoothstep(.0, .6, v3) * .3
    + smoothstep(0.5, .0, len3) * .25;

    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 colg = vec3(1.0, 1.0, 1.0)*gray;
	fragColor=vec4(min(pow(abs(colg), vec3(1.2)), 1.0), 1.0);
	return fragColor;
 }


vec4 renderMain(){

        vec4 result = renderMainImage();
        if (syn_MediaType > 0.5){
					  vec3 i  = _loadUserImage().rgb ;
						if (i.x > 0.98 && i.y >0.98 && i.z>0.98) {
							result.rgb = i;
						} else {
                            result.rgb += i*bg_opacity*(_scale(syn_BassLevel,0.8,1.0));
						}
        }

		return result;

}
