// Deterministic tree trunks are shared by scenery and collision/pathfinding.
import { WORLD_ELLIPSE } from "../../shared/world-bounds";
export const forest = Array.from({ length: 160 }, (_, i) => {
  const a = i * 2.399963,
    r = 0.72 + ((i * 23) % 19) / 100;
  return {
    x: Math.cos(a) * (WORLD_ELLIPSE.radiusX - 0.5) * r,
    z: Math.sin(a) * (WORLD_ELLIPSE.radiusZ - 0.5) * r + WORLD_ELLIPSE.centerZ,
    height: 3.2 + (i % 5) * 0.6,
  };
}).filter(
  ({ x, z }) =>
    !(
      (x > -4 && x < 44 && z > 19 && z < 73) ||
      (x > -34 && x < -18 && z > 35 && z < 49) ||
      (x > -45 && x < -31 && z > -46 && z < -32) ||
      (x > -66 && x < -56 && z > 8 && z < 16) ||
      (x > -50 && x < -34 && z > -27 && z < -12) ||
      (x > -48 && x < -35 && z > 13 && z < 26) ||
      (Math.abs(x) < 7 && z > -52 && z < -38) ||
      (x > 36 && x < 50 && z > -28 && z < -13)
    ),
);
