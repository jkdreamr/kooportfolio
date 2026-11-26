import { StaticBatch } from "../world/StaticBatch";
import { useLayoutEffect, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Box, Cylinder, Sign } from "../world/Models";
import { FIELD_GOAL } from "../core/fieldGoal";
import { STADIUM } from "../core/stadiumLayout";

const RED = "#a91f32",
  GOLD = "#c5a15b",
  STONE = "#baa98b";

function Field() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 1536;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#357349";
    c.fillRect(0, 0, 768, 1536);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = i % 2 ? "#397a49" : "#43854f";
      c.fillRect(14, 160 + i * 121.6, 740, 121.6);
    }
    c.fillStyle = RED;
    c.fillRect(14, 14, 740, 146);
    c.fillRect(14, 1376, 740, 146);
    c.strokeStyle = "#fff3d6";
    c.lineWidth = 5;
    c.strokeRect(14, 14, 740, 1508);
    for (let i = 0; i <= 10; i++) {
      const y = 160 + i * 121.6;
      c.beginPath();
      c.moveTo(14, y);
      c.lineTo(754, y);
      c.stroke();
      if (i > 0 && i < 10) {
        c.font = "bold 40px Georgia";
        c.textAlign = "center";
        c.fillStyle = "#fff3d6";
        const label = String(Math.min(i, 10 - i) * 10);
        c.fillText(label, 96, y + 44);
        c.fillText(label, 672, y + 44);
      }
      if (i < 10)
        for (let j = 1; j < 5; j++) {
          const hashY = y + j * 24.32;
          [25, 303, 445, 729].forEach((x) => c.fillRect(x, hashY, 15, 3));
        }
    }
    c.fillStyle = "#f4d997";
    c.font = "bold 74px Georgia";
    c.textAlign = "center";
    c.fillText("49ERS", 384, 115);
    c.save();
    c.translate(384, 1450);
    c.rotate(Math.PI);
    c.fillText("SAN FRANCISCO", 0, 24);
    c.restore();
    c.beginPath();
    c.ellipse(384, 768, 120, 78, 0, 0, Math.PI * 2);
    c.fillStyle = "#a91f32";
    c.fill();
    c.strokeStyle = "#cfac68";
    c.lineWidth = 10;
    c.stroke();
    c.fillStyle = "#fff3d6";
    c.font = "italic bold 82px Georgia";
    c.fillText("SF", 384, 795);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <>
      <Box p={[0, 0.03, STADIUM.fieldZ]} s={[20.2, 0.24, 48.2]} c="#254c36" />
      <mesh
        position={[0, 0.158, STADIUM.fieldZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[STADIUM.fieldWidth, STADIUM.fieldDepth]} />
        <meshStandardMaterial map={texture} roughness={1} />
      </mesh>
    </>
  );
}

type Seat = { x: number; y: number; z: number; rotation: number };
// Hundreds of seats share two draw calls instead of hundreds of individual meshes.
function Seats({ seats }: { seats: Seat[] }) {
  const bases = useRef<THREE.InstancedMesh>(null);
  const backs = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!bases.current || !backs.current) return;
    const object = new THREE.Object3D();
    seats.forEach((seat, i) => {
      object.position.set(seat.x, seat.y, seat.z);
      object.rotation.y = seat.rotation;
      object.updateMatrix();
      bases.current!.setMatrixAt(i, object.matrix);
      object.translateY(0.22);
      object.translateZ(-0.2);
      object.updateMatrix();
      backs.current!.setMatrixAt(i, object.matrix);
      const shade = new THREE.Color(
        i % 7 === 0 ? "#d0aa62" : i % 3 ? "#b82a3a" : "#8c192a",
      );
      bases.current!.setColorAt(i, shade);
      backs.current!.setColorAt(i, shade);
    });
    for (const mesh of [bases.current!, backs.current!]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [seats]);
  return (
    <>
      <instancedMesh
        ref={bases}
        args={[undefined, undefined, seats.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.48, 0.17, 0.48]} />
        <meshStandardMaterial roughness={0.65} />
      </instancedMesh>
      <instancedMesh
        ref={backs}
        args={[undefined, undefined, seats.length]}
        castShadow
      >
        <boxGeometry args={[0.48, 0.39, 0.11]} />
        <meshStandardMaterial roughness={0.65} />
      </instancedMesh>
    </>
  );
}

