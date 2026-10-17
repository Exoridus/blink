/** Adapts encoded shader RGB to the engine's linear working surface at presentation only. */
export function encodedPresentation(fragment: string, opaque: boolean): string {
    return `#define main blinkEncodedMain
${fragment}
#undef main
vec3 blinkDecodeOutput(vec3 value) {
  vec3 low = value / 12.92;
  vec3 high = pow((value + 0.055) / 1.055, vec3(2.4));
  return mix(high, low, lessThanEqual(value, vec3(0.04045)));
}
void main() {
  blinkEncodedMain();
  fragColor.rgb = blinkDecodeOutput(clamp(fragColor.rgb, 0.0, 1.0));
  ${opaque ? 'fragColor.a = 1.0;' : 'fragColor.rgb *= clamp(fragColor.a, 0.0, 1.0);'}
}`;
}
