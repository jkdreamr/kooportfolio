import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Ball, Cylinder } from "../world/Models";

type Triple = [number, number, number];
const geometry = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.MeshStandardMaterial>();

// World-space bevels keep long beams and thin planks from looking like cards.
export function CourtBlock({
  p = [0, 0, 0],
  s = [1, 1, 1],
  c = "#eee5cc",
  r = [0, 0, 0],
  sharp = false,
}: {
  p?: Triple;
  s?: Triple;
  c?: string;
  r?: Triple;
  sharp?: boolean;
}) {
  const key = `${s.join()}/${sharp}`;
  if (!geometry.has(key))
    geometry.set(
      key,
      sharp
        ? new THREE.BoxGeometry(...s)
        : new RoundedBoxGeometry(
            ...s,
            3,
            Math.min(0.12, ...s.map((v) => v * 0.22)),
          ),
    );
  if (!materials.has(c))
    materials.set(
      c,
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }),
    );
  return (
    <mesh
      position={p}
      rotation={r}
      geometry={geometry.get(key)}
      material={materials.get(c)}
      castShadow
      receiveShadow
    />
  );
}

const grain = new Uint8Array(128 * 128 * 4);
for (let i = 0; i < 128 * 128; i++) {
  const n = ((Math.imul(i + 41, 374761393) ^ (i >>> 3)) >>> 0) % 25;
  grain.set([230 + n, 230 + n, 230 + n, 255], i * 4);
}
const texture = new THREE.DataTexture(grain, 128, 128);
texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
texture.repeat.set(10, 12);
texture.needsUpdate = true;
const paint = new THREE.MeshStandardMaterial({
  color: "#b9643d",
  map: texture,
  bumpMap: texture,
  bumpScale: 0.025,
  roughness: 0.86,
});
const ballMaterial = new THREE.MeshStandardMaterial({
  color: "#df7a27",
  bumpMap: texture,
  bumpScale: 0.008,
  roughness: 0.74,
});
const ballGeometry = new THREE.SphereGeometry(0.23, 24, 16);

export function CourtBall() {
  return (
    <mesh
      geometry={ballGeometry}
      material={ballMaterial}
      castShadow
      receiveShadow
    />
  );
}

export function CourtDeck() {
  return (
    <group>
      <CourtBlock p={[0, -0.48, 0]} s={[17.7, 0.9, 21.5]} c="#756451" />
      <CourtBlock p={[0, -0.1, 0]} s={[17.45, 0.4, 21.25]} c="#c6b18a" />
      <CourtBlock p={[0, 0.005, 0]} s={[14.25, 0.23, 17.25]} c="#823f2c" />
      <mesh
        position={[0, 0.115, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={paint}
        receiveShadow
      >
        <planeGeometry args={[14, 17]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          {Array.from({ length: 12 }, (_, i) => (
            <CourtBlock
              key={i}
              p={[-8.03 + i * 1.46, -0.3, side * 10.64]}
              s={[1.4, 0.42, 0.3]}
              c={i % 3 === 0 ? "#9d896d" : "#ad9878"}
            />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <CourtBlock
              key={i}
              p={[side * 8.73, -0.3, -9.8 + i * 1.5]}
              s={[0.3, 0.42, 1.44]}
              c={i % 3 === 0 ? "#9d896d" : "#ad9878"}
            />
          ))}
          {[-7, -3, 1, 5, 9].map((z) => (
            <group key={z} position={[side * 7.3, 0, z]}>
              <CourtBlock p={[0, 0.3, 0]} s={[0.4, 0.5, 0.4]} c="#8e977f" />
              <CourtBlock p={[0, 2.1, 0]} s={[0.24, 0.18, 0.24]} c="#c3924c" />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function Bleachers({ side }: { side: number }) {
  return (
    <group
      position={[side * 9.4, 0, 0]}
      rotation={[0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
    >
      <CourtBlock p={[0, -0.16, -0.1]} s={[7.8, 0.45, 2.8]} c="#8a8068" />
      {[0, 1].map((row) => (
        <group key={row} position={[0, row * 0.48, -row * 0.8]}>
          {[-2.9, 0, 2.9].map((x) => (
            <CourtBlock
              key={x}
              p={[x, 0.35, 0]}
              s={[0.25, 0.7, 0.85]}
              c="#34554b"
            />
          ))}
          {[0, 1, 2].map((slat) => (
            <CourtBlock
              key={slat}
              p={[0, 0.69, slat * 0.22 - 0.22]}
              s={[7.3, 0.17, 0.19]}
              c={slat === 1 ? "#ad703e" : "#c1894f"}
            />
          ))}
          <CourtBlock p={[0, 1.06, -0.44]} s={[7.3, 0.42, 0.17]} c="#b67b45" />
          {[-3.2, 3.2].map((x) => (
            <CourtBlock
              key={x}
              p={[x, 1.06, -0.34]}
              s={[0.045, 0.27, 0.06]}
              c="#d5b57c"
            />
          ))}
        </group>
      ))}
    </group>
  );
}

export function CourtSidelines() {
  return (
    <group>
      <Bleachers side={-1} />
      <Bleachers side={1} />
      {[-1.35, 1.35].map((x) => (
        <group key={x}>
          <CourtBlock p={[x, 3.02, -8.6]} s={[0.2, 5.8, 0.22]} c="#365a4d" />
          <CourtBlock p={[x, 0.35, -8.6]} s={[0.5, 0.5, 0.55]} c="#8e977f" />
          <CourtBlock p={[x, 5.98, -8.6]} s={[0.28, 0.18, 0.3]} c="#b78043" />
        </group>
      ))}
      <CourtBlock p={[0, 5.9, -8.62]} s={[3.85, 0.95, 0.3]} c="#304e43" />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 7.95, 0, 7.7]}>
          <Cylinder p={[0, 0.49, 0]} s={[0.32, 0.72, 0.32]} c="#4b6c5c" />
          <Cylinder p={[0, 0.88, 0]} s={[0.38, 0.12, 0.38]} c="#d1b67e" />
          <Ball p={[0, 0.99, 0]} s={[0.18, 0.18, 0.18]} c="#c77734" />
        </group>
      ))}
    </group>
  );
}

export function HoopHardware() {
  return (
    <group>
      <CourtBlock p={[0, 0.53, -6.6]} s={[1.85, 0.82, 1.65]} c="#244f48" />
      <CourtBlock p={[0, 0.96, -6.6]} s={[1.64, 0.15, 1.45]} c="#3a6a5b" />
      <CourtBlock p={[0, 1.78, -6.4]} s={[0.42, 1.4, 0.42]} c="#2b5a50" />
      {[-0.57, 0.57].map((x) => (
        <group key={x}>
          <Cylinder p={[x, 1.05, -6.8]} s={[0.07, 0.08, 0.07]} c="#c5a36b" />
          <CourtBlock
            p={[x, 0.57, -5.76]}
            s={[0.05, 0.49, 0.025]}
            c="#78947d"
          />
        </group>
      ))}
      {[-1.18, 1.18].map((x) => (
        <CourtBlock
          key={x}
          p={[x, 4.15, -5.704]}
          s={[0.1, 1.48, 0.025]}
          c="#456c60"
        />
      ))}
      {[3.43, 4.87].map((y) => (
        <CourtBlock
          key={y}
          p={[0, y, -5.704]}
          s={[2.45, 0.1, 0.025]}
          c="#456c60"
        />
      ))}
    </group>
  );
}
