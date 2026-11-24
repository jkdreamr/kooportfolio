const namsan = {
  id: "namsan",
  name: "N Seoul Tower",
  origin: [-28, -48],
  approach: [-28, -44.5],
  height: 26.6,
} as const;
const palace = {
  id: "gwanghwamun",
  name: "Gyeongbokgung",
  origin: [-48, -24],
  approach: [-48, -18.8],
  height: 7.6,
} as const;
const village = {
  id: "bukchon",
  name: "Bukchon Hanok Village",
  origin: [-59, -5],
  approach: [-51.7, -5],
  height: 3.8,
} as const;

export const KOREA_LANDMARKS = { namsan, palace, village };
export const KOREA_GARDEN_WALKS = [
  [-24.4, -14.4, 45, 2.4],
  [-26.7, -24.05, 2.6, 16.9],
  [-23.5, -1.425, 2.6, 23.55],
  [-69, 23.25, 2.4, 22.5],
  [-42, 33.5, 54, 2.4],
  [-44, 38.25, 2.4, 9.5],
] as const;

export function isKoreaGardenWalk(x: number, z: number, mx = 0, mz = mx) {
  return KOREA_GARDEN_WALKS.some(
    ([cx, cz, width, depth]) =>
      Math.abs(x - cx) <= width / 2 + mx && Math.abs(z - cz) <= depth / 2 + mz,
  );
}
export const KOREA_LANDMARK_DESTINATIONS = [namsan, palace, village].map(
  ({ id, name, origin: [cx, cz], approach: [x, z], height }) => ({
    id,
    name,
    x,
    z,
    anchor: [cx, height, cz] as const,
  }),
);

export const BUKCHON_HOMES = [
  [-3.2, -2.6, false],
  [2.9, -2.6, false],
  [-3.65, 2.6, true],
  [2.4, 2.6, true],
] as const;

const [bx, bz] = village.origin;
export const KOREA_LANDMARK_SOLIDS = [
  [...namsan.origin, 2.1, 2.1],
  [...palace.origin, 6.2, 2.45],
  ...BUKCHON_HOMES.map(([x, z]) => [bx + x, bz + z, 2.3, 1.15] as const),
] as const;

const reserves = [
  [...namsan.origin, 3, 4.4],
  [namsan.origin[0], namsan.origin[1] + 7.8, 1.2, 4.7],
  [...palace.origin, 8, 6],
  [...village.origin, 8, 4.3],
] as const;
export const KOREA_LANDMARK_FOOTPRINTS = reserves.map(
  ([x, z, hx, hz]) => [x, z, hx * 2, hz * 2] as const,
);

export function isKoreaLandmarkArea(x: number, z: number, margin = 0) {
  return reserves.some(
    ([cx, cz, hx, hz]) =>
      Math.abs(x - cx) <= hx + margin && Math.abs(z - cz) <= hz + margin,
  );
}

export const KOREA_LANDMARK_CANOPY_CLEARANCE = 1.8;
