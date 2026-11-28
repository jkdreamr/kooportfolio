import * as THREE from "three";
import { BEACON_SLOTS, BURST_SLOTS } from "../../core/life";
import { journeyVeilUniform } from "../env/atmosphere";

/**
 * The world-life sprite layer (PLAN_GAMES §4.4, cut down): one instanced
 * mesh and one RawShaderMaterial for butterflies (fireflies after dark),
 * feather bursts and the carry beacons. All motion is in the vertex shader;
 * instance attributes are written once, and the CPU writes a few uniforms
 * per frame. Alpha-tested (discard), depth-writing, unblended: no sorting.
 *
 * RawShaderMaterial: its program key is its source alone (no lights, fog or
 * output-space parameters), so one warmup links it before `ready` whatever
 * world is loaded. Output colour space is a uniform, set per draw.
 */

export const KIND_BUTTERFLY = 0,
  KIND_FEATHER = 1,
  KIND_RING = 2,
  KIND_CHEVRON = 3;

const vertex = /* glsl */ `
precision highp float;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform float uTime;
uniform vec3 uPlayer;
uniform float uNight;
uniform float uRain;
uniform vec4 uBursts[${BURST_SLOTS}];
uniform vec4 uBeacons[${BEACON_SLOTS}];
in vec3 position;
in vec3 aOrigin;
in vec4 aData; // kind, seed, size, slot
out vec2 vUv;
out float vKind;
out float vSeed;
out float vGlow;
const vec4 HIDDEN = vec4(2.0, 2.0, 2.0, 1.0);
void main() {
  float kind = aData.x, seed = aData.y, size = aData.z;
  int slot = int(aData.w + 0.5);
  vUv = position.xy;
  vKind = kind;
  vSeed = seed;
  vGlow = 0.0;
  if (kind < 0.5) {
    // Butterfly by day, firefly by night; neither in the rain.
    if (uRain > 0.4) { gl_Position = HIDDEN; return; }
    float t = uTime * (uNight > 0.5 ? 0.35 : 1.0) + seed * 37.0;
    vec3 o = aOrigin + vec3(sin(t * 0.37 + seed * 6.0) * 1.5, sin(t * 0.9 + seed * 3.0) * 0.25, sin(t * 0.29 + seed * 11.0) * 1.5);
    // Flee: pushed up to 2 units away from the player inside 2.5.
    vec2 away = o.xz - uPlayer.xz;
    float push = (1.0 - smoothstep(0.0, 2.5, length(away))) * 2.0;
    o.xz += normalize(away + vec2(1e-4)) * push;
    o.y += push * 0.45;
    vec4 c = viewMatrix * vec4(o, 1.0);
    if (uNight > 0.5) {
      // Firefly: a small round glow, pulsing every 2–4 s.
      vGlow = smoothstep(0.2, 1.0, sin(uTime * (1.6 + seed * 1.5) + seed * 40.0));
      c.xy += position.xy * 0.06;
      vKind = 4.0;
    } else {
      // Wings fold about the body: angle 0.2–1.3 rad at ~11 rad/s.
      float a = 0.2 + 1.1 * abs(sin(t * 11.0 + seed * 9.0));
      c.x += position.x * cos(a) * size;
      c.z += abs(position.x) * sin(a) * size;
      c.y += position.y * size * 0.75;
    }
    gl_Position = projectionMatrix * c;
    return;
  }
  if (kind < 1.5) {
    // Feathers: 1.6 s after a burst starts, drifting out and down.
    vec4 b = uBursts[slot];
    float age = uTime - b.w;
    if (age < 0.0 || age > 1.6) { gl_Position = HIDDEN; return; }
    float ang = seed * 6.2831853;
    float out_ = (0.8 + fract(seed * 7.0) * 1.2) * (1.0 - exp(-age * 2.5));
    vec3 p = b.xyz + vec3(cos(ang) * out_, 0.35 + age * 1.3 - age * age * 0.75, sin(ang) * out_);
    p.x += sin(age * 6.0 + seed * 20.0) * 0.12;
    vec4 c = viewMatrix * vec4(p, 1.0);
    float spin = age * (4.0 + seed * 5.0) + seed * 10.0;
    vec2 q = position.xy * vec2(0.45, 1.0) * size * (1.0 - smoothstep(1.2, 1.6, age));
    c.xy += vec2(q.x * cos(spin) - q.y * sin(spin), q.x * sin(spin) + q.y * cos(spin));
    vUv = position.xy;
    gl_Position = projectionMatrix * c;
    return;
  }
  vec4 b = uBeacons[slot];
  if (b.w < 0.5) { gl_Position = HIDDEN; return; }
  // Beacons grow with distance so they read from the diorama too.
  float far = max(1.0, distance(cameraPosition, b.xyz) / 22.0);
  if (kind < 2.5) {
    // Ground ring, 2.2 across, breathing.
    float r = 1.1 * (1.0 + 0.05 * sin(uTime * 3.0)) * min(far, 2.5);
    vec3 p = b.xyz + vec3(position.x * r, 0.07, position.y * r);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    vGlow = fract(uTime * 0.6);
    return;
  }
  // Chevron bouncing at 3.2 high.
  vec3 p = b.xyz + vec3(0.0, 3.2 + 0.18 * sin(uTime * 2.6) + (far - 1.0) * 1.2, 0.0);
  vec4 c = viewMatrix * vec4(p, 1.0);
  c.xy += position.xy * 0.34 * far;
  gl_Position = projectionMatrix * c;
}
`;

