// https://blog.abluestar.com/public/uploads/16-Segment-ASCII-All.jpg
#define _           0x0000  // 0x20 -
#define _EXCLAIM   0x10300  // 0x21 - !
#define _QUOTE      0x0A00  // 0x22 - "
#define _HASH       0x0F0F  // 0x23 - #
#define _DOLLAR     0x07BF  // 0x24 - $
#define _PERCENT    0x979E  // 0x25 - %
#define _AMPERSAND  0x6257  // 0x26 - &
#define _APOSTROPHE 0x0200  // 0x27 - '
#define _LPAREN     0xA000  // 0x28 - (
#define _RPAREN     0x5000  // 0x29 - )
#define _ASTERISK   0xF30C  // 0x2A - *
#define _PLUS       0x030C  // 0x2B - +
#define _COMMA      0x1000  // 0x2C - ,
#define _MINUS      0x000C  // 0x2D - -
#define _PERIOD    0x10000  // 0x2E - .
#define _SLASH      0x9000  // 0x2F - /

#define _0          0x9CF3  // 0x30 - 0
#define _1          0x8C00  // 0x31 - 1
#define _2          0x087F  // 0x32 - 2
#define _3          0x0C3B  // 0x33 - 3
#define _4          0x0C8C  // 0x34 - 4
#define _5          0x20B7  // 0x35 - 5
#define _6          0x04FF  // 0x36 - 6
#define _7          0x0C30  // 0x37 - 7
#define _8          0x0CFF  // 0x38 - 8
#define _9          0x0CBF  // 0x39 - 9
#define _COLON      0x0300  // 0x3A - :
#define _SEMICOLON  0x1200  // 0x3B - ;
#define _LESS       0xA004  // 0x3C - <
#define _EQUALS     0x000F  // 0x3D - =
#define _GREATER    0x5008  // 0x3E - >
#define _QUESTION  0x10938  // 0x3F - ?

#define _AT         0x0AFB  // 0x40 - @
#define _A          0x0CFC  // 0x41 - A
#define _B          0x0F3B  // 0x42 - B
#define _C          0x00F3  // 0x43 - C
#define _D          0x0F33  // 0x44 - D
#define _E          0x00F7  // 0x45 - E
#define _F          0x00F4  // 0x46 - F
#define _G          0x04FB  // 0x47 - G
#define _H          0x0CCC  // 0x48 - H
#define _I          0x0333  // 0x49 - I
#define _J          0x0C43  // 0x4A - J
#define _K          0xA0C4  // 0x4B - K
#define _L          0x00C3  // 0x4C - L
#define _M          0xCCC0  // 0x4D - M
#define _N          0x6CC0  // 0x4E - N
#define _O          0x0CF3  // 0x4F - O

#define _P          0x08FC  // 0x50 - P
#define _Q          0x2CF3  // 0x51 - Q
#define _R          0x28FC  // 0x52 - R
#define _S          0x04BF  // 0x53 - S
#define _T          0x0330  // 0x54 - T
#define _U          0x0CC3  // 0x55 - U
#define _V          0x90C0  // 0x56 - V
#define _W          0x3CC0  // 0x57 - W
#define _X          0xF000  // 0x58 - X
#define _Y          0x0C8F  // 0x59 - Y
#define _Z          0x9033  // 0x5A - Z
#define _LBRACKET   0x0322  // 0x5B - [
#define _BACKSLASH  0x6000  // 0x5C - \ -
#define _RBRACKET   0x0311  // 0x5B - ]
#define _CARET      0x3000  // 0x5E - ^
#define _UNDERSCORE 0x0003  // 0x5F - _

#define _BACKTICK   0x4000  // 0x60 - `
#define _a          0x0147  // 0x61 - a
#define _b          0x01C5  // 0x62 - b
#define _c          0x0045  // 0x63 - c
#define _d          0x0D0A  // 0x64 - d
#define _e          0x1045  // 0x65 - e
#define _f          0x032C  // 0x66 - f
#define _g          0x0395  // 0x67 - g
#define _h          0x01C4  // 0x68 - h
#define _i          0x0100  // 0x69 - i
#define _j          0x0341  // 0x6A - j
#define _k          0xA300  // 0x6B - k
#define _l          0x00C0  // 0x6C - l
#define _m          0x054C  // 0x6D - m
#define _n          0x0144  // 0x6E - n
#define _o          0x0145  // 0x6F - o

