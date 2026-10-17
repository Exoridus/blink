			//******** BuffA Code Begins ********

float hash12(vec2 p) {
	float h = dot(p , vec2(127.1,311.7));	
  return fract(abs(sin(h)*43758.5453123));
}

vec4 posUpdate(vec4 posVel){
  vec4 posVelOut = posVel;
  posVelOut.zw -= 0.5;
  // posVelOut.zw = _rotate(posVelOut.zw, syn_OnBeat*0.1*beat_randomizer);
  //Update the velocities to new random velocities for 1/3 of the particles.
  if ((syn_OnBeat == 1.0)&&(beat_randomizer>0.5)){
    posVelOut.z = (hash12(posVel.xy + TIME * 47.) / 2. - .5) * 2.;
    posVelOut.w = (hash12(posVel.xy * 1000.+ TIME * 100.) / 2. - .5) * 4.;
  }
  posVelOut.xy += (posVelOut.zw)*particle_speed*particle_speed*mix(1.0, 
  (0.05+pow(syn_Level, 3.0)*0.5+pow(syn_Hits, 3.0)*0.45), audio_motion);

  posVelOut.zw += 0.5;
  posVelOut.x = mod(posVelOut.x, 16.0/9.0);
  posVelOut.y = mod(posVelOut.y, 1.0);
  posVelOut.zw = fract(posVelOut.zw);
  return posVelOut;
}

#define NUMPOINTS 72

vec4 renderPassA() {
	vec4 C = vec4(0.0);
	vec2 fragCoord = _xy;

    C = vec4(-.5);
    
    // buffer texure
    
    if (int(fragCoord.y) < NUMPOINTS) {        
        // first column -- position
        if (int(fragCoord.x) == 0) {        
            if (FRAMECOUNT < 4) {            
                // initial position
                C.x = (hash12(fragCoord.xy) / 2. - .5) * 4.0;
                C.y = (hash12(fragCoord.yx) / 2. - .5) * 2.;
				
                // initial speed vector
                C.z = (hash12(fragCoord.xy * C.xy) / 2. - .5) * 2.;
                C.w = (hash12(C.xy * 1000.+ TIME * 100.) / 2. - .5) * 4.;
            } else {
			    		// previous frame
              C = texelFetch(BuffA, ivec2(fragCoord.xy), 0);  
              C = posUpdate(C);
            }
        }	

        // second column -- nearest point position
        if (int(fragCoord.x) == 1) {
            float minDist = 2.;
            
            // 1st column 
            vec4 pos = texelFetch(BuffA, ivec2(0, fragCoord.y), 0);
            pos = posUpdate(pos);

            // test all values stored in 1st column.
            for (int i = 0; i < NUMPOINTS-48*int(FPS_fewer_particles); i++) {
            	vec4 testPos = texelFetch(BuffA, ivec2(0, i), 0);
              testPos = posUpdate(testPos);

              float d = distance(pos.xy, testPos.xy);
              if (int(fragCoord.y) == i){
              	continue;
              }
              if (d < minDist) {
                minDist = d;
                C.xy = testPos.xy;   
              }

              
              // if (d < minDist) {
              //   if (d < 1. - vol) {
              //     C.xy = H.xy;
              //     minDist = d;
              //     if (dot(G.xy, C.xy) > .5) {
              //       C.w = 1.;   
              //     }
              //     break;
              //   } else {
              //     C.xy = G.xy;   
              //   }
              // }
            }
            
            C.w -= 0.1;
            C.w = max(C.w, 0.);
        }
        
        // // third column - copy of sound texture 
        // if (int(fragCoord.x) == 2) {
        //     C.r = vol;
        // }
    }
    
    
	return C; 
 } 

// Fork of "Buffer computed points." by patu. https://shadertoy.com/view/XllBRj
// http://bit.ly/shadertoy-plugin

float SqDistancePtSegment( vec2 a, vec2 b, vec2 p )
{
    vec2 
        pa = p - a, 
        ba = b - a,
    	d = pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
    
    return dot(d, d);
}

