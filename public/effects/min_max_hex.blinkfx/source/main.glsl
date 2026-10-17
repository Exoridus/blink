
#line 0

// --------------------------------------------------------
// Triangle tiling
// Adapted from mattz https://www.shadertoy.com/view/4d2GzV
//
// Finds the closest triangle center on a 2D plane 
// --------------------------------------------------------

const float sqrt3 = 1.7320508075688772;
const float i3 = 0.5773502691896258;

const mat2 cart2tri = mat2(1, 0, i3, 2. * i3);
const mat2 tri2cart = mat2(1, 0, -.5, .5 * sqrt3);

vec2 closestTri(vec2 p) {
    p = cart2tri * p;
    vec2 pf = fract(p+syn_BPMTwitcher*EXPLODE);
    vec2 v = vec2(1./3., 2./3.)+tan(TIME*3.7)*EXPLODE;
    vec2 tri = mix(v, v.yx+tan(-syn_BPMTwitcher+syn_BPMSin2)*EXPLODE, step(pf.y, pf.x));
    tri += floor(p);
    tri = tri2cart * tri;
    return tri;
}

float sdTorus( vec3 p, vec2 t )
{
  vec2 q = vec2(length(p.xz)-t.x,p.y);
  return length(q)-t.y;
}

float udBox( vec3 p, vec3 b )
{
  return length(max(abs(p)-b,0.0));
}

float sdHexPrism( vec3 p, vec2 h )
{
    vec3 q = abs(p);
    return max(q.z-h.y,max((q.x*0.866025+q.y*0.5),q.y)-h.x);
}

float cubicPulse( float c, float w, float x )
{
    x = abs(x - c);
    if( x>w ) return 0.0f;
    x /= w;
    return 1.0f - x*x*(3.0f-2.0f*x);
}

float triWave(float var, float period){
    float up = (abs(mod(var,period))-period/2)/period;
    float down = (abs(mod(-var,period))-period/2)/period;
    if (mod(var, period)<period/2){
        return up;
    } else {
        return down;
    }
}

void spin(inout vec3 p) {
    float r = script_time*0.5 + syn_BPMSin2*0.1;

    mat2 rot = mat2(triWave(r+PI/2.0, PI*2), -triWave(r, 2*PI), triWave(r, 2*PI), triWave(r+PI/2.0, 2*PI))*2.0;
    p.xz *= rot;
    p.x -= triWave(r+PI, PI*13)*2.0;
    p.y += triWave(r+PI, PI*7)*2.0;

    p.zy *= rot;
}

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

float getMasker(){
    vec2 triPos = closestTri(abs(_uvc)*4.0);
    vec2 smallTris = closestTri(_uvc*10.0);
    float retVal = 0.0;
    if (mask_type < 1.0){
        if ((length(triPos)<1.0)||((length(triPos)>2.0)&&(length(triPos)<2.8))){
            retVal = 1.0;
        }
    } else if (mask_type < 2.0){
        if (length(triPos)<2.0){
            retVal = 1.0;
        }
    } else if (mask_type < 3.0){
        if ((triPos.x-triPos.y<2.0)&&(triPos.y < 2.0)){
            retVal = 1.0;
        }
    } else if (mask_type < 4.0){
        if ((triPos.y<2.0)&&(triPos.y>1.0)||(triPos.y-triPos.x>1.5)){
            retVal = 1.0;
        }
    } else if (mask_type < 5.0){
        if ((triPos.y-triPos.x>1.3)||(length(triPos*vec2(0.0,1.2))<0.7)){
            retVal = 1.0;
        }
    } 

    // if ((length(triPos)>size_mask)&&((length(triPos)<size_mask*1.8)||outer_ring<0.5)){
    //     retVal = 0.0;
    // }
    return retVal;
}

