vec4 fpass0() {
  float
    z=speed
  ;
    
  vec2 
    P=vec2(1, .707)/9.
  , C
  ;
  
  vec3  
    D
  , Z=normalize(vec3(2.*P*cos(P*z), 1))
  , X=vec3(-Z.z, 0, Z.x)
  , O=vec3(2.*sin(P*z), z)
  , I=normalize(_uvc.y*cross(X,Z)-_uvc.x*X+.5*Z)
  , p
  , o=
      1./(1.03-I.z-I.y*I.y/3.)*vec3(4,12,36)
    + 2.*syn_BassHits/(1.002-I.z-I.y*I.y/3.)*vec3(6,16,36)
  ;

  z=fract(-z)/I.z;
  I.xy*=mat2(cos(rotation+vec4(0,11,33,0)));

  for(
    int i=0
  ; i<16
  ; ++i
  )
      p=z*I+O
    , D=round(p)
    , p-=D
    , D=fract(sin(D*mat3(13,78,38,39,68,23,48,82,16))*9e3)-.5
    , C=(p-.8*D).xy
    , o+= 
        exp(-z*z/67.)
      / max(dot(C,C),1e-4)
      * (1.1+sin(9.*D.z+vec3(color_base,0)))
    , z+=1./I.z
    ;
  
  O=texelFetch(pass0,ivec2(gl_FragCoord.xy),0).xyz;
  o=o/3e3-vec3(3,9,1)/1e2;
  o=max(o,0.);
  o=tanh(o);
  return vec4(mix(O,o,mix(trail,1.,dot(vec3(0.2126, 0.7152, 0.0722),o))),1);
}

vec4 fpass1() {
  vec4
    pcol=texelFetch(pass0,ivec2(_xy),0)
  , mcol=_loadMedia()
  ;
  
  float
    t=
       mcol.w
      *opaque
      *mix(
        1.
       ,smoothstep(mix_cutoff.x, mix_cutoff.y,dot(mcol.xyz,vec3(0.299, 0.587, 0.114)))
       ,mix_mode)
  ;
  
  pcol=sqrt(pcol);
  pcol=mix(pcol,mcol,t);
  return vec4(pcol.xyz,1);
}

vec4 renderMain() {
  switch(PASSINDEX) {
  case 0:
    return fpass0();
  default:
    return fpass1();
  }
  
}
