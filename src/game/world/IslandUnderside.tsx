import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DAYLIGHT_KEYS, sampleDaylight } from "../core/daylight";
import { undersideModel } from "../core/islandUnderside";
import { daylightClock } from "../core/timeOfDay";
import type { WorldId } from "../core/worlds";
import { sculptedMaterial } from "./Surface";

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
const rockMaterial = sculptedMaterial({ vertexColors: true, roughness: 1 });
const sculpt = rockMaterial.onBeforeCompile;
rockMaterial.onBeforeCompile = (shader, renderer) => {
  sculpt.call(rockMaterial, shader, renderer);
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
rockMaterial.customProgramCacheKey = () => "island-underside-v1";

function UndersideLight() {
  useFrame(() => {
    const light = sampleDaylight(daylightClock.hour);
    bounce.value
      .copy(skyKeys[light.index])
      .lerp(skyKeys[light.index + 1], light.blend)
      .multiplyScalar(0.34 - 0.2 * light.night);
  });
  return null;
}

/** Faceted rock hanging beneath each island. Art only: no colliders. */
export function IslandUnderside({
  world,
}: {
  world: WorldId;
  detail?: boolean;
}) {
  return (
    <group name="island-underside">
      <UndersideLight />
      <mesh
        geometry={rockGeometry(world)}
        material={rockMaterial}
        raycast={() => {}}
        dispose={null}
      />
    </group>
  );
}