vec4 renderParticles() {
  vec4 media = _loadMedia();

	vec3 col = vec3(0.0);
	vec2 fragCoord = _xy;
	vec2 uv = fragCoord.xy / RENDERSIZE.xy;
    
  uv.x *= RENDERSIZE.x / RENDERSIZE.y;
    
  vec2 u = uv;
  vec3 tex = _loadMedia().rgb;
  int numToDraw = NUMPOINTS - 48*int(FPS_fewer_particles);
  for (int y = 0; y < numToDraw; y++) {

    vec4 c1 = texelFetch(BuffA, ivec2(0, y), 0); // data from bufA 1st column
    vec4 c2 = texelFetch(BuffA, ivec2(1, y), 0); // data from bufA 2nd column 

    int rand1 = y%(numToDraw/2);
    int rand2 = int(clamp(y+y%3-3, 0, numToDraw));
    // int rand3 = numToDraw-y;
    vec4 cr1 = texelFetch(BuffA, ivec2(0, rand1), 0); // data from bufA 2nd column 
    vec4 cr2 = texelFetch(BuffA, ivec2(0, rand2), 0); // data from bufA 2nd column 
    // vec4 cr3 = texelFetch(BuffA, ivec2(0, rand3), 0); // data from bufA 2nd column 

    // F += step(distance(_uv, c1.xy), 0.004);

    // c1.x *= RENDERSIZE.x/RENDERSIZE.y;
    // c2.x *= RENDERSIZE.x/RENDERSIZE.y;

    // float seg = floor(y*6.0/NUMPOINTS);
    // seg = mod(y+syn_BeatTime, floor(numLines));
    // float volc = 0.0;
    // volc += ind0*step(seg, 1);
    // volc += ind1*step(seg, 2);
    // volc += 0.5;
    // volc += ind2*_pulse(float(y), 10.0, 2.0);

    // F = mix(F, vec4(1.0,0.0,0.0,0.0) * 1.1 * volc, smoothstep(0., 1., 1. / length(uv - c1.xy) * .004))*10.0;
    // F += vec4(0.0,0.0,1.0,0.0) * 1.1 * volc*smoothstep(0., 1., 1. / length(uv - c2.xy) * .0025)*10.0;

    float volc = syn_BassLevel;
    float pSel = y/float(numToDraw);
    float pSelNext = (y+1)/float(numToDraw);
    // vec3 segCol = vec4(_hsv2rgb(vec3(c1.x*0.125 + syn_Time*0.005, syn_HighHits, syn_Hits)),0.0);       
    // vec4 pCol = vec4(_hsv2rgb(vec3(c1.x*0.2 + syn_Time*0.005, 1.0, 1.0)),0.0);
    vec3 pCol = mix(vec3(0.0, 1.0, 0.8), vec3(0.0, 0.3, 1.0), 0.5+0.5*sin(pSel*2*PI+syn_BPMTwitcher));
    vec3 pCol2 = mix(vec3(0.0, 1.0, 0.8), vec3(0.0, 0.3, 1.0), 0.5+0.5*sin((1.0-pSel)*2*PI+syn_BPMTwitcher));

    // segment
    vec3 segCol = vec3(1.0);

    //Add in Media Colors
    if (particle_col > 0.5){
      vec3 col = _textureMedia(vec2(1.0)*pSel).rgb;
      pCol = col*2.0;
      segCol = col*2.0;
    }

    if (simple_multiply > 0.5){
      pCol = tex*2.0;
      segCol = tex*2.0;
    }

    float thicknessSegments = .000003;
    if ( minimal_mode < 0.5){
      float closestSegment = SqDistancePtSegment(c1.xy, c2.xy, uv);
      float progress = distance(c1.xy, uv)/distance(c1.xy, c2.xy);
      segCol = mix(pCol, pCol2, progress);
      // segCol *= pow(_pulse(progress, 0.5, 0.495), 0.5);

      //Give the segments some audio reactivity
      segCol.rgb = _rgb2hsv(segCol.rgb);
      segCol.g -= pow(syn_OnBeat, 0.25);
      segCol.g = clamp(segCol.g, 0.0, 1.0);
      // segCol.b += syn_Hits*syn_Presence;
      segCol.rgb = _hsv2rgb(segCol.rgb);
      col += pCol * 2.5 * smoothstep(0., 1., 1./length(uv - c1.xy)*(0.002));
      col += segCol * (1. - smoothstep(0.0, thicknessSegments, closestSegment))*mix(1.0, syn_HighHits, flashing_lines); 
    } else {
      float segR1 = SqDistancePtSegment(c1.xy, cr1.xy, uv);
      float pR1 = distance(c1.xy, uv)/distance(c1.xy, cr1.xy);
      float segR2 = SqDistancePtSegment(c1.xy, cr2.xy, uv);
      float pR2 = distance(c1.xy, uv)/distance(c1.xy, cr2.xy);
      // segCol = mix(pCol, vec3(1.0), particle_col);

      thicknessSegments = .0000015;
      float dWall1 = min(min(c1.x,c1.y), min(RENDERSIZE.x/RENDERSIZE.y-c1.x,1.0-c1.y));
      float dWall2 = min(min(cr1.x,cr1.y), min(RENDERSIZE.x/RENDERSIZE.y-cr1.x,1.0-cr1.y));
      float dWall3 = min(min(c2.x,c2.y), min(RENDERSIZE.x/RENDERSIZE.y-c2.x,1.0-c2.y));
      float dWall4 = min(min(cr2.x,cr2.y), min(RENDERSIZE.x/RENDERSIZE.y-cr2.x,1.0-cr2.y));
      float distWall = pow(min(min(dWall1, dWall2), min(dWall3, dWall4)), 2.0)*16.0;
      col += mix(vec3(1.0), pCol, particle_col)*2.5 * smoothstep(0., 1., 1./length(uv - c1.xy)*(0.00075+0.0005*sin(_uv.x+cos(_uv.y+syn_HighTime*0.1))))*pow(distWall, 0.5);
      col += segCol * (1. - smoothstep(0.0, thicknessSegments, segR1))*distWall; 
      col += segCol * (1. - smoothstep(0.0, thicknessSegments, segR2))*distWall; 
      // col += pulse1 * (1. - smoothstep(0.0, thicknessSegments*7.0, segR1)); 
      // col += pulse2 * (1. - smoothstep(0.0, thicknessSegments*7.0, segR2)); 
    }
  }    

  //midglow
  // F += vec4(1.0,0.8,0.0,0.0)*(1. - smoothstep(0.0, .00001*syn_Hits, SqDistancePtSegment(c1.xy, c2.xy, uv)));


  vec2 offset = vec2(0.0, 0.0);
  vec2 upVector = vec2(0.0, 1.0);
  // float noiseVal = snoise(vec3(_uvc*5.0, 0.0));
  offset -= upVector*0.02*sign(vertical_flow)*vertical_flow*vertical_flow*mix(1.0, syn_BassLevel, reactive_flow);
  offset += (_uvc+vec2(0.0,-pow(mix(0.0, syn_BassLevel, reactive_flow), 2.0)*0.5))*0.1*flow_in_out;



  vec4 last = texture(BuffC, _uv+offset);
  // last.rgb = clamp(_pixelate(last.rgb, 10)-0.1, 0.0, 1.0);


  // for (int i = 0; i < 4; i ++){
  //   last.rgb = _pixelate(last.rgb, 10);
  // }
  // last.rgb = _rgb2hsv(last.rgb);
  // last.g -= 0.01;
  // last.rgb = _hsv2rgb(last.rgb);
  col = clamp(col, 0.0, 1.0);
  vec4 finalCol = vec4(col, 1.0);
  float mask = mix(1.0, 1.0-step(dot(media.rgb, vec3(1.0))/3.0, 0.5), feedback_mask);
  finalCol = mix(finalCol, finalCol + last*0.9, 0.99*pow(flow_amount, 0.1)*mask);
  // F = texelFetch(BuffA, ivec2(_xy*0.08), 0);
	return finalCol; 
 } 