vec4 renderMain()
{
    if (PASSINDEX == 0){
        vec2 pos = _uvc*2.0;

        vec2 triPos = closestTri(abs(pos));
        vec2 smallTris = closestTri(_uvc*10.0);
        // pos += normalize(smallTris)*(syn_HighHits*auto_twitcher+twitcher)*0.1;

        if (triangle_mode > 0.5){
            pos = closestTri(abs(_uvc*6.0)-smallTris);
        }


        if (flashing_mode > 0.5){
            pos *= smallTris*step(syn_HighHits,0.7)*0.1;
        }

        vec3 pos3D = vec3(0.0);
        if (flashing_mode > 0.5){
            pos3D = vec3(pos+triPos, triPos.y*triPos.x*1.0);
            spin(pos3D);
        } else {
            pos3D = vec3(pos+triPos, triPos.y*pos.x);
            spin(pos3D);
        }

        float hex = fract(sdHexPrism(pos3D, vec2(0.5+syn_Presence*0.1-length(triPos)*0.5, 0.5))*10.0);
        // hex = cubicPulse(0.1, 0.02+clamp(1.0-pow(length(_uvc*2)*3.0,3.0),0.0,1.0)*0.1, hex-dot(abs(smallTris), vec2(1.0))*center_pulse);

        if (circular_mode > 0.5){
            hex = fract(sdTorus(pos3D, vec2(0.5+syn_Presence*0.1, 0.5+(-1+syn_BPMSin2*2.0)*0.01))*10.0);
        }

        if (flashing_mode > 0.5){
            hex = cubicPulse(0.1+syn_BassLevel*0.1, 0.02+clamp(1.0-pow(length(_uvc*2)*3.0,3.0),0.0,1.0)*0.1+center_pulse*2.0, hex-dot(abs(smallTris), vec2(1.0))*center_pulse);
            hex += step(_rand(pos3D.xy),0.5)*step(0.7,syn_HighHits);
        } else {
            hex = cubicPulse(0.1, 0.02+clamp(1.0-pow(length(_uvc*2)*3.0,3.0),0.0,1.0)*0.1+center_pulse, hex-dot(abs(smallTris), vec2(1.0))*center_pulse);
        }

        vec3 color = vec3(hex);
        return vec4(color,1.0);
    } else if (PASSINDEX == 1){
        vec2 triPos = closestTri(abs(_uvc)*4.0);
        vec2 smallTris = closestTri(_uvc*10.0);

        vec4 newBuff = texture(firstBuffer, _uv);
        vec4 oldBuff = texture(secondBuffer, _uv);
        newBuff += step(rand(_uvc*100.0+TIME),pow(dot(oldBuff, vec4(1.0))/4.0-0.2,3.0)*0.7+noise*0.4)*(syn_HighPresence+noise);
        newBuff -= step(rand(_uvc*100.0-TIME),0.02);

        float blackener = 1.0;
        
        blackener = getMasker();

        newBuff = clamp(newBuff, 0.0, 10.0);

        return mix(newBuff, oldBuff, 0.75)*blackener;
    } else if (PASSINDEX == 2){

        vec2 triPos = closestTri(abs(_uvc)*4.0);
        vec2 smallTris = closestTri(_uvc*10.0);
        vec4 newBuff = vec4(0.0);
        vec2 offset = smallTris*media_pulse*abs(_uvc);
        vec2 triPosOffset = fragment_media*triPos;

        if (_isMediaActive()){
            if (syn_MediaType == 1){
                offset += -(0.25+syn_OnBeat*0.004)*_uv+vec2(triWave(syn_BassTime*0.017, 1.0), triWave(syn_Time*0.0073, 1.0))*0.5;
            }

            newBuff += pow(_loadMedia(triPosOffset+offset),vec4(2.0));
        }

        float blackener = 1.0;
        blackener = getMasker();

        return clamp(texture(secondBuffer, _uv)*((1.0+EXPLODE+triangle_mode)*3.0)+newBuff*blackener,0.0,1.0);
    }
}