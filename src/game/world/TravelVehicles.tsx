import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Ball, Box, Cylinder } from "./Models";
import { RailCar } from "./IslandTrain";

export function RoadCar() {
  return (
    <group>
      <Box p={[0, 0.78, 0]} s={[2.25, 0.65, 4.3]} c="#356a67" />
      <Box p={[0, 1.4, -0.25]} s={[1.85, 0.85, 2.1]} c="#356a67" />
      <Box
        p={[0, 1.55, 0.82]}
        s={[1.6, 0.52, 0.08]}
        c="#b6d4cf"
        r={[-0.2, 0, 0]}
      />
      <Box p={[0, 1.55, -1.32]} s={[1.6, 0.5, 0.08]} c="#b6d4cf" />
      {[-1, 1].flatMap((side) => [
        <Box
          key={`window:${side}`}
          p={[side * 0.94, 1.55, -0.2]}
          s={[0.06, 0.5, 1.65]}
          c="#b6d4cf"
        />,
        ...[-1.35, 1.35].map((z) => (
          <Cylinder
            key={`${side}:${z}`}
            p={[side * 1.05, 0.48, z]}
            s={[0.48, 0.3, 0.48]}
            r={[0, 0, Math.PI / 2]}
            c="#29373b"
          />
        )),
        <Box
          key={`lamp:${side}`}
          p={[side * 0.75, 0.85, 2.18]}
          s={[0.48, 0.26, 0.06]}
          c="#ffe8a9"
        />,
        <Box
          key={`tail:${side}`}
          p={[side * 0.75, 0.86, -2.18]}
          s={[0.38, 0.22, 0.06]}
          c="#b95743"
        />,
      ])}
      <Box p={[0, 0.56, 2.2]} s={[2, 0.16, 0.2]} c="#c1b28a" />
    </group>
  );
}

export function JourneyTrain() {
  const phase = useRef(0);
  useFrame((_, delta) => {
    phase.current -= Math.min(delta, 0.05) * 12;
  });
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <group key={i} position={[0, 0, -i * 4.6]}>
          <RailCar engine={i === 0} phase={phase} />
        </group>
      ))}
    </group>
  );
}

export function PassengerJet() {
  return (
    <group>
      <Ball p={[0, 0, 0]} s={[0.65, 0.65, 4]} c="#ece5cf" />
      <Ball p={[0, 0.28, 2.8]} s={[0.52, 0.32, 0.8]} c="#527781" />
      <Box p={[-0.625, 0, -1.7]} s={[0.06, 0.8, 0.65]} c="#526673" />
      <Box
        p={[0, -0.02, -0.2]}
        s={[8.5, 0.15, 1.6]}
        r={[0, -0.12, 0]}
        c="#d6d4c5"
      />
      <Box p={[0, 0.2, -2.9]} s={[3.5, 0.12, 1]} c="#356a67" />
      <Box
        p={[0, 0.95, -2.8]}
        s={[0.18, 1.8, 1.5]}
        r={[-0.25, 0, 0]}
        c="#356a67"
      />
      {[-1, 1].flatMap((side) => [
        <Cylinder
          key={`engine:${side}`}
          p={[side * 2.25, -0.45, 0.05]}
          s={[0.36, 1.6, 0.36]}
          r={[Math.PI / 2, 0, 0]}
          c="#657d7b"
        />,
        ...[-1.8, -1.1, -0.4, 0.3, 1, 1.7].map((z) => (
          <Box
            key={`${side}:${z}`}
            p={[side * 0.61, 0.15, z]}
            s={[0.08, 0.2, 0.26]}
            c="#476673"
          />
        )),
      ])}
    </group>
  );
}

/** Local to the parked aircraft; these stay on the apron during flight. */
export function PassengerStairs() {
  return (
    <group name="passenger-stairs">
      {[0, 1, 2, 3, 4].map((step) => {
        const height = 0.2 + step * 0.13;
        return (
          <Box
            key={step}
            p={[-2.9 + step * 0.48, height / 2 - 1.2, -1.7]}
            s={[0.5, height, 0.8]}
            c="#a9b2b9"
          />
        );
      })}
      {[-2.1, -1.3].map((z) => (
        <Box
          key={z}
          p={[-1.95, 0, z]}
          s={[2.5, 0.07, 0.07]}
          r={[0, 0, 0.25]}
          c="#d3d9dd"
        />
      ))}
    </group>
  );
}
