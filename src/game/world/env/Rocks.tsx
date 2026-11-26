import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WorldId } from "../../core/worlds";
import { noiseUniform } from "./noise";
import { ENV_UNIFORMS_GLSL, bindEnvUniforms } from "./uniforms";
import { rockField, type RockPiece } from "./placement";
import { reflect } from "./reflection";
import { surfaceSky, SURFACE_NOISE_FN, SURFACE_WORLD_VERTEX } from "../Surface";

/**
 * Stepped granite: four bevelled, noise-displaced, flat-shaded variants,
 * baked with every rock of the island into ONE static mesh (one draw, cast and
 * receive shadows). Moss grows on up-facing ledges by world normal and noise;
 * Stanford's sandstone takes dry lichen instead.
 */

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A chamfered slab: a box with its top edges bevelled, as a non-indexed
 * geometry so flat shading keeps crisp facets. */
function slab(w: number, h: number, d: number, bevel: number) {
  const geometry = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    if (y > 0) {
      // Pull the top ring in for a chamfer.
      position.setX(i, x * (1 - (bevel / w) * 2 * Math.sign(Math.abs(x))));
      position.setZ(i, z * (1 - (bevel / d) * 2 * Math.sign(Math.abs(z))));
    }
  }
  return geometry.toNonIndexed();
}

/** Stack slabs into a stepped block, displace by seeded noise. */
function variant(kind: number) {
  const rand = random(1000 + kind * 77);
  const parts: THREE.BufferGeometry[] = [];
  const push = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry: number) => {
    g.rotateY(ry);
    g.translate(x, y, z);
    parts.push(g);
  };
  if (kind === 0) {
    // Wide stepped ledge: three receding tiers.
    push(slab(2, 0.5, 1.6, 0.08), 0, 0.25, 0, 0);
    push(slab(1.5, 0.45, 1.2, 0.08), -0.15, 0.7, -0.1, 0.12);
    push(slab(0.9, 0.4, 0.8, 0.07), -0.3, 1.1, -0.15, -0.1);
  } else if (kind === 1) {
    // Tall block with a shoulder.
    push(slab(1.2, 1.4, 1.1, 0.1), 0, 0.7, 0, 0);
    push(slab(0.8, 0.5, 0.9, 0.08), 0.75, 0.25, 0.1, 0.25);
  } else if (kind === 2) {
    // Rounded boulder: a squashed icosahedron.
    const g = new THREE.IcosahedronGeometry(0.8, 1);
    g.scale(1.2, 0.75, 1);
    push(g.toNonIndexed(), 0, 0.5, 0, 0);
  } else {
    // Two blocks leaning together.
    push(slab(1.1, 0.9, 1, 0.09), -0.45, 0.45, 0, 0.2);
    push(slab(1, 0.7, 1.1, 0.09), 0.5, 0.35, 0.15, -0.3);
    push(slab(0.6, 0.35, 0.6, 0.06), 0.1, 1.0, 0.05, 0.5);
  }
  const merged = mergeGeometries(parts.map((p) => { p.deleteAttribute("uv"); p.deleteAttribute("normal"); return p; }))!;
  const position = merged.getAttribute("position");
  // Coherent displacement: the same corner moves the same way in every face.
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    const n =
      Math.sin(x * 3.1 + kind) * Math.cos(z * 2.7 - kind) * 0.07 +
      Math.sin((x + z) * 5.3 + y * 2.1) * 0.035;
    position.setXYZ(i, x + n, y + n * 0.6 * (y > 0.05 ? 1 : 0), z - n);
  }
  void rand;
  merged.computeVertexNormals();
  return merged;
}
const variants = [0, 1, 2, 3].map(variant);

const TONES: Record<WorldId, { base: string[]; moss: string; mossAmount: number }> = {
  home: { base: ["#a3a29d", "#b2b0aa", "#93938f", "#9c9a92"], moss: "#5f7d3a", mossAmount: 1 },
  korea: { base: ["#b4b4ac", "#c2c1b8", "#a2a39c", "#adaca2"], moss: "#5d7a40", mossAmount: 0.8 },
  stanford: { base: ["#c4a57a", "#b8966a", "#cfb48b", "#a98b62"], moss: "#9a8a4a", mossAmount: 0.45 },
};

