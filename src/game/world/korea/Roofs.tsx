import { roofTiled, type Roof } from "./kit";

/** Individual roof meshes; the surrounding StaticBatch merges them. */
export function Roofs({ roofs }: { roofs: readonly Roof[] }) {
  return roofs.map(({ p, s, rotY = 0, geometry }, i) => (
    <mesh
      key={i}
      position={p}
      rotation-y={rotY}
      // A rotated roof keeps `s` in world axes: its ridge runs along z.
      scale={rotY ? [s[2], s[1], s[0]] : s}
      geometry={geometry}
      material={roofTiled}
      castShadow
      receiveShadow
      dispose={null}
    />
  ));
}
