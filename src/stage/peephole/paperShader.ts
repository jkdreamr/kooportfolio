/**
 * The paper sheet's shaders. Coordinates are CSS pixels with y down ("rest"
 * space = where a point of the page was laid out); the vertex shader moves
 * each point by the pull field, the tear gap and the page curl, then lifts
 * it into a perspective that matches the viewport exactly at z = 0.
 *
 * Mirrors of the pure maths: curl() and gap in tear.ts, the pull field
 * documented in spring.ts.
 */

export const paperVertex = /* glsl */ `
uniform vec2 uView;
uniform vec2 uRest;
uniform vec2 uLetter;
uniform float uAngle;
uniform float uScale;
uniform vec2 uPull;
uniform float uSigmaCore;
uniform float uSigmaWide;
uniform float uTension;
uniform float uLift;
uniform float uRelax;
uniform float uFlap;
uniform vec2 uSeamO;
uniform vec2 uSeamD;
uniform vec2 uFronts;
uniform float uGap;
uniform float uAxis;
uniform float uCurlR;
uniform float uCurlRamp;

attribute vec2 rest;
varying vec2 vRest;
varying vec3 vPos;
varying float vPhi;
varying float vCore;

const float PI = 3.141592653589793;

void main() {
  vec2 q = rest;
  vec2 d = q - uRest;
  float r2 = dot(d, d);
  float r = sqrt(r2);
  // Rigid core: the letter turns and swells as one piece.
  float rc = r2 / (uSigmaCore * uSigmaCore);
  float core = exp(-rc * rc);
  // Pinned sheet around it: the falloff starts at the core's edge, so the
  // core and its surroundings share one translation (no fold), and decays
  // like 1/(1 + (r/r0)^2) so the far page stays where it was printed.
  float rr = max(0.0, r - 0.8 * uSigmaCore);
  float wide = 1.0 / (1.0 + rr * rr / (uSigmaWide * uSigmaWide));
  float c = cos(uAngle);
  float s = sin(uAngle);
  vec2 rd = mat2(c, s, -s, c) * d * uScale;
  vec2 disp = uPull * wide + (uLetter - uPull) * core + (rd - d) * core;
  vec2 p = q + disp * uRelax;
  float lift = uLift * uTension * exp(-r2 / (2.0 * 4.0 * uSigmaWide * uSigmaWide)) * uRelax;
  float z = lift;
  vPhi = 0.0;

  if (uFlap != 0.0) {
    vec2 n = vec2(-uSeamD.y, uSeamD.x);
    vec2 rel = q - uSeamO;
    float sa = dot(rel, uSeamD);
    float ta = dot(rel, n);
    bool torn = sa > uFronts.x && sa < uFronts.y;
    if (torn) {
      float span = sa < 0.0 ? -uFronts.x : uFronts.y;
      float u = abs(sa) / max(span, 1.0);
      // Elastic opening: wide at the seam, fading into the sheet.
      float reach = 24.0 + uGap * 14.0;
      p += n * uFlap * uGap * sqrt(max(0.0, 1.0 - u)) * exp(-ta * ta / (reach * reach));
    }
    // The peel follows the tear: full behind the fronts, none ahead of them
    // (intact paper ahead of the fronts must stay flat for both passes).
    float behind = sa < 0.0 ? sa - uFronts.x : uFronts.y - sa;
    float peel = clamp(behind / uCurlRamp, 0.0, 1.0);
    float axis = uAxis;
    float dd = uFlap * ta;
    if (peel > 0.0 && dd < axis) {
      float phi = (axis - dd) / uCurlR;
      float uu;
      float zz;
      if (phi <= PI) {
        uu = axis - uCurlR * sin(phi);
        zz = uCurlR * (1.0 - cos(phi));
      } else {
        uu = axis + (axis - dd - PI * uCurlR);
        zz = 2.0 * uCurlR;
      }
      p += n * uFlap * (uu - dd) * peel;
      z += zz * peel;
      vPhi = phi * peel;
    }
  }

  vRest = q;
  vCore = core;
  vec3 world = vec3(p.x - uView.x * 0.5, uView.y * 0.5 - p.y, z);
  vPos = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const paperFragment = /* glsl */ `
uniform vec2 uView;
uniform sampler2D uPage;
uniform sampler2D uGlyph;
uniform vec4 uGlyphBox;
uniform float uSpread;
uniform vec3 uInk;
uniform vec3 uBack;
uniform vec2 uRest;
uniform vec2 uLetter;
uniform float uTension;
uniform float uSigmaWide;
uniform float uRelax;
uniform float uHoleOpen;
uniform float uFlap;
uniform sampler2D uSeam;
uniform vec2 uSeamO;
uniform vec2 uSeamD;
uniform vec2 uSeamRange;
uniform vec2 uFronts;
uniform vec2 uCreaseFronts;
uniform float uCrease;
uniform float uSeed;

varying vec2 vRest;
varying vec3 vPos;
varying float vPhi;
varying float vCore;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}
vec2 glyph(vec2 restPx) {
  vec2 luv = (restPx - uGlyphBox.xy) / uGlyphBox.zw;
  if (luv.x <= 0.0 || luv.y <= 0.0 || luv.x >= 1.0 || luv.y >= 1.0) return vec2(uSpread);
  vec2 f = texture2D(uGlyph, luv).rg;
  return (f * 255.0 - 128.0) / 127.0 * uSpread;
}