function SeatingBowl() {
  const seats = useMemo(() => {
    const result: Seat[] = [];
    for (const side of [-1, 1])
      for (let row = 0; row < 5; row++) {
        for (let i = 0; i < 60; i++) {
          if (i === 14 || i === 29 || i === 44) continue; // Concrete stair aisles.
          result.push({
            x: side * (11.5 + row * 0.76),
            y: 0.8 + row * 0.57,
            z: -22.5 + i * 0.76,
            rotation: (side * -Math.PI) / 2,
          });
        }
      }
    for (let row = 0; row < 5; row++)
      for (let i = 0; i < 29; i++) {
        if (i === 7 || i === 14 || i === 21) continue;
        result.push({
          x: (i - 14) * 0.72,
          y: 0.8 + row * 0.57,
          z: -25.2 - row * 0.7,
          rotation: 0,
        });
      }
    for (let row = 0; row < 3; row++)
      for (const side of [-1, 1])
        for (let i = 0; i < 13; i++) {
          result.push({
            x: side * (4 + i * 0.72),
            y: 0.7 + row * 0.5,
            z: 25.2 + row * 0.7,
            rotation: Math.PI,
          });
        }
    return result;
  }, []);
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0, 1, 2, 3, 4].map((row) => (
            <Box
              key={row}
              p={[side * (11.5 + row * 0.76), (0.64 + row * 0.57) / 2, -0.5]}
              s={[0.83, 0.64 + row * 0.57, 46]}
              c={row % 2 ? "#aa9c83" : STONE}
            />
          ))}
          <Box p={[side * 15.5, 1.8, -0.5]} s={[0.32, 3.6, 47]} c={RED} />
          <Box p={[side * 15.5, 3.63, -0.5]} s={[0.4, 0.16, 47.2]} c={GOLD} />
          {[-11.86, -0.46, 10.94].map((z) => (
            <group key={z}>
              {Array.from({ length: 10 }, (_, i) => (
                <Box
                  key={i}
                  p={[side * (11.1 + i * 0.37), 0.3 + i * 0.28, z]}
                  s={[0.4, 0.16, 0.62]}
                  c="#d1c4aa"
                />
              ))}
            </group>
          ))}
          <Box p={[side * 10.7, 0.42, -0.5]} s={[0.2, 0.7, 47]} c="#d4bf91" />
          <Box p={[side * 10.68, 0.8, -0.5]} s={[0.28, 0.11, 47.1]} c={RED} />
        </group>
      ))}
      {[0, 1, 2, 3, 4].map((row) => (
        <Box
          key={row}
          p={[0, (0.64 + row * 0.57) / 2, -25.2 - row * 0.7]}
          s={[22, 0.64 + row * 0.57, 0.8]}
          c={STONE}
        />
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0, 1, 2].map((row) => (
            <Box
              key={row}
              p={[side * 8.3, 0.25 + row * 0.25, 25.2 + row * 0.7]}
              s={[9.4, 0.5 + row * 0.5, 0.8]}
              c={STONE}
            />
          ))}
        </group>
      ))}
      <Seats seats={seats} />
    </>
  );
}

export function GoalPosts({
  miniature = false,
  made = false,
}: {
  miniature?: boolean;
  made?: boolean;
}) {
  const width = FIELD_GOAL.halfWidth;
  const paint = made ? "#b3ee8b" : "#f8d45c";
  return (
    <group scale={miniature ? 0.35 : 1}>
      <Cylinder p={[0, 1.45, 0]} s={[0.095, 2.9, 0.095]} c="#edc342" />
      <Box p={[0, 0.55, 0]} s={[0.43, 1.1, 0.43]} c={RED} />
      <Cylinder
        p={[0, 2.9, 0]}
        s={[0.085, width * 2, 0.085]}
        r={[0, 0, Math.PI / 2]}
        c={paint}
      />
      {[-width, width].map((x) => (
        <Cylinder key={x} p={[x, 4.45, 0]} s={[0.075, 3.1, 0.075]} c={paint} />
      ))}
    </group>
  );
}

function Floodlight({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <Box p={[0, 0.2, 0]} s={[0.7, 0.4, 0.7]} c={STONE} />
      <Cylinder p={[0, 3, 0]} s={[0.1, 6, 0.1]} c="#65716a" />
      <Box p={[0, 5.8, 0]} s={[1.6, 0.75, 0.3]} c="#40524d" />
      {[-0.5, 0, 0.5].map((x) => (
        <Box key={x} p={[x, 5.8, 0.19]} s={[0.35, 0.47, 0.1]} c="#fff0be" />
      ))}
    </group>
  );
}

