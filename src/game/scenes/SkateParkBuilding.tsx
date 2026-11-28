import { StaticBatch } from "../world/StaticBatch";
import { SkateParkTerrain } from "./SkateParkTerrain";

/** Hub model only. The full-size 32×24 parcel is positioned by the world layout. */
export function SkateParkBuilding({
  position = [-50, 0, 50],
  rotation = 0,
}: {
  position?: [number, number, number];
  rotation?: number;
}) {
  return (
    <StaticBatch id="SkateParkBuilding">
      <group
        position={position}
        rotation={[0, rotation, 0]}
        scale={[1.42, 1, 0.9]}
      >
        <SkateParkTerrain detailed={false} />
      </group>
    </StaticBatch>
  );
}
