import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DAYLIGHT_KEYS, sampleDaylight } from "../core/daylight";
import {
  undersideClouds,
  undersideFalls,
  undersideModel,
} from "../core/islandUnderside";
import { daylightClock } from "../core/timeOfDay";
import type { WorldId } from "../core/worlds";
import { sculptedMaterial } from "./Surface";
import { NaturalTrees } from "./TreeArt";
import {
  undersideDetail,
  type DetailPart,
  type DetailShape,
  type Lantern,
} from "./IslandUndersideDetail";

// Art only: no colliders, pointer targets, lights, textures or shadow casting.
// Geometry is built once per world and kept for later visits.
const noRaycast = () => {};

const rockGeometries = new Map<WorldId, THREE.BufferGeometry>();
function rockGeometry(world: WorldId) {
  let geometry = rockGeometries.get(world);
  if (!geometry) {
    const { rock } = undersideModel(world);
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(rock.positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(rock.colors, 3),
    );
    // Non-indexed: every facet keeps its own normal and painted strata shade.
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    rockGeometries.set(world, geometry);
  }
  return geometry;
}

// Sky light bouncing off the cloud deck below: undersides face away from the
// sun, so without it every hanging facet reads as one black mass.
const bounce = { value: new THREE.Color() };
const skyKeys = DAYLIGHT_KEYS.map((key) => new THREE.Color(key.sky));
function bounceLit(material: THREE.MeshStandardMaterial, key: string) {
  const sculpt = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    sculpt.call(material, shader, renderer);
    shader.uniforms.uBounce = bounce;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uBounce;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float underside = smoothstep(0.3, -0.85, normalize(vSculptNormal).y);
        totalEmissiveRadiance += diffuseColor.rgb * uBounce * (0.25 + 0.75 * underside);`,
      );
  };
  material.customProgramCacheKey = () => key;
  return material;
}
const rockMaterial = bounceLit(
  sculptedMaterial({ vertexColors: true, roughness: 1 }),
  "island-underside-rock-v1",
);
const partMaterial = bounceLit(
  sculptedMaterial({ roughness: 0.9 }),
  "island-underside-part-v1",
);

const shapes: Record<DetailShape, THREE.BufferGeometry> = {
  block: new THREE.BoxGeometry(),
  stone: new THREE.IcosahedronGeometry(1, 0),
  column: new THREE.CylinderGeometry(0.8, 1, 1, 7),
  pyramid: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
};

function Parts({
  parts,
  geometry,
  material,
}: {
  parts: readonly { p: readonly number[]; s: readonly number[]; c: string; r?: readonly number[] }[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const object = new THREE.Object3D();
    // Yaw first, then pitch: spans and eaves are authored that way.
    object.rotation.order = "YXZ";
    const color = new THREE.Color();
    parts.forEach(({ p, s, c, r }, i) => {
      object.position.set(p[0], p[1], p[2]);
      object.scale.set(s[0], s[1], s[2]);
      object.rotation.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, parts.length]}
      raycast={noRaycast}
      dispose={null}
    />
  );
}

function DetailBatches({ parts }: { parts: readonly DetailPart[] }) {
  const batches = useMemo(
    () =>
      (Object.keys(shapes) as DetailShape[])
        .map((shape) => ({
          shape,
          parts: parts.filter((part) => part.shape === shape),
        }))
        .filter((batch) => batch.parts.length > 0),
    [parts],
  );
  return batches.map((batch) => (
    <Parts
      key={`${batch.shape}:${batch.parts.length}`}
      parts={batch.parts}
      geometry={shapes[batch.shape]}
      material={partMaterial}
    />
  ));
}

// Lanterns glow in their own colour (honey, or Korean red/green/blue) by night.
const lanternGlow = { value: 0 };
const lanternMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6 });
lanternMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uGlow = lanternGlow;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float uGlow;")
    .replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;",
    );
};
lanternMaterial.customProgramCacheKey = () => "island-underside-lantern-v1";
const lanternBox = new THREE.BoxGeometry(0.3, 0.42, 0.3);

function Lanterns({ lanterns }: { lanterns: readonly Lantern[] }) {
  const parts = useMemo(
    () => lanterns.map(({ p, c }) => ({ p, s: [1, 1, 1], c })),
    [lanterns],
  );
  return <Parts parts={parts} geometry={lanternBox} material={lanternMaterial} />;
}

// Falls: one merged ribbon mesh per world, scrolling streaks, mist at the foot.
const fallGeometries = new Map<WorldId, THREE.BufferGeometry>();
function fallGeometry(world: WorldId) {
  let geometry = fallGeometries.get(world);
  if (!geometry) {
    const falls = undersideFalls(world);
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(falls.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(falls.uvs, 2));
    geometry.setAttribute("fade", new THREE.Float32BufferAttribute(falls.fades, 1));
    geometry.setIndex(falls.indices);
    geometry.computeBoundingSphere();
    fallGeometries.set(world, geometry);
  }
  return geometry;
}
const fallUniforms = {
  uTime: { value: 0 },
  uTint: { value: new THREE.Color(1, 1, 1) },
  uLanes: { value: 5 },
};
const fallMaterial = new THREE.ShaderMaterial({
  uniforms: fallUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  vertexShader: `
    attribute float fade;
    varying vec2 vUv;
    varying float vFade;
    void main() {
      vUv = uv;
      vFade = fade;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uTint;
    uniform float uLanes;
    varying vec2 vUv;
    varying float vFade;
    void main() {
      float lane = floor(vUv.x * uLanes);
      float seed = fract(sin(lane * 12.9898 + 4.1) * 43758.5453);
      float streak = fract(vUv.y * (0.12 + seed * 0.06) - uTime * (0.5 + seed * 0.3) + seed);
      float foam = smoothstep(0.0, 0.1, streak) * (1.0 - smoothstep(0.16, 0.42, streak));
      float edge = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));
      vec3 water = mix(vec3(0.34, 0.6, 0.68), vec3(0.88, 0.96, 0.97), foam * 0.7);
      float lip = 1.0 - smoothstep(0.0, 2.2, vUv.y);
      water = mix(water, vec3(0.92, 0.97, 0.97), lip * 0.55);
      gl_FragColor = vec4(water * uTint, (0.66 + 0.28 * foam) * edge * vFade);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const dayWater = new THREE.Color(1, 1, 1),
  nightWater = new THREE.Color(0.42, 0.5, 0.72);

// A low-poly wooden water wheel, merged so it turns as a single draw.
const wheelGeometry = (() => {
  const wood = new THREE.Color("#7d6246"),
    paddle = new THREE.Color("#9b7f5c");
  const pieces: THREE.BufferGeometry[] = [];
  const paint = (geometry: THREE.BufferGeometry, color: THREE.Color) => {
    const colors = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry.index ? geometry.toNonIndexed() : geometry;
  };
  pieces.push(paint(new THREE.TorusGeometry(1, 0.08, 5, 16), wood));
  pieces.push(paint(new THREE.TorusGeometry(0.62, 0.06, 5, 12), wood));
  pieces.push(paint(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8).rotateX(Math.PI / 2), wood));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    pieces.push(
      paint(
        new THREE.BoxGeometry(0.08, 1, 0.08).rotateZ(a).translate(Math.sin(-a) * 0.5, Math.cos(a) * 0.5, 0),
        wood,
      ),
    );
    pieces.push(
      paint(
        new THREE.BoxGeometry(0.42, 0.1, 0.5).rotateZ(a).translate(Math.sin(-a) * 1.08, Math.cos(a) * 1.08, 0),
        paddle,
      ),
    );
  }
  const merged = mergeGeometries(pieces.map((piece) => {
    piece.deleteAttribute("uv");
    return piece;
  }))!;
  merged.computeVertexNormals();
  return merged;
})();
const wheelMaterial = bounceLit(
  sculptedMaterial({ vertexColors: true, roughness: 0.9 }),
  "island-underside-wheel-v1",
);

