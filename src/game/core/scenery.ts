// Deterministic tree trunks are shared by scenery and collision/pathfinding.
import { WORLD_ELLIPSE } from "../../shared/world-bounds";
import {
  isKoreaGardenWalk,
  isKoreaLandmarkArea,
  KOREA_LANDMARK_CANOPY_CLEARANCE,
} from "./koreaLandmarks";

export type GroundFootprint = readonly [
  x: number,
  z: number,
  width: number,
  depth: number,
];

export function grassSites(avoid: readonly GroundFootprint[]) {
  const sites: { x: number; z: number; variant: number }[] = [];
  for (let i = 0; i < 650; i++) {
    const a = i * 2.399963,
      r = Math.sqrt((i + 1) / 650),
      x = Math.cos(a) * 46 * r,
      z = Math.sin(a) * 39 * r;
    if (
      Math.abs(x) < 2.5 ||
      Math.abs(z - 10) < 2.5 ||
      Math.abs(z + 9) < 2.5 ||
      Math.abs(z - 29) < 2.5 ||
      Math.abs(Math.abs(x) - 34) < 2
    )
      continue;
    for (let j = 0; j < 3; j++) {
      const bladeX = x + j * 0.16,
        bladeZ = z + (j % 2) * 0.15;
      if (
        avoid.some(
          ([cx, cz, width, depth]) =>
            Math.abs(bladeX - cx) <= width / 2 + 0.12 &&
            Math.abs(bladeZ - cz) <= depth / 2 + 0.12,
        )
      )
        continue;
      sites.push({ x: bladeX, z: bladeZ, variant: i });
    }
  }
  return sites;
}

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
      (x > 36 && x < 50 && z > -28 && z < -13) ||
      (x > -70 && x < -30 && z > 33 && z < 68) ||
      (x > -28 && x < -10 && z > -47 && z < -28) ||
      (x > -81 && x < -69 && z > 8 && z < 16) ||
      (x > 25 && x < 66 && z > 20 && z < 45) ||
      (x > 47 && x < 69 && z > 42 && z < 63)
    ),
);

export const koreaForest = forest.filter(
  ({ x, z }) =>
    !isKoreaLandmarkArea(x, z, KOREA_LANDMARK_CANOPY_CLEARANCE) &&
    !isKoreaGardenWalk(x, z, 0.6),
);
