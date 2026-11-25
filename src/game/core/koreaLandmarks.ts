import { KOREA_MARKET, KOREA_PICNIC } from "./koreaDistrict";

export const KOREA_MAIN_STREET_Z = -14.4;
export const KOREA_STREET_BUILDINGS = {
  theater: [-8, KOREA_MAIN_STREET_Z - 5.2],
  cognition: [4.5, KOREA_MAIN_STREET_Z - 5.25],
  photo: [12, KOREA_MAIN_STREET_Z - 2.6],
} as const;

const namsan = {
  id: "namsan",
  name: "N Seoul Tower",
  origin: [-35, -30.6],
  approach: [-35, -27.1],
  height: 26.6,
} as const;
const palace = {
  id: "gwanghwamun",
  name: "Gyeongbokgung",
  origin: [-22, KOREA_MAIN_STREET_Z - 5.2],
  approach: [-22, KOREA_MAIN_STREET_Z],
  height: 7.6,
} as const;
const village = {
  id: "bukchon",
  name: "Bukchon Hanok Village",
  origin: [-40, KOREA_MAIN_STREET_Z],
  approach: [-32.7, KOREA_MAIN_STREET_Z],
  height: 3.8,
} as const;
const sejong = {
  id: "sejong",
  name: "King Sejong Statue",
  origin: [-18.8, -2.4],
  approach: [-18.8, 1.1],
  height: 5.6,
} as const;

export const KOREA_LANDMARKS = { namsan, palace, village, sejong };
export const KOREA_MAIN_STREET = [7.5, KOREA_MAIN_STREET_Z, 81, 3.2] as const;
export const KOREA_GARDEN_WALKS = [
  KOREA_MAIN_STREET,
  [-50.6, KOREA_MAIN_STREET_Z, 6.8, 2.4],
  [-54, -1.2, 2.4, 26.4],
  [-29.6, -20.75, 2.2, 12.7],
  [-27, -27.1, 16, 2.4],
  [-19, -28.55, 2.4, 2.9],
  [15, -27.1, 68, 2.4],
  [49, -20.75, 2.4, 12.7],
  [-23.5, -1.875, 2.6, 25.05],
  [21, 2.15, 2.4, 33.1],
  [49, 1.5, 3, 31.8],
  [35, -10, 30, 2.6],
  [-26, 34, 22, 2.4],
] as const;

export function isKoreaGardenWalk(x: number, z: number, mx = 0, mz = mx) {
  return KOREA_GARDEN_WALKS.some(
    ([cx, cz, width, depth]) =>
      Math.abs(x - cx) <= width / 2 + mx && Math.abs(z - cz) <= depth / 2 + mz,
  );
}
export const KOREA_LANDMARK_DESTINATIONS = [
  namsan,
  palace,
  village,
  sejong,
].map(({ id, name, origin: [cx, cz], approach: [x, z], height }) => ({
  id,
  name,
  x,
  z,
  anchor: [cx, height, cz] as const,
}));

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
  [...sejong.origin, 2.05, 1.7],
  ...BUKCHON_HOMES.map(([x, z]) => [bx + x, bz + z, 2.3, 1.15] as const),
] as const;

const reserves = [
  [...namsan.origin, 3, 4.4],
  [...palace.origin, 8, 6],
  [...village.origin, 8, 4.3],
  [...KOREA_STREET_BUILDINGS.theater, 5.3, 4.3],
  [...KOREA_STREET_BUILDINGS.cognition, 5.6, 4.2],
  [...KOREA_STREET_BUILDINGS.photo, 1.7, 1.6],
  ...KOREA_MARKET.stalls.map((x) => [x, KOREA_MARKET.z, 4.9, 3.4] as const),
  [...KOREA_PICNIC, 10.5, 7.7],
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
