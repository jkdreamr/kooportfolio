import * as THREE from "three";

/**
 * The stage colour grade: ACES filmic, then a gentle lift/gamma/gain with warm
 * highlights and cool shadows and a touch of saturation. One GLSL source
 * shared by both paths:
 * - direct render (medium tier): injected as THREE.CustomToneMapping, so the
 *   grade costs nothing beyond the existing tone-mapping instructions;
 * - composer (high tier): the same function in the final effect pass.
 * Readability first: no haze, no crushed blacks, highlights never clip.
 */
export const GRADE_GLSL = /* glsl */ `
vec3 stageGrade( vec3 c ) {
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  // Cool, slightly lifted shadows; warm highlights.
  float shadow = 1.0 - smoothstep( 0.0, 0.42, l );
  float high = smoothstep( 0.35, 0.95, l );
  c += vec3( -0.006, 0.002, 0.016 ) * shadow;
  c *= mix( vec3( 1.0 ), vec3( 1.035, 1.004, 0.95 ), high );
  // Mid-tone gamma: a hair of contrast without crushing the darks.
  c = pow( max( c, vec3( 0.0 ) ), vec3( 1.02 ) );
  // Saturation +6 %, protected in the deepest shadows.
  c = mix( vec3( l ), c, 1.0 + 0.06 * ( 1.0 - shadow * 0.5 ) );
  return clamp( c, 0.0, 1.0 );
}
`;

let installed = false;
/** Route CustomToneMapping through ACES + grade. Call before any compile. */
export function installGradeToneMapping() {
  if (installed) return;
  installed = true;
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const stub = "vec3 CustomToneMapping( vec3 color ) { return color; }";
  if (!chunk.includes(stub)) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(
    stub,
    `${GRADE_GLSL}\nvec3 CustomToneMapping( vec3 color ) { return stageGrade( ACESFilmicToneMapping( color ) ); }`,
  );
}
