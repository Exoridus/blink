vec3 hash3( vec2 p )
{
    vec3 q = vec3( dot(p,vec2(127.1,311.7)), 
           dot(p,vec2(269.5,183.3)), 
           dot(p,vec2(419.2,371.9)) );
  return fract(sin(q)*43758.5453);
}

float iqnoise(vec2 x, float u, float v )
{
  vec2 p = floor(x);
  vec2 f = fract(x);
    
  float k = 1.0+63.0*pow(1.0-v,4.0);
  
  float va = 0.0;
  float wt = 0.0;
  for( int j=-2; j<=2; j++ )
  for( int i=-2; i<=2; i++ )
  {
    vec2 g = vec2( float(i),float(j) );
    vec3 o = hash3( p + g )*vec3(u,u,1.0);
    vec2 r = g - f + o.xy;
    float d = dot(r,r);
    float ww = pow( 1.0-smoothstep(0.0,1.414,sqrt(d)), k );
    va += o.z*ww;
    wt += ww;
  }

  return va/wt;
}

vec3 colorPaletteChooser(float colReg, float var){
  vec3 paletteCol = vec3(0.5);
  if (colReg < 1.0){
    paletteCol = _palette(var, vec3(0.500, 0.500, 0.520), vec3(0.500, 0.500, 0.500), vec3(0.780, 0.765, 0.750), vec3(0.360, 0.570, 0.680));
  } else if (colReg < 2.0){
    paletteCol = _palette(var, vec3(0.500, 0.580, 0.500), vec3(0.190, 0.460, 0.500), vec3(0.760, 0.740, 0.580), vec3(1.000, 0.300, 0.490));
  } else if (colReg < 3.0){
    paletteCol = _palette(1.0-var,vec3(0.500, 0.940, 0.900), vec3(0.600, 0.640, 0.350), vec3(0.680, 1.020, 0.405), vec3(0.380, 0.440, 0.095));
  } else if (colReg < 4.0){
    paletteCol = _palette(var,vec3(0.500, 0.500, 0.500), vec3(0.500, 0.500, 0.500), vec3(0.500, 0.825, 0.750), vec3(0.500, 0.500, 0.500));
  } else if (colReg < 5.0){
    paletteCol = _palette(1.0-var,vec3(0.000, 0.580, 0.453), vec3(0.848, 0.703, 0.110), vec3(0.700, 0.175, 0.542), vec3(0.000, 0.182, 0.915));
  } else if (colReg < 6.0){
    paletteCol = _palette(var,vec3(0.129, 0.359, 0.072), vec3(0.933, 0.561, 0.616), vec3(0.334, 1.013, 0.882), vec3(0.597, 0.050, 0.885));
  } else if (colReg < 7.0){
    paletteCol = _palette(var,  vec3(-0.060, -0.340, 0.100), vec3(0.940, 0.840, 0.713), vec3(0.600, 0.735, 0.7191), vec3(0.500, 0.260, 0.335));
  } else if (colReg < 8.0){
    paletteCol = _palette(var,  vec3(-0.060, -0.340, 0.100), vec3(0.940, 0.840, 0.713), vec3(0.600, 0.735, 0.2191), vec3(0.500, 0.260, 0.335));
  } else if (colReg < 9.0){
    paletteCol = _palette(var,vec3(0.000, 0.040, 0.073), vec3(0.000, 0.530, 0.420), vec3(0.485, 0.930, 0.931), vec3(0.400, 0.599, 0.520));
  } else if (colReg < 10.0){
    paletteCol = _palette(1.0-var,vec3(1.040, 0.180, 0.260), vec3(0.053, 0.775, 0.330), vec3(0.142, 0.523, 0.800), vec3(0.242, 0.887, 0.000));
  }
  return paletteCol;
}

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

bool is_point_above_line(vec2 pt, float slope, float intercept) {
  bool returnMe = false;
  float y = slope * pt.x + intercept;
  if (y < pt.y)
    returnMe = true;
  return returnMe;
}