vec4 renderFeedback(){
  return texture(BuffB, _uv);
}
vec2 _rotateAboutCenter(vec2 uvIn, float amt){
  vec2 uvNew = uvIn;
  _uv2uvc(uvNew);
  uvNew = _rotate(uvNew, amt);
  _uvc2uv(uvNew);
  return uvNew;
}
vec4 renderMultiLayer(){
  vec2 mirPos = _uv*2.0;

  if (mirPos.x>1.0){
    mirPos.x = 1.0-mirPos.x;
  }
  if (mirPos.y>1.0){
    mirPos.y = 1.0-mirPos.y;
  }
  int iter = int(multiplexer_layers);
  vec4 allLayers = vec4(0.0);
  if (multiplexer_on > 0.5){
      for (int i = 1; i<iter; i++){
        float iF = float(i);
        float lowest = 1.0-step(2.0, iF);
        float highest = step(iter-1, iF);

        // float layerNum = 4.0/pow(iF, 0.75);
        // float nextLayerNum = 4.0/pow((iF+1), 0.75);
        float layerNum = pow(iF, 0.75);
        float nextLayerNum = pow((iF+1), 0.75);
        float amtToNext = fract(scr_time);
        float lowestMix = amtToNext;
        float highestMix = 1.0-amtToNext;
        float mixVal = mix(1.0, lowestMix, lowest);
        mixVal = mix(mixVal, highestMix, highest);
        // float layerNum = pow(i+1, 2.0);
        float zoomAmt = mix(1.0, mix(layerNum, nextLayerNum, amtToNext),zoom_power);
        vec2 randomSpot = vec2(_rand(i-floor(scr_time)),_rand(i+77-floor(scr_time)));
        vec2 zoomPos = _uv;
        zoomPos *= zoomAmt;
        zoomPos += vec2(1.0-zoomAmt)*0.5;

        vec4 layer = texture(BuffC, zoomPos+randomSpot*randomize_layers);
        allLayers += layer*mixVal;
      }
    } else {
      allLayers = texture(BuffC, _uv);
    }
  return allLayers;
}

vec4 renderMain(){
	if(PASSINDEX == 0) {
		return renderPassA();
	} else if(PASSINDEX == 1) {
		return renderParticles();
	} else if(PASSINDEX == 2) {
    return renderFeedback();
  } else if(PASSINDEX == 3) {
    return renderMultiLayer();
  }
}