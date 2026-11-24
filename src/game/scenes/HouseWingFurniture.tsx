import type { ReactNode } from "react";
import { Ball, Box, Cylinder, Ring } from "../world/Models";
import { CraftedBox } from "./CraftedDetails";
import { Bottle, Stool } from "./InteriorProps";

type Placement = { p: [number, number, number]; rotation?: number };

function TimberRack({ children }: { children: ReactNode }) {
  return (
    <group>
      {[-1.7, 1.7].map((x) => (
        <CraftedBox key={x} p={[x, 1.5, 0]} s={[0.16, 3, 0.8]} c="#65472f" />
      ))}
      <CraftedBox p={[0, 1.5, -0.37]} s={[3.5, 3, 0.13]} c="#3f4537" />
      {[0.2, 1.12, 2.04, 3].map((y) => (
        <CraftedBox key={y} p={[0, y, 0]} s={[3.6, 0.16, 0.9]} c="#a27843" />
      ))}
      {children}
    </group>
  );
}

export function Bookcase({ p, rotation = 0 }: Placement) {
  return (
    <group position={p} rotation={[0, rotation, 0]}>
      <TimberRack>
        {[0, 1, 2].flatMap((row) =>
          Array.from({ length: 6 }, (_, i) => (
            <group
              key={`${row}-${i}`}
              position={[-1.25 + i * 0.45, 0.3 + row * 0.92, 0]}
            >
              <CraftedBox
                p={[0, 0.32, 0]}
                s={[0.27 + (i % 2) * 0.08, 0.62 + (i % 3) * 0.06, 0.56]}
                c={["#83483d", "#406653", "#b48b49", "#465a6e"][(i + row) % 4]}
                r={[0, 0, i === 5 ? -0.12 : 0]}
              />
              <Box p={[0, 0.42, 0.29]} s={[0.17, 0.035, 0.025]} c="#d1ad66" />
            </group>
          )),
        )}
      </TimberRack>
    </group>
  );
}

export function SupplyRack({ p, rotation = 0 }: Placement) {
  return (
    <group position={p} rotation={[0, rotation, 0]}>
      <TimberRack>
        {[0, 1, 2].flatMap((row) =>
          [-1.1, 0, 1.1].map((x, index) => (
            <group key={`${row}-${x}`} position={[x, 0.28 + row * 0.92, 0]}>
              {row === 0 ? (
                <>
                  <Ball p={[0, 0.3, 0]} s={[0.4, 0.36, 0.3]} c="#bda478" />
                  <Ring
                    p={[0, 0.6, 0]}
                    radius={0.13}
                    tube={0.035}
                    c="#725535"
                  />
                </>
              ) : (
                <>
                  <Cylinder
                    p={[0, 0.28, 0]}
                    s={[0.27, 0.56, 0.27]}
                    c={["#809574", "#b98954", "#bfba8c"][(index + row) % 3]}
                  />
                  <Cylinder
                    p={[0, 0.58, 0]}
                    s={[0.29, 0.08, 0.29]}
                    c="#775638"
                  />
                </>
              )}
            </group>
          )),
        )}
      </TimberRack>
    </group>
  );
}

export function DiningSet({ p, rotation = 0 }: Placement) {
  return (
    <group position={p} rotation={[0, rotation, 0]}>
      <Cylinder p={[0, 0.13, 0]} s={[0.65, 0.22, 0.65]} c="#5e4530" />
      <Cylinder p={[0, 0.65, 0]} s={[0.18, 1, 0.18]} c="#896338" />
      <Cylinder p={[0, 1.18, 0]} s={[1.42, 0.22, 1.42]} c="#8e6138" />
      <Cylinder p={[0, 1.31, 0]} s={[1.35, 0.07, 1.35]} c="#bc945d" />
      {[0, 1, 2, 3].map((i) => {
        const angle = (i * Math.PI) / 2;
        const x = Math.sin(angle),
          z = Math.cos(angle);
        return (
          <group key={i}>
            <Stool p={[x * 2.1, 0, z * 2.1]} color="#934e3c" />
            <Cylinder
              p={[x * 0.88, 1.38, z * 0.88]}
              s={[0.3, 0.055, 0.3]}
              c="#d7d0b4"
            />
            <Cylinder
              p={[x * 0.88, 1.42, z * 0.88]}
              s={[0.21, 0.025, 0.21]}
              c="#b6ba9f"
            />
          </group>
        );
      })}
      <Bottle p={[0, 1.37, 0]} color="#567959" />
    </group>
  );
}

export function RecordCabinet({ p, rotation = 0 }: Placement) {
  return (
    <group position={p} rotation={[0, rotation, 0]}>
      <CraftedBox p={[0, 0.58, 0]} s={[3.4, 1.16, 1.05]} c="#61452f" />
      <CraftedBox p={[0, 1.21, 0]} s={[3.6, 0.16, 1.2]} c="#ae8044" />
      {[-1, 1].map((x) => (
        <CraftedBox
          key={x}
          p={[x * 0.84, 0.62, 0.55]}
          s={[1.45, 0.85, 0.07]}
          c="#876240"
        />
      ))}
      <CraftedBox p={[-0.55, 1.36, 0]} s={[1.35, 0.17, 0.86]} c="#35473d" />
      <Cylinder p={[-0.67, 1.48, 0]} s={[0.35, 0.055, 0.35]} c="#252f2e" />
      <Cylinder p={[-0.67, 1.52, 0]} s={[0.1, 0.035, 0.1]} c="#b98b45" />
      <Box
        p={[-0.16, 1.52, 0.12]}
        s={[0.48, 0.045, 0.045]}
        c="#c7af73"
        r={[0, -0.45, 0]}
      />
      {[0, 1, 2, 3].map((i) => (
        <CraftedBox
          key={i}
          p={[0.9, 1.34 + i * 0.065, 0]}
          s={[0.67, 0.055, 0.67]}
          c={["#8c4c3d", "#c4b17d", "#4b695b", "#42586b"][i]}
          r={[0, i * 0.1, 0]}
        />
      ))}
    </group>
  );
}
