import * as THREE from "three";
import { FOUNTAIN_MAX_JETS, FOUNTAIN_TIME_WRAP, fountainInstances, type FountainSpec } from "../core/fountain";
import { journeyVeilUniform } from "./env/atmosphere";

/** Angular rate `rad/s` rounded to whole cycles per FOUNTAIN_TIME_WRAP, as a
 * GLSL literal: every sin(uTime * k) is seamless where the clock wraps. */
const wrapRate = (rad: number) => {
  const cycles = Math.round((rad * FOUNTAIN_TIME_WRAP) / (2 * Math.PI));
  return ((cycles * 2 * Math.PI) / FOUNTAIN_TIME_WRAP).toFixed(7);
};

/** Fountain water shaders, materials and geometry (three.js only; the React
 * component and warmup live in Fountain.tsx). */

const particleVertex = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform vec4 uShape; // basinY, landRadius, bowlY, bowlRadius
uniform vec2 uJet; // apex, plume height
in vec3 position;
in vec4 aA; // kind, angle, phase, rate
in vec4 aB; // r1, r2, r3, size
out vec2 vUv;
out float vAlpha;
out float vSparkle;
out float vMist;
void main() {
  float kind = aA.x;
  float s = fract(uTime * aA.w + aA.z);
  vec2 dir = vec2(cos(aA.y), sin(aA.y));
  float yw = uShape.x, rl = uShape.y, yb = uShape.z, rb = uShape.w;
  vec3 p;
  vec3 v = vec3(0.0);
  float alpha;
  if (kind < 0.5) {
    // Arcing jet: constant horizontal speed, parabolic height.
    float land = rl + (aB.x - 0.5) * 0.07;
    float apex = uJet.x * (0.9 + aB.y * 0.2);
    float r = rb + (land - rb) * s;
    float y = yb + (yw - yb) * s + 4.0 * apex * s * (1.0 - s);
    vec2 side = vec2(-dir.y, dir.x) * (aB.z - 0.5) * 0.045 * s;
    p = vec3(dir.x * r + side.x, y, dir.y * r + side.y);
    v = vec3(dir.x * (land - rb), (yw - yb) + 4.0 * apex * (1.0 - 2.0 * s), dir.y * (land - rb)) * aA.w;
    alpha = smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.92, 1.0, s)) * 0.8;
  } else if (kind < 1.5) {
    // Central plume: up and back into the bowl, opening into a crown.
    float h = uJet.y * (0.72 + aB.y * 0.38);
    float spread = 0.012 + aB.x * aB.x * 0.19;
    float y = yb + 4.0 * h * s * (1.0 - s);
    p = vec3(dir.x * spread * s, y, dir.y * spread * s);
    v = vec3(dir.x * spread, 4.0 * h * (1.0 - 2.0 * s), dir.y * spread) * aA.w;
    alpha = smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.86, 1.0, s)) * 0.75;
  } else if (kind < 2.5) {
    // Splash droplets hopping out of a landing point.
    bool bowl = aB.z > 0.78;
    vec2 base = bowl ? dir * rb * 0.55 * sqrt(aB.x) : dir * rl;
    float a = aB.x * 6.2831853 + aB.y * 3.0;
    vec2 kick = vec2(cos(a), sin(a)) * (0.06 + aB.y * 0.1);
    float hop = 0.035 + aB.y * 0.07;
    float y = (bowl ? yb : yw) + 4.0 * hop * s * (1.0 - s);
    p = vec3(base.x + kick.x * s, y, base.y + kick.y * s);
    v = vec3(kick.x, 4.0 * hop * (1.0 - 2.0 * s), kick.y) * aA.w;
    alpha = (1.0 - s) * smoothstep(0.0, 0.06, s) * 0.7;
  } else {
    // Mist: big, faint, slow sprites hanging over the landing ring.
    float a = aA.y + uTime * ${wrapRate(0.05)} + aB.z;
    vec2 m = vec2(cos(a), sin(a)) * rl * (0.5 + aB.x * 0.6);
    p = vec3(m.x, yw + 0.1 + aB.y * 0.35 + 0.05 * sin(uTime * ${wrapRate(0.4)} + aB.z * 6.2831853), m.y);
    alpha = 0.055 + 0.03 * sin(uTime * ${wrapRate(0.5)} + aB.z * 6.2831853);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec2 vv = (mat3(modelViewMatrix) * v).xy;
  float speed = length(vv);
  vec2 axis = speed > 1e-4 ? vv / speed : vec2(0.0, 1.0);
  // Droplets stretch along their screen velocity (streaks), mist stays round.
  float stretch = kind > 2.5 ? 0.0 : min(speed * 0.03, 0.08);
  // (axis.y, -axis.x) is +x when the axis is +y: the quad keeps its CCW winding.
  mv.xy += axis * position.y * (aB.w + stretch) + vec2(axis.y, -axis.x) * position.x * aB.w;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy;
  vAlpha = alpha;
  vMist = kind > 2.5 ? 1.0 : 0.0;
  // A small step count keeps the hash's sin() argument where mobile GPUs
  // are still precise (the pattern repeats every 64 s; nobody can tell).
  float flick = fract(sin(dot(aB.xy + mod(floor(uTime * 8.0 + aB.z * 9.0), 512.0), vec2(12.9898, 78.233))) * 43758.5453);
  vSparkle = step(0.9, flick) * (1.0 - vMist);
}
`;
const encode = /* glsl */ `
uniform float uSRGB;
vec3 encode(vec3 c) {
  return uSRGB > 0.5
    ? mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c))
    : c;
}
`;
const particleFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform vec3 uGlint;
uniform float uVeil;
${encode}
in vec2 vUv;
in float vAlpha;
in float vSparkle;
in float vMist;
out vec4 fragColor;
void main() {
  float d = dot(vUv, vUv);
  if (d > 1.0) discard;
  float soft = mix(1.0 - smoothstep(0.12, 1.0, d), (1.0 - d) * (1.0 - d), vMist);
  float a = soft * vAlpha;
  // Premultiplied: the droplet body blends, the glint adds (alpha 0).
  vec3 rgb = encode(uColor * (0.86 + 0.14 * (1.0 - d))) * a
    + encode(uGlint) * vSparkle * (1.0 - d) * vAlpha;
  // Drawn without fog: fades with the travel veil instead (premultiplied).
  fragColor = vec4(rgb, a) * (1.0 - uVeil);
}
`;
const rippleVertex = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec2 aDisc; // radius, level (0 basin, 1 bowl)
out vec2 vXZ;
out vec2 vDisc;
void main() {
  vXZ = position.xz;
  vDisc = aDisc;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const rippleFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec4 uShape;
uniform vec2 uJets; // count, first angle
uniform vec3 uColor;
uniform float uVeil;
${encode}
in vec2 vXZ;
in vec2 vDisc;
out vec4 fragColor;
float ring(float d, float phase, float reach) {
  float x = (d - 0.015 - phase * reach) / (0.007 + 0.016 * phase);
  return exp(-x * x) * (1.0 - phase) * (1.0 - phase);
}
void main() {
  float d = length(vXZ);
  float radius = vDisc.x;
  if (d > radius) discard;
  float rings = 0.0, foam = 0.0;
  if (vDisc.y < 0.5) {
    for (int i = 0; i < ${FOUNTAIN_MAX_JETS}; i++) {
      if (float(i) >= uJets.x) break;
      float a = uJets.y + 6.2831853 * float(i) / uJets.x;
      float dl = length(vXZ - vec2(cos(a), sin(a)) * uShape.y);
      foam += exp(-dl * dl * 420.0);
      float offset = float(i) * 0.37;
      rings += ring(dl, fract(uTime * 0.85 + offset), 0.3);
      rings += ring(dl, fract(uTime * 0.85 + offset + 0.5), 0.3);
    }
  } else {
    float reach = radius - 0.05;
    for (int k = 0; k < 3; k++)
      rings += ring(d, fract(uTime * 0.55 + float(k) / 3.0), reach);
    foam += exp(-d * d * 140.0) * 0.8;
  }
  float shimmer = 0.5 + 0.5 * sin(vXZ.x * 31.0 + uTime * ${wrapRate(1.7)}) * sin(vXZ.y * 27.0 - uTime * ${wrapRate(1.3)});
  float edge = 1.0 - smoothstep(radius * 0.86, radius, d);
  float a = clamp(rings * 0.4 + foam * 0.38 + shimmer * 0.05, 0.0, 0.75) * edge;
  fragColor = vec4(encode(uColor) * a, a) * (1.0 - uVeil);
}
`;

export type FountainUniforms = {
  uTime: { value: number };
  uShape: { value: THREE.Vector4 };
  uJet: { value: THREE.Vector2 };
  uJets: { value: THREE.Vector2 };
  uColor: { value: THREE.Color };
  uGlint: { value: THREE.Color };
  uRippleColor: { value: THREE.Color };
  uSRGB: { value: number };
  uVeil: { value: number };
};
export function makeUniforms(): FountainUniforms {
  return {
    uTime: { value: 0 },
    uShape: { value: new THREE.Vector4() },
    uJet: { value: new THREE.Vector2() },
    uJets: { value: new THREE.Vector2() },
    uColor: { value: new THREE.Color(0.78, 0.88, 0.97) },
    uGlint: { value: new THREE.Color(1, 0.97, 0.9) },
    uRippleColor: { value: new THREE.Color(0.86, 0.94, 1) },
    uSRGB: { value: 0 },
    uVeil: journeyVeilUniform,
  };
}
const premultiplied = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;
export function makeMaterials(u: FountainUniforms) {
  const particles = new THREE.RawShaderMaterial({
    name: "fountain-particles",
    glslVersion: THREE.GLSL3,
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: {
      uTime: u.uTime,
      uShape: u.uShape,
      uJet: u.uJet,
      uColor: u.uColor,
      uGlint: u.uGlint,
      uSRGB: u.uSRGB,
      uVeil: u.uVeil,
    },
    ...premultiplied,
  });
  const ripples = new THREE.RawShaderMaterial({
    name: "fountain-ripples",
    glslVersion: THREE.GLSL3,
    vertexShader: rippleVertex,
    fragmentShader: rippleFragment,
    uniforms: {
      uTime: u.uTime,
      uShape: u.uShape,
      uJets: u.uJets,
      uColor: u.uRippleColor,
      uSRGB: u.uSRGB,
      uVeil: u.uVeil,
    },
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    ...premultiplied,
  });
  return { particles, ripples };
}

/** Is this draw going to an sRGB target (the canvas) or a linear one (the
 * composer's scene pass)? Same rule three uses for its own output key. */
export function targetIsSrgb(gl: THREE.WebGLRenderer) {
  const target = gl.getRenderTarget() as
    | (THREE.WebGLRenderTarget & { isXRRenderTarget?: boolean })
    | null;
  const space = !target
    ? gl.outputColorSpace
    : target.isXRRenderTarget
      ? target.texture.colorSpace
      : THREE.LinearSRGBColorSpace;
  return space === THREE.SRGBColorSpace ? 1 : 0;
}

export function particleGeometry(spec: FountainSpec) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const { a, b, count } = fountainInstances(spec);
  geometry.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  geometry.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 4));
  geometry.instanceCount = count;
  // The shader moves everything: bound the whole spray for frustum culling.
  const top = spec.bowlY + spec.plumeHeight * 1.15 + 0.1;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, top / 2, 0),
    Math.hypot(spec.basinRadius + 0.3, top / 2 + 0.2),
  );
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-spec.basinRadius - 0.3, 0, -spec.basinRadius - 0.3),
    new THREE.Vector3(spec.basinRadius + 0.3, top, spec.basinRadius + 0.3),
  );
  return geometry;
}
export function rippleGeometry(spec: FountainSpec) {
  const positions: number[] = [],
    discs: number[] = [],
    index: number[] = [];
  const quad = (y: number, r: number, level: number) => {
    const base = positions.length / 3;
    for (const [x, z] of [
      [-r, -r],
      [r, -r],
      [r, r],
      [-r, r],
    ]) {
      positions.push(x, y, z);
      discs.push(r, level);
    }
    index.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  quad(spec.basinY + 0.004, spec.basinRadius, 0);
  quad(spec.bowlY + 0.004, spec.bowlRadius, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aDisc", new THREE.Float32BufferAttribute(discs, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

