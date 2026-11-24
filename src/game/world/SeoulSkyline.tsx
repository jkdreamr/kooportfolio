import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight } from "../core/daylight";
import { RegionalTerrain } from "./RegionalTerrain";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

const skyline: SceneryPart[] = [];
function detail(
  p: [number, number, number],
  s: [number, number, number],
  c: string,
  shape: SceneryPart["shape"] = "stone",
) {
  skyline.push({ p, s, c, shape });
}
for (let i = 0; i < 30; i++) {
  const x = -95 + i * 6.6;
  const z = -79 - (i % 4) * 6;
  const h = 7 + ((i * 17) % 18),
    w = 3.1 + (i % 3) * 0.6,
    d = 4 + (i % 3);
  const apartment = i % 3 !== 0;
  detail(
    [x, h / 2, z],
    [w, h, d],
    apartment ? ["#a4ada2", "#b0b4a6", "#b9bdae"][i % 3] : "#6d8683",
  );
  detail([x, h + 0.12, z], [w + 0.3, 0.28, d + 0.3], "#c0c4b1");
  detail([x, h + 0.6, z - 0.5], [w * 0.5, 1, 1.7], "#8d9d92");
  for (let y = 1.2; y < h - 0.3; y += 1.6) {
    if (apartment)
      detail([x, y - 0.42, z + d / 2 + 0.1], [w + 0.1, 0.16, 0.36], "#c1c5b4");
    for (let col = -1; col <= 1; col++) {
      detail(
        [x + (col * w) / 3.5, y, z + d / 2 + 0.19],
        [w / 5, 0.64, 0.035],
        (i + col + Math.round(y)) % 5 === 0 ? "#c5bd8a" : "#637d77",
        "block",
      );
    }
  }
  if (!apartment) {
    for (let col = -1; col <= 1; col++)
      detail(
        [x + (col * w) / 3, h / 2, z + d / 2 + 0.1],
        [0.055, h, 0.06],
        "#a5b9ad",
        "block",
      );
  }
}
// Namsan's hilltop tower: slender concrete shaft, wide observation saucer, antenna.
detail([-33, 18, -109], [0.65, 19, 0.65], "#cbcbb5", "column");
detail([-33, 27.4, -109], [2.35, 0.65, 2.35], "#b2bdb0", "column");
detail([-33, 28.05, -109], [1.9, 0.85, 1.9], "#738e88", "column");
detail([-33, 28.7, -109], [2.15, 0.4, 2.15], "#d7d5bb", "column");
detail([-33, 29.3, -109], [1.12, 0.8, 1.12], "#b0bca9", "column");
detail([-33, 31.4, -109], [0.24, 4, 0.24], "#c8ccba", "column");
detail([-33, 34.7, -109], [0.09, 3, 0.09], "#c5b497", "column");
detail([-33, 33.2, -109], [0.22, 0.23, 0.22], "#9e6352", "column");

function TowerLight() {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (material.current)
      material.current.emissiveIntensity =
        sampleDaylight(daylightClock.hour).night * 1.7;
  });
  return (
    <mesh position={[-33, 27.55, -109]}>
      <cylinderGeometry args={[2.37, 2.37, 0.14, 16]} />
      <meshStandardMaterial
        ref={material}
        color="#a5c9c4"
        emissive="#70b5ce"
        emissiveIntensity={0}
      />
    </mesh>
  );
}

export function SeoulSkyline() {
  return (
    <group name="seoul-skyline-namsan">
      <RegionalTerrain region="seoul" />
      <WorldSceneryParts parts={skyline} />
      <TowerLight />
    </group>
  );
}