void main() {
  vec2 uv = vec2(vRest.x / uView.x, 1.0 - vRest.y / uView.y);
  vec3 col = texture2D(uPage, uv).rgb;
  float alpha = 1.0;
  float shadow = 0.0;

  // The letter: ink and counter from distance fields, sharp at any stretch.
  vec2 g = glyph(vRest);
  float aaI = max(fwidth(g.x), 1e-3) * 0.75;
  float aaC = max(fwidth(g.y), 1e-3) * 0.75;
  float ink = smoothstep(aaI, -aaI, g.x);
  col = mix(col, uInk, ink);
  float hole = smoothstep(aaC, -aaC, g.y) * uHoleOpen;
  // Paper edge: the cut catches light along the rim as the page lifts.
  float rim = exp(-pow(g.y / 0.9, 2.0)) * smoothstep(0.0, 0.6, uTension) * uHoleOpen;
  // Soft shadow the sheet throws onto the world just inside the counter.
  vec2 gs = glyph(vRest + vec2(-2.0, -3.0) * (1.0 + uTension * 2.5));
  shadow = (1.0 - smoothstep(-0.5, 7.0 + uTension * 10.0, -gs.y)) * hole * (0.32 + 0.25 * uTension);
  alpha *= 1.0 - hole;

  // Tear.
  float seamLine = 1e3;
  if (uSeamRange.y > uSeamRange.x) {
    vec2 n = vec2(-uSeamD.y, uSeamD.x);
    vec2 rel = vRest - uSeamO;
    float sa = dot(rel, uSeamD);
    float ta = dot(rel, n);
    vec2 sm = texture2D(uSeam, vec2((sa - uSeamRange.x) / (uSeamRange.y - uSeamRange.x), 0.5)).rg;
    float sd = ta - sm.x;
    seamLine = sd;
    bool torn = sa > uFronts.x && sa < uFronts.y;
    if (uFlap < 0.0 && !torn) discard;
    if (uFlap != 0.0 && torn) {
      float fw = 0.9 + 2.2 * sm.y;
      float nf = fbm(vec2(sa * 0.35, sd * 0.6) + uSeed);
      float own = sd * uFlap;
      float edge = own - (nf - 0.45) * fw;
      float aa = max(fwidth(own), 1e-3);
      if (edge < -aa) discard;
      float fib = 1.0 - smoothstep(0.0, fw, edge);
      // Exposed fibres: lighter, slightly translucent, combed along the tear.
      float strand = vnoise(vec2(sa * 1.7, own * 0.25) + uSeed * 3.0);
      col = mix(col, vec3(1.0, 0.996, 0.988), fib * 0.9);
      col *= 1.0 - 0.05 * fib * strand;
      alpha *= smoothstep(-aa, aa, edge) * mix(1.0, 0.45 + 0.55 * strand, fib * fib);
      // Ink near the edge thins out where fibres split.
      shadow = 0.0;
    }
    if (!torn || uFlap == 0.0) {
      bool inCrease = sa > uCreaseFronts.x && sa < uCreaseFronts.y;
      if (inCrease) {
        float line = exp(-pow(sd / 0.8, 2.0));
        float lip = exp(-pow((sd - 1.4) / 1.0, 2.0));
        col *= 1.0 - uCrease * (0.2 * line - 0.06 * lip);
      }
    }
  }

  // Light the bent sheet: derivative normals plus fine wrinkles along the pull.
  vec3 N = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (N.z < 0.0) N = -N;
  float T = uTension * uRelax;
  if (T > 0.001) {
    vec2 pd = normalize(uLetter + vec2(1e-4, 0.0));
    vec2 m = vec2(-pd.y, pd.x);
    vec2 rd = vRest - uRest;
    float along = dot(rd, pd);
    float across = dot(rd, m);
    float sw = uSigmaWide * 2.6;
    float env = exp(-across * across / (2.0 * pow(sw * 0.5, 2.0)))
      * smoothstep(-sw * 2.4, -sw * 0.15, along)
      * (1.0 - smoothstep(sw * 0.15, sw * 0.8, along))
      * (1.0 - vCore);
    float wob = fbm(vec2(along * 0.006, across * 0.004) + uSeed) * 6.28;
    float k = 6.2831 / (13.0 + 9.0 * fbm(vec2(across * 0.01, 3.0)));
    float slope = 0.42 * T * T * env * cos(k * across + wob);
    vec2 grad = m * slope;
    N = normalize(N + vec3(-grad.x, grad.y, 0.0));
  }
  vec3 L = normalize(vec3(-0.35, 0.55, 0.76));
  float shade = 1.0 + 1.15 * (dot(N, L) - L.z);
  vec3 V = vec3(0.0, 0.0, 1.0);
  float sheen = pow(max(dot(reflect(-L, N), V), 0.0), 18.0) - pow(max(dot(reflect(-L, vec3(0.0, 0.0, 1.0)), V), 0.0), 18.0);

  if (!gl_FrontFacing) {
    // Back of the sheet: unprinted, a touch greyer, lit from the same sun.
    col = uBack;
  }
  // Curl self-shadow: the inside of the roll is darker.
  float inRoll = vPhi > 0.0 ? smoothstep(0.0, 1.2, vPhi) * (1.0 - smoothstep(2.4, 3.14, vPhi)) : 0.0;
  col *= shade * (1.0 - 0.18 * inRoll);
  col += max(sheen, 0.0) * 0.08;
  col = mix(col, vec3(1.0), rim * 0.35);

  // Premultiplied: paper over the shadow it casts into the hole.
  float outA = alpha + shadow * (1.0 - alpha);
  gl_FragColor = vec4(col * alpha, outA);
  #include <colorspace_fragment>
}
`;