//  returns two values – distrance from the line and the percentage of the way on the line
float distance_from_point_to_line(vec2 pt, vec2 l1, vec2 l2){
  float returnMe = 0.0;
  float a = (l2.y - l1.y);
  float b = (l2.x - l1.x);
  float c = 0.0;
  
  //  if b is zero, this is a vertical line!
  //  in which case distance is based on x distance alone
  if (b == 0.0) {
    float minY = min(l1.y, l2.y);
    float maxY = max(l1.y, l2.y);
    
    //  if we're between the two points distrance is straight up x diff
    if ((pt.y > minY) && (pt.y < maxY)) {
      returnMe = abs(pt.x-l1.x);
    }
    else  {
      //returnMe = min(distance(pt, l1), distance(pt, l2));
      returnMe = -1.0;
    }
  }
  //  if a is zero, this is a horizontal line
  else if (a == 0.0)  {
    float minX = min(l1.x, l2.x);
    float maxX = max(l1.x, l2.x);
    
    //  if we're between the two points distrance is straight up y diff
    if ((pt.x > minX) && (pt.x < maxX)) {
      returnMe = abs(pt.y - l1.y);
    }
    else  {
      //returnMe = min(distance(pt, l1), distance(pt, l2));
      returnMe = -1.0;
    }
  }
  //  if b isn't 0, solve for c now that we know a, b, and either l1 or l2
  else  {   
    //  here's the tricky bit-
    //  if pt is beyond l1 and l2, we should switch to distance from those points
    //  in order to determine this we need to use the perpendicular lines to the segment l1|l2 that pass through l1 & l2
    //  the slope of the perp line will be -1.0 / slope of original line
    float m = a / b;
    float perpm = -b / a;
    vec2 left_line_pt = l1;
    vec2 right_line_pt = l2;
    if (l1.x > l2.x)  {
      left_line_pt = l2;
      right_line_pt = l1;
    }
    
    float perp_intercept1 = left_line_pt.y - perpm * left_line_pt.x;
    float perp_intercept2 = right_line_pt.y - perpm * right_line_pt.x;
    
    if (m > 0.0)  {
      returnMe = abs(a * pt.x - b * pt.y + l2.x * l1.y - l2.y * l1.x) / sqrt(a*a + b*b);
    }
    else  {
      returnMe = abs(a * pt.x - b * pt.y + l2.x * l1.y - l2.y * l1.x) / sqrt(a*a + b*b);
    }
  }
   
    return returnMe;
}

