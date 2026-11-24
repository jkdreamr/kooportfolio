import { useLayoutEffect, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Box, Cylinder, Sign } from "../world/Models";
import { FIELD_GOAL } from "../core/fieldGoal";

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
      <Box p={[0, 0.03, -0.5]} s={[10.2, 0.24, 19.8]} c="#254c36" />
      <mesh
        position={[0, 0.158, -0.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[10, 19.6]} />
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
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 22; i++) {
          if (i === 7 || i === 15) continue; // Concrete stair aisles.
          result.push({
            x: side * (6.05 + row * 0.76),
            y: 0.8 + row * 0.57,
            z: -8.8 + i * 0.78,
            rotation: (side * -Math.PI) / 2,
          });
        }
      }
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 15; i++) {
        if (i === 7) continue;
        result.push({
          x: (i - 7) * 0.72,
          y: 0.8 + row * 0.57,
          z: -10.75 - row * 0.7,
          rotation: 0,
        });
      }
    for (let row = 0; row < 2; row++)
      for (const side of [-1, 1])
        for (let i = 0; i < 5; i++) {
          result.push({
            x: side * (2.65 + i * 0.72),
            y: 0.7 + row * 0.5,
            z: 10.2 + row * 0.7,
            rotation: Math.PI,
          });
        }
    return result;
  }, []);
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0, 1, 2].map((row) => (
            <Box
              key={row}
              p={[side * (6.05 + row * 0.76), (0.64 + row * 0.57) / 2, -0.6]}
              s={[0.83, 0.64 + row * 0.57, 17.8]}
              c={row % 2 ? "#aa9c83" : STONE}
            />
          ))}
          <Box p={[side * 8.05, 1.2, -0.6]} s={[0.32, 2.4, 18.5]} c={RED} />
          <Box p={[side * 8.05, 2.43, -0.6]} s={[0.4, 0.16, 18.6]} c={GOLD} />
          {[-3.34, 2.9].map((z) => (
            <group key={z}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Box
                  key={i}
                  p={[side * (5.65 + i * 0.37), 0.3 + i * 0.28, z]}
                  s={[0.4, 0.16, 0.62]}
                  c="#d1c4aa"
                />
              ))}
            </group>
          ))}
          <Box p={[side * 5.5, 0.42, -0.5]} s={[0.2, 0.7, 17.5]} c="#d4bf91" />
          <Box p={[side * 5.48, 0.8, -0.5]} s={[0.28, 0.11, 17.6]} c={RED} />
        </group>
      ))}
      {[0, 1, 2].map((row) => (
        <Box
          key={row}
          p={[0, (0.64 + row * 0.57) / 2, -10.75 - row * 0.7]}
          s={[11.3, 0.64 + row * 0.57, 0.8]}
          c={STONE}
        />
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0, 1].map((row) => (
            <Box
              key={row}
              p={[side * 4.1, 0.25 + row * 0.25, 10.2 + row * 0.7]}
              s={[4, 0.5 + row * 0.5, 0.8]}
              c={STONE}
            />
          ))}
        </group>
      ))}
      <Seats seats={seats} />
    </>
  );
}

export function GoalPosts({ miniature = false }: { miniature?: boolean }) {
  const width = FIELD_GOAL.halfWidth;
  return (
    <group scale={miniature ? 0.35 : 1}>
      <Cylinder p={[0, 1.45, 0]} s={[0.095, 2.9, 0.095]} c="#edc342" />
      <Box p={[0, 0.55, 0]} s={[0.43, 1.1, 0.43]} c={RED} />
      <Cylinder
        p={[0, 2.9, 0]}
        s={[0.085, width * 2, 0.085]}
        r={[0, 0, Math.PI / 2]}
        c="#f8d45c"
      />
      {[-width, width].map((x) => (
        <Cylinder
          key={x}
          p={[x, 4.45, 0]}
          s={[0.075, 3.1, 0.075]}
          c="#f8d45c"
        />
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
  score = 0,
  attempt = 0,
}: {
  score?: number;
  attempt?: number;
}) {
  return (
    <>
      <Box p={[0, -0.55, 0]} s={[22, 1.1, 26]} c="#665f50" />
      <Box p={[0, -0.12, 0]} s={[21.8, 0.35, 25.8]} c="#c0b091" />
      <Field />
      <SeatingBowl />
      {/* The asymmetric suite tower is the silhouette cue from Levi's Stadium. */}
      <Box p={[-9.3, 2.15, -1]} s={[2.1, 4.3, 18.6]} c="#9f967e" />
      {[1.4, 2.7, 4].map((y) => (
        <group key={y}>
          <Box p={[-8.2, y, -1]} s={[0.14, 0.72, 17.6]} c="#3c5758" />
          <Box p={[-8.08, y - 0.43, -1]} s={[0.35, 0.18, 18.8]} c="#e0ceb0" />
          {[-8, -5, -2, 1, 4, 7].map((z) => (
            <Box key={z} p={[-8.06, y, z]} s={[0.18, 0.85, 0.13]} c={GOLD} />
          ))}
        </group>
      ))}
      <Box p={[-9.15, 4.43, -1]} s={[2.55, 0.34, 19.2]} c={RED} />
      <Box p={[-9.15, 4.64, -1]} s={[2.7, 0.15, 19.4]} c={GOLD} />
      <group position={[0, 0, FIELD_GOAL.goalZ]}>
        <GoalPosts />
      </group>
      <Box p={[0, 3.9, -12.35]} s={[6.2, 2.4, 0.62]} c="#393d35" />
      <Box p={[0, 5.15, -12.35]} s={[6.4, 0.2, 0.7]} c={GOLD} />
      <Sign
        text="49ERS"
        p={[0, 4.35, -11.99]}
        size={[5.45, 0.85]}
        color={RED}
        ink="#f7e4b3"
      />
      <Sign
        text={`${score * 3}   •   ${attempt} / 5`}
        p={[0, 3.35, -11.99]}
        size={[4.6, 0.65]}
        color="#243d32"
        ink="#f7d178"
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Floodlight p={[side * 9, 0, -10.8]} />
          <Floodlight p={[side * 9, 0, 9.3]} />
          <Box p={[side * 1.95, 1.3, 12.25]} s={[0.55, 2.6, 0.65]} c={RED} />
          <Box p={[side * 1.95, 2.65, 12.25]} s={[0.7, 0.18, 0.8]} c={GOLD} />
          <Box p={[side * 4.1, 1.4, 11.7]} s={[3.7, 0.65, 0.3]} c={RED} />
        </group>
      ))}
      <Box p={[0, 0.1, 11.1]} s={[3.3, 0.16, 3.6]} c="#a58b5e" />
      <Box p={[0, 2.9, 12.25]} s={[4.5, 0.4, 0.7]} c={RED} />
      <Sign
        text="← VILLAGE"
        p={[0, 2.9, 12.65]}
        size={[3.4, 0.45]}
        color={RED}
        ink="#f4d997"
      />
    </>
  );
}

/** At origin; village placement and door registration belong to the world builder. */
export function StadiumBuilding() {
  return (
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
  );
}
