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
// One meaningful Seoul landmark, rooted on the compact island. No filler skyline.
detail([-28, 0.4, -48], [2.4, 0.5, 2.4], "#8d9683", "column");
detail([-28, 9.5, -48], [0.65, 19, 0.65], "#cbcbb5", "column");
detail([-28, 18.9, -48], [2.35, 0.65, 2.35], "#b2bdb0", "column");
detail([-28, 19.55, -48], [1.9, 0.85, 1.9], "#738e88", "column");
detail([-28, 20.2, -48], [2.15, 0.4, 2.15], "#d7d5bb", "column");
detail([-28, 20.8, -48], [1.12, 0.8, 1.12], "#b0bca9", "column");
detail([-28, 22.9, -48], [0.24, 4, 0.24], "#c8ccba", "column");
detail([-28, 26.2, -48], [0.09, 3, 0.09], "#c5b497", "column");
detail([-28, 24.7, -48], [0.22, 0.23, 0.22], "#9e6352", "column");

function TowerLight() {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (material.current)
      material.current.emissiveIntensity =
        sampleDaylight(daylightClock.hour).night * 1.7;
  });
  return (
    <mesh position={[-28, 19.05, -48]}>
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