vec4 renderMain() {
  if (PASSINDEX == 0.0){
  vec4 out_FragColor = vec4(0.0);
  float   maxWidth = 3.0;
  float   minWidth = 0.01;
  
  vec4    result = vec4(0.0);
  vec2    thisPoint = _uvc*10.0;
  vec3    colorHSL;
  vec2    pt1, pt2;
  float   baseHue = rand(vec2(floor(num_beams), 1.0));
  
  vec2 wobbleVector = vec2(0.0);
  
  float width = maxWidth;
  float timeVar = syn_Time;
  float j = floor(timeVar);

  float bigNoise = iqnoise(500.0*_uvc, 1.0, 0.0);
  // float medNoise = iqnoise(1000.0*_uvc, 1.0, 0.0);
  // float smlNoise = iqnoise(10000.0*_uvc, 1.0, 1.0);

  float currentRegime = floor(j/num_beams);

  for (float i = 0.0; i < 60.0; ++i)  {
    float currentRank = mod(i+j,num_beams)/num_beams + (1/num_beams)*fract(timeVar);
    float lineSeed = i+floor((i+j)/num_beams)*3.0;
    float red = 0.0;
    // if (mod(i+j, lineCount) == 0){
    //   lineSeed += floor(timeVar/lineCount);
    //   red = 1.0;
    // }

    if (i >= num_beams - 1.0)
      break;

    vec2 pt1Rand = vec2(-0.5+rand(vec2(lineSeed+1.123,floor(num_beams)+1.321)),-0.5+rand(vec2((1.0+lineSeed)*floor(num_beams)+2.123,lineSeed+1.325)));
    vec2 pt2Rand = vec2(-0.5+rand(vec2(lineSeed*floor(num_beams)+3.573,lineSeed+6.273)),-0.5+rand(vec2(lineSeed+9.253,lineSeed+7.782)));
      
    vec2 pt1Direct = vec2(sin(TIME + 2*PI*i/num_beams), cos(TIME + 2*PI*i/num_beams));
    vec2 pt2Direct = vec2(sin(TIME + 2*PI*i/num_beams + PI), cos(TIME+ + 2*PI*i/num_beams + PI));
    
    vec2 pt1Spiral = vec2(sin(TIME + 2*PI*i/num_beams), cos(TIME + 2*PI*i/num_beams));
    vec2 pt2Spiral = vec2(sin(TIME + 2*PI*i/num_beams + (2.0-syn_Presence)*PI/2), cos(TIME+ 2*PI*i/num_beams + (2.0-syn_Presence)*PI/2));

    vec2 pt1Dancing = vec2(sin(TIME*0.15+syn_Time*0.075), cos(TIME*0.15+syn_Time*0.075 + 2*PI*i/num_beams + syn_HighTime)+syn_BassPresence);
    vec2 pt2Dancing = vec2(sin(TIME*0.15+syn_Time*0.075 + 2*PI*i/num_beams + PI/2 + syn_Presence), cos(TIME*0.15+syn_Time*0.075+ + 2*PI*i/num_beams + PI/2 + syn_Presence)+syn_BassPresence);


    pt1 = mix(pt1Dancing, pt1Rand, random);
    pt2 = mix(pt2Dancing, pt2Rand, random);

    pt1 = mix(pt1, pt1Spiral, spiral);
    pt2 = mix(pt2, pt2Spiral, spiral);

    pt1 = mix(pt1, pt1Direct, direct_shot);
    pt2 = mix(pt2, pt2Direct, direct_shot);

  
    pt1 *= (1.0+pow(currentRank,2.0)*separation);
    pt2 *= (1.0+pow(currentRank,2.0)*separation);

    
    if (wobble_on > 0.0) {
      wobbleVector = (syn_BassHits*1.5+syn_BassLevel*0.3)*wobble_on*currentRank * vec2(rand(vec2(i*floor(num_beams)+syn_BassTime*3.123,i*floor(num_beams)+syn_BassTime*3.239)),rand(vec2(i*floor(num_beams)+syn_BassTime*3.321,i*floor(num_beams)+syn_BassTime*2.131))) - vec2(wobble_on / 2.0);
      pt1 = pt1 + wobbleVector;
      wobbleVector = (syn_BassHits*1.5+syn_BassLevel*0.3)*wobble_on*currentRank * vec2(rand(vec2(i*floor(num_beams)+syn_BassTime*3.573,i+6.273)),rand(vec2(i+syn_BassTime*9.253,i+syn_BassTime*7.782))) - vec2(wobble_on / 2.0);
      pt2 = pt2 + wobbleVector;
    }

    float diffWidth = (maxWidth-minWidth);
    width = minWidth + diffWidth*currentRank;

    float focus = 1.0-2.0*abs(currentRank-0.5);
    if (false){
      focus = 1.0-focus;
    } else {
      focus = pow(focus, 4.0);
    }
    // focus = 1.0;

    
    float disty = distance_from_point_to_line(thisPoint, pt1, pt2);
    float id = i/num_beams;

    vec3 color;

    if (monochrome<0.5){
      color = colorPaletteChooser(mod(color_palette,10), id);
    } else {
      color = monochrome_color;
    }

    result.rgb = result.rgb + color * pow(clamp((1.0-disty/width)+beam_width,0.0,1.0),5.0)*mix(0.5, _rand(disty), currentRank);
    // result.rgb = result.rgb + color_in * pow(clamp((1.0-disty/width),0.0,1.0),1.0+focus*5.0);


  }
  
  if (_isMediaActive()){
    result.rgb *= _loadMedia().rgb;
  }

  out_FragColor = vec4(result.rgb, 1.0);
  return out_FragColor;

  } else if (PASSINDEX == 1.0){
    return texture(limitSize, _uv);
  }
}