const fragment = /* glsl */ `
precision highp float;
uniform float uSRGB;
uniform float uVeil;
uniform float uLight;
uniform vec3 uFeather;
in vec2 vUv;
in float vKind;
in float vSeed;
in float vGlow;
out vec4 fragColor;
vec3 encode(vec3 c) {
  return uSRGB > 0.5
    ? mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c))
    : c;
}
float ellipse(vec2 p, vec2 c, vec2 r) { vec2 d = (p - c) / r; return dot(d, d); }
void main() {
  if (uVeil > 0.5) discard;
  vec3 col;
  if (vKind < 0.5) {
    vec2 p = vec2(abs(vUv.x), vUv.y);
    float body = step(p.x, 0.09) * step(abs(p.y), 0.72);
    float up = ellipse(p, vec2(0.52, 0.28), vec2(0.5, 0.62));
    float lo = ellipse(p, vec2(0.4, -0.45), vec2(0.36, 0.42));
    if (body < 0.5 && min(up, lo) > 1.0) discard;
    float h = fract(vSeed * 4.0);
    vec3 wing = h < 0.25 ? vec3(0.95, 0.55, 0.12) : h < 0.5 ? vec3(0.97, 0.95, 0.86) : h < 0.75 ? vec3(0.98, 0.84, 0.25) : vec3(0.42, 0.6, 0.95);
    // Dark wing edge and a pale spot.
    wing = mix(wing, vec3(0.12, 0.09, 0.07), smoothstep(0.62, 0.95, min(up, lo)));
    wing = mix(wing, vec3(1.0), (1.0 - smoothstep(0.0, 0.03, ellipse(p, vec2(0.62, 0.42), vec2(0.12, 0.12)))) * 0.8);
    col = body > 0.5 ? vec3(0.1, 0.08, 0.07) : wing;
    col *= uLight;
  } else if (vKind < 1.5) {
    float d = dot(vUv, vUv);
    if (d > 1.0) discard;
    col = mix(uFeather, vec3(1.0), 0.25 * (1.0 - abs(vUv.x))) * uLight;
  } else if (vKind < 2.5) {
    float r = length(vUv);
    float ring = step(0.8, r) * step(r, 0.95);
    // A second ring spreading out and thinning.
    float g = vGlow * 0.95, w = 0.07 * (1.0 - vGlow);
    float wave = step(g - w, r) * step(r, g + w) * step(0.15, vGlow);
    if (ring + wave < 0.5) discard;
    col = vec3(1.0, 0.82, 0.38) * 1.15;
  } else if (vKind < 3.5) {
    // Chevron pointing down, with a dark rim.
    vec2 p = vUv;
    float a = abs(p.x) * 0.9 - p.y;
    float v = step(-0.15, a) * step(a, 0.55) * step(abs(p.x), 0.95) * step(p.y, 0.7);
    if (v < 0.5) discard;
    float rim = step(a, -0.03) + step(0.43, a) + step(0.83, abs(p.x)) + step(0.58, p.y);
    col = rim > 0.5 ? vec3(0.35, 0.22, 0.08) : vec3(1.0, 0.8, 0.32) * 1.2;
  } else {
    float d = dot(vUv, vUv);
    if (d > 0.25 + 0.75 * vGlow) discard;
    col = vec3(0.96, 1.0, 0.63) * (0.6 + 2.4 * vGlow);
  }
  fragColor = vec4(encode(col), 1.0);
}
`;

export type LifeUniforms = ReturnType<typeof makeLifeUniforms>;
export function makeLifeUniforms() {
  return {
    uTime: { value: 0 },
    uPlayer: { value: new THREE.Vector3() },
    uNight: { value: 0 },
    uRain: { value: 0 },
    uLight: { value: 1 },
    uFeather: { value: new THREE.Color("#7a6550") },
    uBursts: { value: Array.from({ length: BURST_SLOTS }, () => new THREE.Vector4(0, 0, 0, -1e3)) },
    uBeacons: { value: Array.from({ length: BEACON_SLOTS }, () => new THREE.Vector4()) },
    uSRGB: { value: 1 },
    uVeil: journeyVeilUniform,
  };
}

export function lifeMaterial(uniforms: LifeUniforms) {
  return new THREE.RawShaderMaterial({
    name: "life-sprites",
    glslVersion: THREE.GLSL3,
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms,
    side: THREE.DoubleSide,
  });
}

/** A strip of two quads (x −1..0..1, y −1..1): the wings fold about x = 0. */
function strip<G extends THREE.BufferGeometry>(geometry: G): G {
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 0, -1, 0, 1, -1, 0, -1, 1, 0, 0, 1, 0, 1, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]);
  return geometry;
}

export type SpriteSpec = { kind: number; x: number; y: number; z: number; seed: number; size: number; slot: number };

export function lifeGeometry(specs: readonly SpriteSpec[]) {
  const geometry = strip(new THREE.InstancedBufferGeometry());
  const origin = new Float32Array(Math.max(1, specs.length) * 3),
    data = new Float32Array(Math.max(1, specs.length) * 4);
  specs.forEach((s, i) => {
    origin.set([s.x, s.y, s.z], i * 3);
    data.set([s.kind, s.seed, s.size, s.slot], i * 4);
  });
  geometry.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(origin, 3));
  geometry.setAttribute("aData", new THREE.InstancedBufferAttribute(data, 4));
  geometry.instanceCount = specs.length;
  // Everything moves in the shader and spans the island: never culled.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return geometry;
}

/** The layer's one material, shared by every world (one program). */
export const lifeUniforms = makeLifeUniforms();
export const lifeSpritesMaterial = lifeMaterial(lifeUniforms);
