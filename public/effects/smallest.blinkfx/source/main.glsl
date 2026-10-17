vec4 renderMain() {
  vec2
    p =_uvc
  ;

  float
    aa=sqrt(.5)/RENDERSIZE.y
  , d=length(p)-.5
  ;

  return vec4(vec3(1)*smoothstep(aa,-aa,d),1);
}
