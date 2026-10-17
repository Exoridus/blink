
#line 0

float reso = 30+resoMod;


vec3 quadTree()
{
    vec2 pos = _xy;
    float H = RENDERSIZE.y;
    pos /= H;
    pos.x -= 0.5*RENDERSIZE.x/RENDERSIZE.y;
    pos *= reso*0.05;
    pos = abs(pos);

    vec4 retCol = vec4(0.0);
    float r = 0.1; 
    float t = TIME;
    vec2 objPos = (0.5+0.5*vec2(cos(t),sin(t)));
    vec2 fU;

    pos *= 0.5;
    objPos *= 0.5;                         // unzoom for the whole domain falls within [0,1]^n
    
    float cellWarmth = 0.0;
    
    for (int i=0; i<7; i++) {             // to the infinity, and beyond ! :-)
        fU = min(pos,1.-pos); 
        if (min(fU.x,fU.y) < 20.*r/H) { //cell border thickness
            retCol--; 
            break; // cell border
        } 
        if (length(objPos-.5) - r > .7){
            break; // cell is out of the shape
        }

        // --- iterate to child cell
        fU = step(.5,pos);                 // select child
        pos    = (2.0)*pos - fU;              // go to new local frame
        objPos = (2.0)*objPos - fU;  
        r *= (2.0);
        
        cellWarmth += .1;                         // getting closer, getting hotter
        pos -= abs((-1.0+i*2.0)*pos*0.1);
    }
               
    float objDraw = smoothstep(.3,1.,length(objPos-pos)/r); // draw object
    return vec3(cellWarmth,0.0, 1.0-objDraw);
}


vec4 firstPass(){
    // vec2 crossPos = abs(_uvc*20)+1/20.0;
    vec2 crossPos = abs(_uvc*reso);
    crossPos = abs(-1+mod(crossPos,2));
    if (type>0.5){
        crossPos *= vec2(1.0 - length(_uvc));
    } else if (type>1.5){
        crossPos *= vec2(1.0 - fract(length(_uvc)*10.0));
    } else {
        //normal
    }

    crossPos *= vec2(x_mod,y_mod);

    vec2 uvc = _uvc;
    uvc.x = abs(uvc.x);
    // if (_uv.x > 0.5){
    //     uvc.x = 0.5-(-uvc.x+0.5);
    // }

    vec2 rotPos = _rotate(crossPos, PI/4);
    float sizeMod = mix(pow(-0.5+_fbm(vec3(_pixelate(uvc,reso),syn_Time*0.15)),1.0),1.0+length(_uvc),pop);
    float growMod = pow(-0.5+_fbm(vec3(_pixelate(uvc,reso),syn_Time)),1.0);

    float crossGrow = syn_HighHits*0.5+growMod;
    float crossPattern = step(crossPos.x,0.3+crossGrow)*step(crossPos.y,0.3+crossGrow);

    crossPattern = ((crossPos.y > (1.2+sizeMod*20.0)/reso)&&(crossPos.x > (1.2+sizeMod*20.0)/reso)) ? 0.0 : crossPattern;

    vec3 crosses = vec3(crossPattern);

    if (_isMediaActive()){
        crosses *= _loadMedia().rgb;
    }

    return vec4(crosses, 0.0);
}

vec4 renderMain()
{
    return firstPass();
}