#define _p          0x02D4  // 0x70 - p
#define _q          0x0394  // 0x71 - q
#define _r          0x0044  // 0x72 - r
#define _s          0x0195  // 0x73 - s
#define _t          0x00C5  // 0x74 - t
#define _u          0x0141  // 0x75 - u
#define _v          0x1040  // 0x76 - v
#define _w          0x3440  // 0x77 - w
#define _x          0xF000  // 0x78 - x
#define _y          0x0E0A  // 0x79 - y
#define _z          0x1005  // 0x7A - z
#define _LBRACE     0x0326  // 0x7B - {
#define _PIPE       0x0300  // 0x7C - |
#define _RBRACE     0x0319  // 0x7D - }
#define _TILDE      0x900C  // 0x7E - ~
#define _DEL       0x1FFFF  // 0x7F - DEL

//#define LEDS _EXCLAIM

const int[10] Digits=int[10](_0,_1,_2,_3,_4,_5,_6,_7,_8,_9);

const float
  B16_W =.3
, B16_LW=.02
;
float B16_segmentH(vec2 p) {
  const float
    l=B16_W*.38
  ;
  p.x=abs(p.x)-l;
  return p.x>0.?length(p):abs(p.y);
}

float B16_segmentV(vec2 p) {
  const float
    l=B16_W*.88
  ;
  p.y=abs(p.y)-l;
  return p.y>0.?length(p):abs(p.x);
}

float B16_segmentD(vec2 p) {
  const vec2
    a=B16_W*.8*vec2(1,1)
  , b=B16_W*.8*vec2(.25,-1)
  , ba=b-a
  ;

  const float
    idba=1./dot(ba,ba)
  ;

  vec2
    pa = p-a
  ;
  float h = clamp(dot(pa,ba)*idba,0., 1.);
  return length(pa - ba*h);

}

// Distance field for 16 segment display
//  With the added . it's technical a 17 element display now
//  Takes the current fragment position p and leds is 17 bits indicating which element is lit or not
//  Returns vec2 with first element being the distance to all lit elements
//  the second element being the distance to unlit elements
vec2 B16_segment(vec2 p, int leds) {
  vec2
    p0=p
  , p1=p
  , p2=p
  , p3=p
  , N0=vec2(clamp(round(p0.y/(B16_W*.5)),-1.,1.),sign(p0.x))
  , N1=vec2(sign(p1.y),clamp(round(p1.x/B16_W),-1.,1.))
  , N2=sign(p2)
  ;
  p0.x=abs(p0.x)-B16_W*.5;
  p0.y-=N0.x*(B16_W*2.);
  p1.y=abs(p1.y)-B16_W;
  p1.x-=N1.y*B16_W;
  p2=abs(p2);
  p2.y-=B16_W;
  p3.y+=B16_W*2.+B16_LW*2.;
  float
    d0=B16_segmentH(p0)
  , d1=B16_segmentV(p1)
  , d2=B16_segmentD(p2)
  , d3=length(p3)
  ;
  return min(
    min(
      ((0x01<<int(2.*(N0.x+1.)+.5*(N0.y+1.))&leds)!= 0)?vec2(d0,1e3):vec2(1e3,d0)
    , ((0x40<<int(.5*(N1.x+1.)+2.*(N1.y+1.))&leds)!= 0)?vec2(d1,1e3):vec2(1e3,d1)
    )
  , min(
      ((0x1000<<int((N2.x+1.)*.5+(N2.y+1.))&leds)   != 0)?vec2(d2,1e3):vec2(1e3,d2)
    , ((0x10000&leds)                               != 0)?vec2(d3,1e3):vec2(1e3,d3)
    )
  )-B16_LW;
}


vec4 renderMain() {
  const float
    Z=.1
  ;
  int
    D
  ;
  float
    aa=sqrt(.5)/RENDERSIZE.y
  , N
  , V=syn_BPM
  ;

  vec2
    p=_uvc
  , P=p/Z+vec2(.5,0)
  , C=P
  , d
  ;

  N=round(P.x);
  D=int(V*pow(10.,N))%10;
  D=Digits[D];
  C.x-=N;
  d=B16_segment(C,D)*Z;
  d.x=min(d.x,abs(p.x))-aa;

  vec3
     bcol=vec3(1,.0,.25)
  ,  col = .05*bcol*smoothstep(2.5,0.5,length(2.*p))
  ;
  col = mix(col, .125*bcol, smoothstep(aa,-aa,d.y));
  col = mix(col, bcol, smoothstep(aa,-aa,d.x));
  col = sqrt(col);


  return vec4(col,1);
}
