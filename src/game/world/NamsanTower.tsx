import { StaticBatch } from "./StaticBatch";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { MeshStandardMaterial } from "three";
import { daylightClock } from "../core/timeOfDay";
import { sampleDaylight } from "../core/daylight";
import { KOREA_LANDMARKS } from "../core/koreaLandmarks";
import { WorldSceneryParts, type SceneryPart } from "./WorldSceneryParts";

const tower: SceneryPart[] = [];
const concrete = "#d4d0be";
const glass = "#59716f";
const red = "#a74a3d";

function column(y: number, radius: number, height: number, c: string) {
  tower.push({ p: [0, y, 0], s: [radius, height, radius], c, shape: "column" });
}

column(0.27, 2.08, 0.25, "#a7a796");
column(0.59, 1.83, 0.42, glass);
column(0.88, 1.97, 0.19, concrete);
column(8.91, 0.64, 16.2, concrete);
column(3.9, 0.93, 0.15, "#929c91");
column(4.18, 0.77, 0.43, glass);
column(4.48, 0.96, 0.16, concrete);
column(16.7, 1.43, 0.45, "#a1a69b");
column(17.52, 1.69, 1.46, glass);
column(18.43, 1.43, 0.4, concrete);
column(18.99, 1.27, 0.76, glass);
column(19.48, 1.08, 0.23, concrete);
column(19.78, 0.69, 0.41, "#a8aca1");
for (let i = 0; i < 10; i++) {
  const θ = ((i + 0.5) / 10) * Math.PI * 2;
  for (const [y, radius, height] of [
    [17.49, 1.43, 1.05],
    [18.99, 1.09, 0.62],
  ]) {
    tower.push({
      p: [Math.sin(θ) * radius, y, Math.cos(θ) * radius],
      s: [0.055, height, 0.24],
      r: [0, θ, 0],
      c: concrete,
      shape: "block",
    });
  }
}
for (let i = 0; i < 6; i++) {
  column(20.38 + i * 0.79, 0.24 - i * 0.029, 0.82, i % 2 ? concrete : red);
}
column(25.05, 0.055, 1.15, red);

function TowerLights() {
  const deck = useRef<MeshStandardMaterial>(null);
  const beacon = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const night = sampleDaylight(daylightClock.hour).night;
    if (deck.current) deck.current.emissiveIntensity = night * 1.45;
    if (beacon.current) beacon.current.emissiveIntensity = night * 0.9;
  });
  return (
    <>
      <mesh position={[0, 17.83, 0]}>
        <cylinderGeometry args={[1.53, 1.53, 0.115, 20]} />
        <meshStandardMaterial
          ref={deck}
          color="#9db7b0"
          emissive="#6ca9b9"
          emissiveIntensity={0}
        />
      </mesh>
      <mesh position={[0, 25.64, 0]}>
        <sphereGeometry args={[0.105, 8, 6]} />
        <meshStandardMaterial
          ref={beacon}
          color={red}
          emissive="#ec6343"
          emissiveIntensity={0}
        />
      </mesh>
    </>
  );
}

export function NamsanTower({
  onVisit,
}: {
  onVisit: (x: number, z: number) => void;
}) {
  const {
    origin: [x, z],
    approach,
  } = KOREA_LANDMARKS.namsan;
  return (
    <StaticBatch id="NamsanTower">
      <group
        name="namsan-seoul-tower"
        position={[x, 0, z]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onVisit(...approach);
        }}
      >
        <WorldSceneryParts parts={tower} />
        <TowerLights />
      </group>
    </StaticBatch>
  );
}
