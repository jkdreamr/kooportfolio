import * as THREE from "three";
import { WorldSceneryParts, beam, type SceneryPart } from "./WorldSceneryParts";

const steel = "#667b76";
const parts: SceneryPart[] = [
  { p: [0, -0.09, 0], s: [7.4, 0.6, 42], c: "#777b78" },
  { p: [0, 0.223, 0], s: [5.25, 0.025, 42], c: "#5c6365", shape: "block" },
];
// A low crossing keeps the actual walking surface at the world's ground plane.
// Twin shallow steel arches recall Hangang crossings, not a literal replica.
for (const side of [-1, 1]) {
  const x = side * 3.62;
  parts.push({ p: [side * 3.2, 0.27, 0], s: [0.85, 0.09, 42], c: "#b5b4a5" });
  parts.push({ p: [side * 3.62, 1.22, 0], s: [0.12, 0.12, 42], c: steel });
  parts.push({ p: [side * 3.62, 0.77, 0], s: [0.07, 0.07, 42], c: steel });
  for (let z = -20; z <= 20; z += 2) {
    parts.push({ p: [side * 3.62, 0.73, z], s: [0.09, 1.02, 0.09], c: steel });
  }
  for (let span = 0; span < 3; span++) {
    const center = -14 + span * 14;
    for (let i = 0; i < 12; i++) {
      const t1 = (i / 12) * Math.PI;
      const t2 = ((i + 1) / 12) * Math.PI;
      beam(
        parts,
        new THREE.Vector3(
          x,
          0.5 + Math.sin(t1) * 4.5,
          center - 7 + (i / 12) * 14,
        ),
        new THREE.Vector3(
          x,
          0.5 + Math.sin(t2) * 4.5,
          center - 7 + ((i + 1) / 12) * 14,
        ),
        0.23,
        steel,
      );
      if (i > 0 && i % 2 === 0) {
        const z = center - 7 + (i / 12) * 14;
        beam(
          parts,
          new THREE.Vector3(x, 0.5, z),
          new THREE.Vector3(x, 0.5 + Math.sin(t1) * 4.5, z),
          0.09,
          "#83958e",
        );
      }
    }
  }
}
for (const z of [-21, -7, 7, 21]) {
  parts.push({ p: [0, -1.8, z], s: [6.8, 3.4, 1.25], c: "#858c88" });
  parts.push({ p: [0, -0.7, z], s: [7.6, 0.4, 1.7], c: "#a5aaa3" });
}
for (let z = -19; z < 21; z += 3.5) {
  parts.push({
    p: [0, 0.242, z],
    s: [0.09, 0.012, 1.5],
    c: "#d5c898",
    shape: "block",
  });
}

/** East-west crossing: x26..64 / z30.3..37.7, deck y=.24.
 * World owns collision; only the rails and adjacent river are blocked.
 */
export function HanRiverBridge() {
  return (
    <group
      position={[45, 0, 34]}
      rotation={[0, Math.PI / 2, 0]}
      scale={[1, 1, 38 / 42]}
      name="han-river-bridge"
    >
      <WorldSceneryParts parts={parts} />
    </group>
  );
}