const cloudGeometry = new THREE.IcosahedronGeometry(1, 1);
const clouds = new Map<WorldId, { p: number[]; s: number[]; c: string }[]>();
function cloudParts(world: WorldId) {
  let parts = clouds.get(world);
  if (!parts) {
    parts = undersideClouds(world).map(({ p, s }) => ({ p, s, c: "#ffffff" }));
    clouds.set(world, parts);
  }
  return parts;
}
const cloudMaterial = new THREE.MeshStandardMaterial({
  color: "#eef1ea",
  roughness: 1,
  flatShading: true,
});

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

/** Faceted rock, islets, falls and dressing hanging beneath each island. */
export function IslandUnderside({
  world,
  detail = true,
}: {
  world: WorldId;
  detail?: boolean;
}) {
  const reduced = useReducedMotion();
  const wheel = useRef<THREE.Group>(null);
  const dressing = undersideDetail(world);
  useFrame((_, delta) => {
    const light = sampleDaylight(daylightClock.hour);
    bounce.value
      .copy(skyKeys[light.index])
      .lerp(skyKeys[light.index + 1], light.blend)
      .multiplyScalar(0.34 - 0.2 * light.night);
    lanternGlow.value = 0.06 + light.night * 1.5;
    fallUniforms.uTint.value.copy(dayWater).lerp(nightWater, light.night);
    fallUniforms.uLanes.value = world === "stanford" ? 9 : world === "korea" ? 2 : 4;
    if (!reduced) {
      const dt = Math.min(delta, 0.1);
      fallUniforms.uTime.value = (fallUniforms.uTime.value + dt) % 1000;
      if (wheel.current) wheel.current.rotation.z -= dt * 0.6;
    }
  });
  const wheelSpec = dressing.wheel;
  return (
    <group name="island-underside">
      <mesh
        geometry={rockGeometry(world)}
        material={rockMaterial}
        raycast={noRaycast}
        dispose={null}
      />
      <DetailBatches parts={dressing.parts} />
      {detail && <DetailBatches parts={dressing.fine} />}
      {detail && dressing.lanterns.length > 0 && (
        <Lanterns lanterns={dressing.lanterns} />
      )}
      <NaturalTrees trees={dressing.trees} />
      {wheelSpec && (
        <group
          position={wheelSpec.p}
          rotation={[0, Math.atan2(wheelSpec.normal[0], wheelSpec.normal[1]), 0]}
        >
          <group ref={wheel} scale={wheelSpec.radius}>
            <mesh
              geometry={wheelGeometry}
              material={wheelMaterial}
              raycast={noRaycast}
              dispose={null}
            />
          </group>
        </group>
      )}
      <mesh
        geometry={fallGeometry(world)}
        material={fallMaterial}
        raycast={noRaycast}
        renderOrder={2}
        dispose={null}
      />
      {detail && (
        <Parts
          parts={cloudParts(world)}
          geometry={cloudGeometry}
          material={cloudMaterial}
        />
      )}
    </group>
  );
}