export function bakeRocks(world: WorldId, rocks: readonly RockPiece[]) {
  const tones = TONES[world];
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  const pieces = rocks.map((rock, i) => {
    const g = variants[rock.variant].clone();
    q.setFromAxisAngle(up, rock.angle);
    const s = rock.size;
    matrix.compose(
      new THREE.Vector3(rock.x, rock.y, rock.z),
      q,
      new THREE.Vector3(s, s * rock.height, s),
    );
    g.applyMatrix4(matrix);
    color.set(tones.base[i % tones.base.length]).multiplyScalar(0.92 + rock.tone * 0.16);
    const colors = new Float32Array(g.getAttribute("position").count * 3);
    for (let k = 0; k < colors.length; k += 3) color.toArray(colors, k);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  });
  if (!pieces.length) return null;
  const merged = mergeGeometries(pieces)!;
  pieces.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  return merged;
}

export const rockUniforms = {
  uRockMoss: { value: new THREE.Color("#5f7d3a") },
  uRockMossAmount: { value: 1 },
};

function rockMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.88,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    bindEnvUniforms(shader);
    Object.assign(shader.uniforms, rockUniforms);
    shader.uniforms.uSurfaceNoise = noiseUniform;
    shader.uniforms.uSurfaceSky = surfaceSky;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSculptWorld;")
      .replace("#include <project_vertex>", `#include <project_vertex>${SURFACE_WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        ${ENV_UNIFORMS_GLSL}
        varying vec3 vSculptWorld;
        uniform sampler2D uSurfaceNoise;
        uniform vec3 uSurfaceSky;
        uniform vec3 uRockMoss;
        uniform float uRockMossAmount;
        float rockGrain;
        ${SURFACE_NOISE_FN}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        vec3 rockN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        vec4 rockNoise = sculptNoise(vSculptWorld * 0.55, rockN);
        rockGrain = rockNoise.r * 0.5 + rockNoise.g * 0.5;
        float rockFleck = smoothstep(0.08, 0.0, rockNoise.a);
        diffuseColor.rgb *= 0.86 + rockGrain * 0.26;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.72, rockFleck * 0.6);
        // Cool shadowed undersides, warm sunlit tops (painted).
        diffuseColor.rgb *= mix(vec3(0.84, 0.88, 0.94), vec3(1.05, 1.02, 0.97), smoothstep(-0.4, 0.8, rockN.y));
        float rockMoss = smoothstep(0.55, 0.85, rockN.y + (rockNoise.g - 0.5) * 0.7) * uRockMossAmount;
        rockMoss *= smoothstep(0.25, 0.6, texture2D(uSurfaceNoise, vSculptWorld.xz * 0.11).g + 0.15);
        diffuseColor.rgb = mix(diffuseColor.rgb, uRockMoss * (0.8 + rockNoise.r * 0.4), rockMoss);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (rockGrain - 0.5) * 0.2, 0.5, 1.0);`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        float rockRim = 1.0 - saturate(dot(geometryNormal, geometryViewDir));
        reflectedLight.indirectSpecular += uSurfaceSky * rockRim * rockRim * rockRim * 0.8;`,
      );
  };
  material.customProgramCacheKey = () => "env-rock-v1";
  return material;
}
export const rockMaterialShared = rockMaterial();
const noRaycast = () => undefined;

const baked = new Map<WorldId, THREE.BufferGeometry | null>();
export function rockGeometry(world: WorldId) {
  if (!baked.has(world)) baked.set(world, bakeRocks(world, rockField(world)));
  return baked.get(world)!;
}

export function Rocks({ world }: { world: WorldId }) {
  const geometry = useMemo(() => rockGeometry(world), [world]);
  useMemo(() => {
    rockUniforms.uRockMoss.value.set(TONES[world].moss);
    rockUniforms.uRockMossAmount.value = TONES[world].mossAmount;
  }, [world]);
  if (!geometry) return null;
  return (
    <mesh
      ref={reflect}
      name="env-rocks"
      geometry={geometry}
      material={rockMaterialShared}
      castShadow
      receiveShadow
      raycast={noRaycast}
      dispose={null}
    />
  );
}
