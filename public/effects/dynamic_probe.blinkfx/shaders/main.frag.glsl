#include "lib/stripes.glsl"

in vec2 v_uv;

void main(void) {
  if (bl_pass == 0) {
    fragColor = vec4(vec3(stripes(v_uv, 6.0 + 40.0 * detail)), 1.0);
  } else {
    fragColor = texture(low, v_uv);
  }
}
