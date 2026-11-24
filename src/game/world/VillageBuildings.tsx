import * as THREE from "three";
import { Box, Cylinder, Ball, Flowers, Sign, Window } from "./Models";
import { RoofShingles, StoneFooting } from "./ArchitectureDetail";
import { NationalFlag } from "./NationalFlag";

const roofGeometry = new THREE.BufferGeometry();
const a = [-0.5, 0, -0.5],
  b = [0.5, 0, -0.5],
  c = [0.5, 0, 0.5],
  d = [-0.5, 0, 0.5],
  e = [0, 1, -0.28],
  f = [0, 1, 0.28];
roofGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(
    [
      ...a,
      ...e,
      ...b,
      ...b,
      ...e,
      ...f,
      ...b,
      ...f,
      ...c,
      ...c,
      ...f,
      ...d,
      ...d,
      ...f,
      ...e,
      ...d,
      ...e,
      ...a,
    ],
    3,
  ),
);
roofGeometry.computeVertexNormals();

export function HipRoof({
  width,
  depth,
  y,
  rise,
  color,
}: {
  width: number;
  depth: number;
  y: number;
  rise: number;
  color: string;
}) {
  return (
    <>
      <Box p={[0, y - 0.1, 0]} s={[width, 0.25, depth]} c="#513e30" />
      <mesh
        geometry={roofGeometry}
        position={[0, y, 0]}
        scale={[width, rise, depth]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={color}
          roughness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
      <RoofShingles {...{ width, depth, y, rise, color }} />
    </>
  );
}

function Steps({ width = 2, z = 3 }: { width?: number; z?: number }) {
  return (
    <>
      <Box p={[0, 0.16, z + 0.35]} s={[width + 0.4, 0.25, 1]} c="#b5a68b" />
      <Box p={[0, 0.35, z]} s={[width, 0.25, 0.8]} c="#e1ccaa" />
    </>
  );
}
function Door({ z = 2.7, color = "#5f462f" }: { z?: number; color?: string }) {
  return (
    <>
      <Box p={[0, 1.5, z]} s={[1.45, 2.35, 0.2]} c="#453a30" />
      <Box p={[0, 1.47, z + 0.12]} s={[1.15, 2.08, 0.12]} c={color} />
      <Ball p={[0.38, 1.4, z + 0.22]} s={[0.075, 0.075, 0.06]} c="#f4c55b" />
    </>
  );
}

export function KappaShell() {
  return (
    <group>
      <NationalFlag nation="us" p={[2.6, 5.5, -0.6]} height={2.6} />
      <StoneFooting width={6.9} depth={4.8} />
      <Box p={[0, 0.3, 0]} s={[7.5, 0.6, 5.5]} c="#8c6650" />
      <Box p={[0, 2.8, 0]} s={[6.7, 5, 4.6]} c="#f0dbb4" />
      <Box p={[0, 2.85, 2.36]} s={[6.9, 0.3, 0.3]} c="#b69369" />
      <HipRoof width={7.6} depth={5.7} y={5.4} rise={1.8} color="#b63232" />
      {[-2.35, 0, 2.35].map((x) => (
        <Window key={x} p={[x, 4.08, 2.34]} width={1} />
      ))}
      {[-2.45, 2.45].map((x) => (
        <Window key={x} p={[x, 1.75, 2.34]} width={1} />
      ))}
      <Door z={2.42} color="#355d45" />
      {[-1.65, 1.65].map((x) => (
        <group key={x}>
          <Box p={[x, 0.6, 2.9]} s={[0.65, 0.3, 0.7]} c="#f4e3bf" />
          <Cylinder p={[x, 2.15, 2.9]} s={[0.19, 3.2, 0.19]} c="#f3e5ca" />
          <Box p={[x, 3.68, 2.9]} s={[0.65, 0.3, 0.7]} c="#f4e3bf" />
        </group>
      ))}
      <Box p={[0, 3.85, 2.85]} s={[4.3, 0.3, 1.4]} c="#d0b58b" />
      <group position={[0, 4.04, 2.7]}>
        <HipRoof width={4.7} depth={1.8} y={0} rise={0.9} color="#9e2c30" />
      </group>
      <Sign
        text="ΚΣ"
        p={[0, 5.72, 2.57]}
        size={[1.2, 0.9]}
        color="#355d45"
        ink="#f7e9bc"
      />
      <Steps z={3.1} width={3.2} />
      <Box p={[-2.5, 6, -0.8]} s={[0.72, 2.9, 0.8]} c="#905844" />
      <Box p={[-2.5, 7.5, -0.8]} s={[0.95, 0.22, 1]} c="#e3c7a4" />
      {[-3.1, 3.1].map((x) => (
        <Flowers key={x} p={[x, 0.4, 2.7]} color="#c7473f" />
      ))}
    </group>
  );
}

export function CognitionShell() {
  return (
    <group>
      <NationalFlag nation="kr" p={[0.8, 5.7, -1.6]} height={2.6} />
      <StoneFooting width={6.8} depth={5.2} />
      <Box p={[0, 0.25, 0]} s={[7.1, 0.5, 5.5]} c="#8a8f88" />
      <Box p={[-0.85, 2.8, -0.25]} s={[4.6, 5, 4.6]} c="#3c554d" />
      <Box p={[2.1, 1.85, 0.35]} s={[2.3, 3.2, 4.7]} c="#d4c9ad" />
      <Box p={[-0.85, 5.45, -0.25]} s={[5, 0.5, 5]} c="#2c3937" />
      <Box p={[2.1, 3.62, 0.35]} s={[2.6, 0.35, 5]} c="#47726b" />
      {[-2.2, -0.9, 0.4].map((x) => (
        <group key={x}>
          <Box p={[x, 3.95, 2.12]} s={[1.1, 1.8, 0.14]} c="#88c2b7" />
          <Box p={[x, 3.95, 2.23]} s={[0.05, 1.8, 0.05]} c="#d4dfcc" />
        </group>
      ))}
      <Box p={[-1.25, 1.64, 2.12]} s={[3.1, 1.75, 0.15]} c="#b1c7b0" />
      <Door z={2.75} color="#344b47" />
      <Box p={[0, 3.04, 2.9]} s={[2.5, 0.18, 1.2]} c="#c4ab73" />
      <Sign
        text="cognition"
        p={[-0.85, 5.1, 2.29]}
        size={[3.3, 0.52]}
        color="#2c3937"
        ink="#f1e0b9"
      />
      <Steps z={3.1} />
      <Box
        p={[-1.25, 5.92, -0.7]}
        s={[2.7, 0.12, 2.1]}
        r={[-0.2, 0, 0]}
        c="#254b5c"
      />
      {[-2.1, -1.25, -0.4].map((x) => (
        <Box
          key={x}
          p={[x, 5.99, -0.7]}
          s={[0.04, 0.07, 2.05]}
          r={[-0.2, 0, 0]}
          c="#7caaab"
        />
      ))}
      <Cylinder p={[2.3, 4.2, -0.6]} s={[0.6, 1, 0.6]} c="#82988c" />
      <Cylinder p={[2.3, 4.75, -0.6]} s={[0.72, 0.16, 0.72]} c="#c0c6b4" />
      <Box p={[-3.2, 3.2, -0.9]} s={[0.25, 4, 0.25]} c="#b3a678" />
      <Cylinder p={[-3.2, 5.4, -0.9]} s={[0.4, 0.45, 0.4]} c="#a9bf9b" />
      <Flowers p={[2.9, 0.3, 2.7]} color="#eac05c" />
    </group>
  );
}

export function KitchenShell() {
  return (
    <group>
      <StoneFooting width={4.65} depth={3.85} />
      <Box p={[0, 0.22, 0]} s={[4.9, 0.45, 4.2]} c="#9e7652" />
      <Box p={[0, 1.65, 0]} s={[4.5, 2.8, 3.7]} c="#dfad72" />
      <HipRoof width={5.2} depth={4.5} y={3.15} rise={1.6} color="#d16b2e" />
      <Door z={1.96} color="#6b7944" />
      <Window p={[-1.5, 1.8, 1.9]} width={0.8} />
      <Window p={[1.5, 1.8, 1.9]} width={0.8} />
      <Box
        p={[0, 2.9, 2.4]}
        s={[4.8, 0.13, 1.1]}
        r={[-0.18, 0, 0]}
        c="#497f5c"
      />
      {[-2, -1, 0, 1, 2].map((x) => (
        <Box key={x} p={[x, 2.8, 2.94]} s={[0.48, 0.26, 0.12]} c="#e8d5a6" />
      ))}
      <Cylinder p={[1.2, 4.3, -0.7]} s={[0.45, 2, 0.45]} c="#a96747" />
      <Cylinder p={[1.2, 5.35, -0.7]} s={[0.64, 0.2, 0.64]} c="#624c3b" />
      <Steps z={2.2} />
      <Flowers p={[-2.3, 0.25, 2.1]} color="#e7c054" />
      <Box p={[2.3, 0.6, 1.6]} s={[0.7, 0.8, 1.1]} c="#8f693f" />
      {[0, 1, 2].map((i) => (
        <Ball
          key={i}
          p={[2.25 + (i % 2) * 0.22, 1.1, 1.3 + i * 0.22]}
          s={[0.18, 0.18, 0.18]}
          c={i % 2 ? "#db9a36" : "#c75638"}
        />
      ))}
    </group>
  );
}

export function GymShell() {
  return (
    <group>
      <StoneFooting width={5.65} depth={4.9} />
      {[-2.65, 2.65].map((z) => (
        <mesh key={z} position={[0, 2.7, z]} castShadow>
          <torusGeometry args={[2.9, 0.17, 6, 24, Math.PI]} />
          <meshStandardMaterial
            color="#31535a"
            roughness={0.55}
            metalness={0.25}
          />
        </mesh>
      ))}
      <Box p={[0, 0.2, 0]} s={[5.8, 0.4, 5.1]} c="#8c9181" />
      <Box p={[0, 1.45, 0]} s={[5.5, 2.6, 4.8]} c="#acae94" />
      <mesh
        position={[0, 2.7, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry
          args={[2.9, 2.9, 5.2, 12, 1, false, Math.PI / 2, Math.PI]}
        />
        <meshStandardMaterial
          color="#477b88"
          roughness={0.75}
          side={THREE.DoubleSide}
        />
      </mesh>
      {[-2.3, -1.15, 0, 1.15, 2.3].map((z) => (
        <mesh
          key={z}
          position={[0, 2.72, z]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <cylinderGeometry
            args={[2.94, 2.94, 0.09, 12, 1, true, Math.PI / 2, Math.PI]}
          />
          <meshStandardMaterial color="#91a59b" side={THREE.DoubleSide} />
        </mesh>
      ))}
      <Door z={2.51} color="#3a5259" />
      {[-1.85, 1.85].map((x) => (
        <Window key={x} p={[x, 1.8, 2.43]} width={0.9} />
      ))}
      <group position={[0, 4, 2.67]}>
        <Cylinder s={[0.1, 2.7, 0.1]} r={[0, 0, Math.PI / 2]} c="#d7caa9" />
        {[-1, 1].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <Cylinder
              s={[0.5, 0.24, 0.5]}
              r={[0, 0, Math.PI / 2]}
              c="#344e55"
            />
            <Cylinder
              p={[x * 0.17, 0, 0]}
              s={[0.35, 0.18, 0.35]}
              r={[0, 0, Math.PI / 2]}
              c="#d5b76c"
            />
          </group>
        ))}
      </group>
      <Steps z={2.8} width={2.3} />
    </group>
  );
}
