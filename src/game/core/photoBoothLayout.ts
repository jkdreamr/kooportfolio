export const PHOTO_BOOTH_ORIGIN = [-6, 0, -6.2] as const;
export const PHOTO_BOOTH_FRONT = 1.3;
const [x, , z] = PHOTO_BOOTH_ORIGIN;
export const PHOTO_BOOTH_ENTRY = [x, z + PHOTO_BOOTH_FRONT + 0.45] as const;
export const PHOTO_BOOTH_OBSTACLES = [
  [x - 1.5, z, 0.1, 1.4],
  [x + 1.5, z, 0.1, 1.4],
  [x, z - 1.3, 1.5, 0.15],
  [x - 1.04, z + PHOTO_BOOTH_FRONT, 0.34, 0.07],
  [x + 1.04, z + PHOTO_BOOTH_FRONT, 0.34, 0.07],
] as const;

export function isNearPhotoBooth(px: number, pz: number) {
  return Math.abs(px - x) < 0.85 && pz > z - 0.9 && pz < z + 2.55;
}
