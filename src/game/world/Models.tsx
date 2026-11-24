import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { runtime, useGame } from "../core/store";
import { GableRoof, StoneFooting, WindowDetail } from "./ArchitectureDetail";
import { sculptedMaterial } from "./Surface";
import { NationalFlag } from "./NationalFlag";

const rounded = new Map<string, RoundedBoxGeometry>();
function roundedGeometry(size: [number, number, number]) {
  const key = size.join(":");
  if (!rounded.has(key))
    rounded.set(
      key,
      new RoundedBoxGeometry(
        ...size,
        2,
        Math.min(0.16, Math.min(...size) * 0.22),
      ),
    );
  return rounded.get(key)!;
}
const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 12, 8);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const cone = new THREE.ConeGeometry(1, 1, 8);
const mats = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string) {
  if (!mats.has(color)) mats.set(color, sculptedMaterial({ color }));
  return mats.get(color)!;
}
type Props = {
  p?: [number, number, number];
  s?: [number, number, number];
  c?: string;
  r?: [number, number, number];
};
export function Box({
  p = [0, 0, 0],
  s = [1, 1, 1],
  c = "#eee5cc",
  r = [0, 0, 0],
  sharp = false,
}: Props & { sharp?: boolean }) {
  return (
    <mesh
      geometry={sharp ? box : roundedGeometry(s)}
      material={material(c)}
      position={p}
      scale={sharp ? s : undefined}
      rotation={r}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
export function Ball({ p = [0, 0, 0], s = [1, 1, 1], c = "#81956b" }: Props) {
  return (
    <mesh
      geometry={sphere}
      material={material(c)}
      position={p}
      scale={s}
      castShadow
      receiveShadow
    />
  );
}
export function Cylinder({
  p = [0, 0, 0],
  s = [1, 1, 1],
  c = "#8c7057",
  r = [0, 0, 0],
}: Props) {
  return (
    <mesh
      geometry={cyl}
      material={material(c)}
      position={p}
      scale={s}
      rotation={r}
      castShadow
      receiveShadow
    />
  );
}
export function Cone({ p = [0, 0, 0], s = [1, 1, 1], c = "#647958" }: Props) {
  return (
    <mesh
      geometry={cone}
      material={material(c)}
      position={p}
      scale={s}
      castShadow
      receiveShadow
    />
  );
}
export function Ring({
  p = [0, 0, 0],
  radius = 1,
  tube = 0.05,
  c = "#eee5cc",
  r = [-Math.PI / 2, 0, 0],
}: {
  p?: [number, number, number];
  radius?: number;
  tube?: number;
  c?: string;
  r?: [number, number, number];
}) {
  return (
    <mesh position={p} rotation={r} material={material(c)}>
      <torusGeometry args={[radius, tube, 6, 48]} />
    </mesh>
  );
}
export function Sign({
  text,
  p,
  color = "#faf0d7",
  ink = "#414e3b",
  size = [2, 0.5],
}: {
  text: string;
  p: [number, number, number];
  color?: string;
  ink?: string;
  size?: [number, number];
}) {
  const texture = useMemo(() => {
    const el = document.createElement("canvas");
    el.width = 512;
    el.height = 128;
    const ctx = el.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.fillRect(6, 6, 500, 116);
    // Inset lettering sits on a solid, beveled plaque below.
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 3;
    ctx.strokeRect(15, 15, 482, 98);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '700 42px "Trebuchet MS", sans-serif';
    ctx.fillText(text, 256, 67, 458);
    const t = new THREE.CanvasTexture(el);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, color, ink]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={p}>
      <Box s={[size[0] + 0.1, size[1] + 0.1, 0.14]} c="#493d2e" />
      <mesh position={[0, 0, 0.076]}>
        <planeGeometry args={size} />
        <meshStandardMaterial map={texture} roughness={0.75} transparent />
      </mesh>
    </group>
  );
}
export function Character({
  npc = false,
  color = "#6f8670",
  hat = true,
  scale = 1,
}: {
  npc?: boolean;
  color?: string;
  hat?: boolean;
  scale?: number;
}) {
  const legs = useRef<THREE.Group>(null),
    arms = useRef<THREE.Group>(null),
    body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const active = npc || runtime.moving,
      t = clock.elapsedTime * (active ? 9 : 2);
    if (legs.current) {
      legs.current.children[0].rotation.x = active ? Math.sin(t) * 0.65 : 0;
      legs.current.children[1].rotation.x = active ? -Math.sin(t) * 0.65 : 0;
    }
    if (arms.current) {
      arms.current.children[0].rotation.x = active ? -Math.sin(t) * 0.45 : 0.06;
      arms.current.children[1].rotation.x = active ? Math.sin(t) * 0.45 : -0.06;
    }
    if (body.current)
      body.current.position.y = active
        ? Math.abs(Math.sin(t)) * 0.055
        : Math.sin(t) * 0.015;
  });
  return (
    <group scale={scale}>
      <group ref={body}>
        <group ref={legs}>
          <group position={[-0.16, 0.42, 0]}>
            <Box p={[0, -0.18, 0]} s={[0.23, 0.4, 0.24]} c="#384648" />
            <Box p={[0, -0.36, 0.07]} s={[0.25, 0.14, 0.38]} c="#f5e9d3" />
          </group>
          <group position={[0.16, 0.42, 0]}>
            <Box p={[0, -0.18, 0]} s={[0.23, 0.4, 0.24]} c="#384648" />
            <Box p={[0, -0.36, 0.07]} s={[0.25, 0.14, 0.38]} c="#f5e9d3" />
          </group>
        </group>
        <Box p={[0, 0.77, 0]} s={[0.65, 0.67, 0.4]} c={color} />
        <Box p={[0, 0.91, 0.213]} s={[0.16, 0.1, 0.02]} c="#e7d3a7" />
        <group ref={arms}>
          <group position={[-0.4, 0.98, 0]}>
            <Box p={[0, -0.15, 0]} s={[0.2, 0.4, 0.25]} c={color} />
            <Ball p={[0, -0.38, 0]} s={[0.115, 0.13, 0.115]} c="#efc5a0" />
          </group>
          <group position={[0.4, 0.98, 0]}>
            <Box p={[0, -0.15, 0]} s={[0.2, 0.4, 0.25]} c={color} />
            <Ball p={[0, -0.38, 0]} s={[0.115, 0.13, 0.115]} c="#efc5a0" />
          </group>
        </group>
        <Box p={[0, 1.47, 0.025]} s={[0.78, 0.68, 0.67]} c="#efc5a0" />
        <Box p={[0, 1.8, 0]} s={[0.82, 0.24, 0.7]} c="#3e3936" />
        <Box p={[-0.34, 1.58, -0.07]} s={[0.16, 0.36, 0.62]} c="#3e3936" />
        <Box p={[0.34, 1.58, -0.07]} s={[0.16, 0.36, 0.62]} c="#3e3936" />
        <Ball p={[-0.16, 1.47, 0.366]} s={[0.043, 0.065, 0.025]} c="#383330" />
        <Ball p={[0.16, 1.47, 0.366]} s={[0.043, 0.065, 0.025]} c="#383330" />
        <Box p={[0, 1.29, 0.37]} s={[0.13, 0.025, 0.02]} c="#a47362" />
        {hat && (
          <>
            <Box p={[0, 1.93, 0]} s={[0.9, 0.2, 0.78]} c="#d88960" />
            <Box p={[0, 1.86, 0.4]} s={[0.87, 0.065, 0.48]} c="#d88960" />
            <Box p={[0, 2.03, 0]} s={[0.6, 0.07, 0.6]} c="#e4a275" />
          </>
        )}
      </group>
    </group>
  );
}
export function Tree({
  p,
  size = 1,
  variant = 0,
}: {
  p: [number, number, number];
  size?: number;
  variant?: number;
}) {
  return (
    <group position={p} scale={size}>
      <Cylinder p={[0, 1.2, 0]} s={[0.18, 2.4, 0.18]} c="#866b50" />
      {variant % 3 === 0 ? (
        <>
          <Cone p={[0, 2.1, 0]} s={[1.1, 2.2, 1.1]} />
          <Cone p={[0, 3, 0]} s={[0.85, 1.9, 0.85]} c="#718967" />
          <Cone p={[0, 3.8, 0]} s={[0.55, 1.5, 0.55]} c="#849773" />
        </>
      ) : (
        <>
          <Ball
            p={[-0.55, 2.8, 0]}
            s={[1.1, 1.2, 1]}
            c={variant % 2 ? "#a4ad77" : "#6d8b64"}
          />
          <Ball
            p={[0.6, 3.05, 0]}
            s={[0.95, 1.25, 1.04]}
            c={variant % 2 ? "#c3bb7f" : "#849d70"}
          />
          <Ball
            p={[0, 3.8, 0.1]}
            s={[1.05, 1.1, 1.05]}
            c={variant % 2 ? "#a6ad76" : "#93a776"}
          />
        </>
      )}
    </group>
  );
}
export function Flowers({
  p,
  color = "#d59470",
}: {
  p: [number, number, number];
  color?: string;
}) {
  return (
    <group position={p}>
      <Cylinder p={[0, 0.23, 0]} s={[0.35, 0.46, 0.35]} c="#be8666" />
      {[0, 1, 2].map((i) => (
        <group
          key={i}
          position={[Math.sin(i * 4) * 0.2, 0, Math.cos(i * 4) * 0.2]}
        >
          <Cylinder p={[0, 0.55, 0]} s={[0.025, 0.6, 0.025]} c="#6b8053" />
          <Ball p={[0, 0.87, 0]} s={[0.16, 0.1, 0.16]} c={color} />
          <Ball p={[0, 0.94, 0]} s={[0.06, 0.05, 0.06]} c="#e6c06d" />
        </group>
      ))}
    </group>
  );
}
export function Window({
  p,
  width = 0.8,
}: {
  p: [number, number, number];
  width?: number;
}) {
  return (
    <group position={p}>
      <WindowDetail width={width} />
    </group>
  );
}
export function Lamp({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <Cylinder p={[0, 1.15, 0]} s={[0.075, 2.3, 0.075]} c="#4d5d51" />
      <Box p={[0, 2.5, 0]} s={[0.4, 0.55, 0.4]} c="#efd296" />
      <Cone p={[0, 2.87, 0]} s={[0.37, 0.25, 0.37]} c="#536456" />
      <Cylinder p={[0, 0.05, 0]} s={[0.25, 0.1, 0.25]} c="#697360" />
    </group>
  );
}
export function Bench({
  p,
  rotation = 0,
}: {
  p: [number, number, number];
  rotation?: number;
}) {
  return (
    <group position={p} rotation={[0, rotation, 0]}>
      {[-0.6, 0.6].map((x) => (
        <Box key={x} p={[x, 0.32, 0]} s={[0.13, 0.65, 0.5]} c="#576454" />
      ))}
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          p={[0, 0.65, i * 0.2 - 0.2]}
          s={[1.7, 0.12, 0.16]}
          c="#b58b5e"
        />
      ))}
      <Box p={[0, 1.08, -0.34]} s={[1.7, 0.45, 0.12]} c="#bd976d" />
    </group>
  );
}
export function House({
  p,
  kind = "boathouse",
  level = 1,
}: {
  p: [number, number, number];
  kind?: "boathouse" | "study";
  level?: number;
}) {
  const study = kind === "study";
  const roof = study ? "#466c65" : "#bd512f";
  return (
    <group position={p}>
      {/* Chunky masonry and timber corner braces. */}
      {[-2.8, 2.8].flatMap((x) =>
        [-1.9, 1.9].map((z) => (
          <group key={`${x}:${z}`}>
            <Box p={[x, 0.42, z]} s={[0.7, 0.8, 0.65]} c="#9f9a83" />
            <Box p={[x, 1.9, z]} s={[0.32, 3.2, 0.3]} c="#755335" />
            <Box p={[x, 3.35, z]} s={[0.55, 0.35, 0.5]} c="#e5b971" />
          </group>
        )),
      )}
      {[-2, -1, 0, 1, 2].map((x, i) => (
        <Box
          key={x}
          p={[x * 1.15, 0.32, 2.14]}
          s={[1.08, 0.48, 0.25]}
          c={i % 2 ? "#b7b19b" : "#a8a58f"}
        />
      ))}
      <Box p={[0, 3.44, 2.2]} s={[6.3, 0.32, 0.32]} c="#775438" />
      <NationalFlag nation={study ? "kr" : "us"} p={[2.5, 4.5, 0.5]} />
      {study && (
        <group position={[-1.4, 5.1, -0.65]}>
          <Box p={[0, 0.65, 0]} s={[1.8, 2, 1.8]} c="#c5b79b" />
          <Box p={[0, 0.7, 0.94]} s={[0.62, 0.95, 0.08]} c="#48645b" />
          <Box p={[0, 1.7, 0]} s={[2.15, 0.35, 2.15]} c="#7a7057" />
          {[-0.8, 0, 0.8].flatMap((x) =>
            [-0.8, 0.8].map((z) => (
              <Box
                key={`${x}${z}`}
                p={[x, 2.05, z]}
                s={[0.48, 0.65, 0.5]}
                c="#d3c1a0"
              />
            )),
          )}
        </group>
      )}
      <Box p={[0, 0.15, 0]} s={[6.4, 0.4, 4.6]} c="#b8af98" />
      <Box
        p={[0, 1.85, 0]}
        s={[5.8, 3.4, 4.1]}
        c={study ? "#e1c5a1" : "#eddec0"}
      />
      {[-2.83, 0, 2.83].map((x) => (
        <Box key={x} p={[x, 1.8, 2.08]} s={[0.18, 3.4, 0.16]} c="#a28b69" />
      ))}
      <Box p={[0, 1.1, 2.12]} s={[1.22, 2.1, 0.2]} c="#61594b" />
      <Box p={[0, 1.03, 2.24]} s={[0.95, 1.9, 0.12]} c="#8d7655" />
      {[-0.27, 0, 0.27].map((x) => (
        <Box key={x} p={[x, 1.1, 2.32]} s={[0.025, 1.7, 0.02]} c="#bda17a" />
      ))}
      <Ball p={[0.3, 1, 2.35]} s={[0.055, 0.055, 0.06]} c="#edd38b" />
      <Window p={[-1.75, 1.85, 2.1]} />
      <Window p={[1.75, 1.85, 2.1]} />
      <Box p={[0, 0.42, 2.58]} s={[1.8, 0.2, 1]} c="#d7c8aa" />
      <Box p={[0, 0.19, 3]} s={[2.1, 0.18, 0.7]} c="#c6b99e" />
      <Box p={[0, 3.55, 0]} s={[6.6, 0.38, 4.85]} c="#795a3c" />
      <StoneFooting width={6} depth={4.2} />
      <GableRoof width={6.6} depth={4.95} y={3.7} rise={1.55} color={roof} />
      <Box p={[1.8, 4.9, -0.9]} s={[0.63, 1.8, 0.65]} c="#b99b7a" />
      <Box p={[1.8, 5.85, -0.9]} s={[0.84, 0.15, 0.85]} c="#cdbc9d" />
      <Sign
        text={study ? "THE STUDY" : "BOATHOUSE"}
        p={[0, 3.05, 2.18]}
        size={[2.3, 0.45]}
      />
      <Flowers p={[-2.7, 0.4, 2.4]} />
      <Flowers p={[2.7, 0.4, 2.4]} color="#e7c05f" />
      {!study && (
        <>
          <group position={[-3.08, 1.5, 0]} rotation={[0, 0, 0.1]}>
            <Box p={[0, 0, 0]} s={[0.12, 2.7, 0.14]} c="#b38d62" />
            <Box p={[0, -0.85, 0.1]} s={[0.13, 0.7, 0.4]} c="#6b8c86" />
          </group>
          <Box p={[3, 0.5, 1]} s={[0.7, 0.5, 1.7]} c="#ad8762" />
        </>
      )}
      {level > 1 && (
        <group>
          <Box p={[0, 2.8, 2.95]} s={[5, 0.18, 1.6]} c="#a78662" />
          {[-2.4, 0, 2.4].map((x) => (
            <Box key={x} p={[x, 1.4, 3.6]} s={[0.14, 2.8, 0.14]} c="#ad9070" />
          ))}
          <Box p={[0, 3.4, 3.63]} s={[5, 0.1, 0.1]} c="#e2c49d" />
          {Array.from({ length: 13 }, (_, i) => (
            <Box
              key={i}
              p={[i * 0.4 - 2.4, 3.1, 3.63]}
              s={[0.07, 0.6, 0.07]}
              c="#dfbd91"
            />
          ))}
        </group>
      )}
      {level > 2 && (
        <group position={[-3.8, 0, -0.5]}>
          <Box p={[0, 1.4, 0]} s={[1.5, 2.8, 2.8]} c="#d6c6a5" />
          <Cone p={[0, 3.3, 0]} s={[1.5, 1.5, 1.9]} c={roof} />
          <Window p={[0, 1.8, 1.45]} width={0.7} />
        </group>
      )}
    </group>
  );
}
export function Boat({
  color = "#f1e4b7",
  pace = 30,
  race = false,
}: {
  color?: string;
  pace?: number;
  race?: boolean;
}) {
  const oars = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (oars.current)
      oars.current.children.forEach((oar, i) => {
        oar.rotation.y =
          Math.sin((clock.elapsedTime * pace) / 10 + Math.floor(i / 2) * 0.05) *
          0.55 *
          (i % 2 ? -1 : 1);
        oar.rotation.z = Math.cos((clock.elapsedTime * pace) / 10) * 0.09;
      });
  });
  return (
    <group>
      <Ball p={[0, 0.1, 0]} s={[0.4, 0.19, race ? 3.6 : 2.8]} c={color} />
      <Box p={[0, 0.25, 0]} s={[0.46, 0.11, 4.3]} c="#9e7957" />
      {[-1.4, -0.5, 0.4, 1.3].map((z, i) => (
        <group key={i} position={[0, 0.28, z]}>
          <Box p={[0, 0.12, 0]} s={[0.27, 0.27, 0.26]} c={color} />
          <Ball p={[0, 0.45, 0]} s={[0.18, 0.2, 0.18]} c="#efc5a0" />
          <Ball p={[0, 0.57, -0.025]} s={[0.19, 0.12, 0.18]} c="#4d423a" />
        </group>
      ))}
      <group ref={oars}>
        {[-1.4, -0.5, 0.4, 1.3].flatMap((z, i) =>
          [-1, 1].map((side, j) => (
            <group key={i * 2 + j} position={[side * 0.3, 0.3, z]}>
              <Box p={[side * 0.9, 0, 0]} s={[2, 0.055, 0.055]} c="#b49773" />
              <Box
                p={[side * 1.95, -0.025, 0]}
                s={[0.55, 0.08, 0.28]}
                c={i % 2 ? "#c1745c" : "#eee3c5"}
              />
            </group>
          )),
        )}
      </group>
    </group>
  );
}
export function Npc({
  origin,
  color,
}: {
  origin: [number, number, number];
  color: string;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current && !useGame.getState().paused) {
      const t = clock.elapsedTime * 0.3 + origin[0];
      ref.current.position.set(
        origin[0] + Math.sin(t) * 1.8,
        origin[1],
        origin[2] + Math.cos(t) * 0.7,
      );
      ref.current.rotation.y = Math.atan2(
        Math.cos(t) * 1.8,
        -Math.sin(t) * 0.7,
      );
    }
  });
  return (
    <group ref={ref}>
      <Character npc color={color} scale={0.67} hat={false} />
    </group>
  );
}