export function StadiumArchitecture({
  attempt = 0,
  made = false,
}: {
  attempt?: number;
  made?: boolean;
}) {
  return (
    <>
      <Box
        p={[0, -0.55, 0]}
        s={[STADIUM.width, 1.1, STADIUM.depth]}
        c="#665f50"
      />
      <Box
        p={[0, -0.12, 0]}
        s={[STADIUM.width - 0.2, 0.35, STADIUM.depth - 0.2]}
        c="#c0b091"
      />
      <Field />
      <SeatingBowl />
      {/* The asymmetric suite tower is the silhouette cue from Levi's Stadium. */}
      <Box p={[-17.2, 3.2, -1]} s={[2.8, 6.4, 46]} c="#9f967e" />
      {[1.6, 3.1, 4.6, 6].map((y) => (
        <group key={y}>
          <Box p={[-15.75, y, -1]} s={[0.14, 0.78, 44.8]} c="#3c5758" />
          <Box p={[-15.63, y - 0.45, -1]} s={[0.35, 0.18, 46.2]} c="#e0ceb0" />
          {Array.from({ length: 12 }, (_, i) => -21.5 + i * 3.8).map((z) => (
            <Box key={z} p={[-15.6, y, z]} s={[0.18, 0.9, 0.13]} c={GOLD} />
          ))}
        </group>
      ))}
      <Box p={[-17.05, 6.55, -1]} s={[3.25, 0.34, 46.8]} c={RED} />
      <Box p={[-17.05, 6.78, -1]} s={[3.4, 0.15, 47]} c={GOLD} />
      <group position={[0, 0, FIELD_GOAL.goalZ]}>
        <GoalPosts made={made} />
      </group>
      <Box p={[0, 4.5, -28.85]} s={[8.4, 3.1, 0.72]} c="#393d35" />
      <Box p={[0, 6.12, -28.85]} s={[8.6, 0.2, 0.8]} c={GOLD} />
      <Sign
        text="49ERS"
        p={[0, 5.2, -28.45]}
        size={[7.3, 1.05]}
        color={RED}
        ink="#f7e4b3"
      />
      <Sign
        text={attempt ? `KICK ${attempt} / ${FIELD_GOAL.attempts}` : "GO 49ERS"}
        p={[0, 3.9, -28.45]}
        size={[6.2, 0.82]}
        color="#243d32"
        ink="#f7d178"
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          {[-26.5, -9, 9, 25.8].map((z) => (
            <Floodlight key={z} p={[side * 18.6, 0, z]} />
          ))}
          <Box p={[side * 1.95, 1.3, 29.25]} s={[0.55, 2.6, 0.65]} c={RED} />
          <Box p={[side * 1.95, 2.65, 29.25]} s={[0.7, 0.18, 0.8]} c={GOLD} />
          <Box p={[side * 8.3, 1.4, 27.6]} s={[11.6, 0.65, 0.3]} c={RED} />
        </group>
      ))}
      <Box p={[0, 0.1, 27.4]} s={[3.3, 0.16, 4.2]} c="#a58b5e" />
      <Box p={[0, 2.9, 29.25]} s={[4.5, 0.4, 0.7]} c={RED} />
    </>
  );
}

/** At origin; village placement and door registration belong to the world builder. */
export function StadiumBuilding() {
  return (
    <StaticBatch id="StadiumBuilding">
      <group>
        <Box p={[0, 0.25, 0]} s={[8, 0.5, 7]} c="#81775e" />
        <Box p={[0, 0.55, 0]} s={[7.7, 0.25, 6.7]} c="#c6b395" />
        <Box p={[0, 0.72, -0.15]} s={[3.6, 0.14, 5.6]} c="#447d4b" />
        {[-1.65, 1.65].map((z) => (
          <Box key={z} p={[0, 0.8, z]} s={[3.4, 0.025, 0.8]} c={RED} sharp />
        ))}
        {[-1.2, -0.3, 0.6, 1.5].map((z) => (
          <Box
            key={z}
            p={[0, 0.81, z]}
            s={[3.4, 0.02, 0.035]}
            c="#f4e7c5"
            sharp
          />
        ))}
        {[-1, 1].map((side) => (
          <group key={side}>
            {[0, 1, 2].map((row) => (
              <group key={row}>
                <Box
                  p={[side * (2.15 + row * 0.45), 0.88 + row * 0.34, 0]}
                  s={[0.55, 0.5 + row * 0.2, 5.6]}
                  c="#b1a185"
                />
                <Box
                  p={[side * (2.15 + row * 0.45), 1.18 + row * 0.44, 0]}
                  s={[0.4, 0.22, 5.45]}
                  c={row % 2 ? "#b72e3d" : RED}
                />
              </group>
            ))}
            <Box p={[side * 3.45, 1.55, 0]} s={[0.27, 2, 6.3]} c={RED} />
            <Box p={[side * 3.45, 2.59, 0]} s={[0.38, 0.15, 6.5]} c={GOLD} />
            <Box p={[side * 2.8, 1.05, 3.1]} s={[2, 1, 0.4]} c={RED} />
            <Box p={[side * 1.55, 1.3, 3.15]} s={[0.5, 1.6, 0.7]} c="#c2ac7f" />
          </group>
        ))}
        <Box p={[0, 1.2, -2.8]} s={[4.6, 1.1, 0.8]} c={RED} />
        <Box p={[-3, 2.45, -0.4]} s={[1.5, 0.7, 5.8]} c="#3e5856" />
        <Box p={[-3, 2.9, -0.4]} s={[1.7, 0.25, 6]} c={GOLD} />
        <group position={[0, 0.8, -2.1]}>
          <GoalPosts miniature />
        </group>
        <Box p={[0, 1.85, 3.15]} s={[3.7, 0.5, 0.65]} c={RED} />
        <Sign
          text="49ERS"
          p={[0, 1.86, 3.51]}
          size={[2.8, 0.44]}
          color={RED}
          ink="#f4d997"
        />
        <Box p={[0, 0.3, 3.65]} s={[2.3, 0.3, 1.1]} c="#b6a280" />
      </group>
    </StaticBatch>
  );
}
